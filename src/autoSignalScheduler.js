import { getEnv } from "./config.js";
import { generateSignalRun } from "./executor.js";
import { fetchQuote, isSessionExpiredError } from "./kiteApi.js";
import { loadRuntimeCandles } from "./marketData.js";
import { notifyTradeableSignal } from "./notify.js";
import { persistRunArtifact } from "./reporters.js";
import { isTradeSessionOpen } from "./marketCalendar.js";
import { ensureDir, writeJson } from "./utils.js";
import { buildPaperEntryGuard } from "./tradingDeskPolicy.js";
import { listClosedPositions, listOpenPositions } from "./positionManager.js";
import fs from "node:fs";
import path from "node:path";

function getBoolEnv(name, fallback = false) {
  const v = getEnv(name, "");
  if (v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

function getIntervalMs() {
  const minutes = Number(getEnv("AUTO_SIGNALS_INTERVAL_MINUTES", "15"));
  const safe = Number.isFinite(minutes) && minutes >= 1 ? minutes : 15;
  return safe * 60 * 1000;
}

function schedulerStatePath(config) {
  return path.join(config.runtimeDir, "auto-signals-scheduler-state.json");
}

function loadSchedulerState(config) {
  const p = schedulerStatePath(config);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { lastRunAt: null, lastSpotAtRun: null, history: [] };
  }
}

function saveSchedulerState(config, state) {
  ensureDir(config.runtimeDir);
  const next = {
    ...state,
    history: (state.history ?? []).slice(-120)
  };
  writeJson(schedulerStatePath(config), next);
}

/**
 * One pass: during market hours, refresh live candles and persist signals-latest.json.
 * @returns {Promise<{ ran: boolean, skipped?: string, error?: string }>}
 */
export async function runAutoSignalPass(config, options = {}) {
  const { skipMarketHoursCheck = false, reason = "scheduled" } = options;
  const nowIso = new Date().toISOString();

  if (!skipMarketHoursCheck && !isTradeSessionOpen(nowIso, config)) {
    return { ran: false, skipped: "outside_market_hours" };
  }

  let candleResult;
  try {
    candleResult = await loadRuntimeCandles(config, { allowSampleFallback: false });
  } catch (error) {
    const sessionExpired = isSessionExpiredError(error);
    const state = loadSchedulerState(config);
    state.lastError = {
      at: nowIso,
      message: error.message,
      type: sessionExpired ? "session_expired" : "candle_fetch"
    };
    saveSchedulerState(config, state);
    return { ran: false, error: error.message, sessionExpired };
  }

  if (candleResult.skipped || !candleResult.candles?.length) {
    return {
      ran: false,
      skipped: "no_live_candles",
      detail: candleResult.reason || "No candles"
    };
  }

  try {
    const runOptions = { enableLiveBrokerData: candleResult.source === "live" };
    const result = await generateSignalRun(candleResult.candles, config, runOptions);
    persistRunArtifact(config, "signals", result);

    const state = loadSchedulerState(config);
    const entry = {
      at: nowIso,
      reason,
      direction: result.signal?.direction,
      status: result.signal?.status,
      score: result.signal?.score,
      spot: result.signal?.spotPrice,
      option: result.signal?.option?.tradingsymbol,
      source: candleResult.source
    };
    state.lastRunAt = nowIso;
    state.lastSpotAtRun = result.signal?.spotPrice ?? null;
    state.history = [...(state.history ?? []), entry];
    saveSchedulerState(config, state);

    const positions = {
      open: listOpenPositions(config),
      closed: listClosedPositions(config)
    };
    const deskGuard = buildPaperEntryGuard(config, positions);
    if (deskGuard.blocked) {
      console.warn(`[auto-signals] notify skipped (desk): ${deskGuard.reasons.join(" ")}`);
      return { ran: true, entry, notifySkipped: deskGuard.reasons };
    }

    await notifyTradeableSignal(config, result.signal);

    return { ran: true, entry };
  } catch (error) {
    return { ran: false, error: error.message };
  }
}

function shouldRunByInterval(state, intervalMs, now) {
  if (!state.lastRunAt) return true;
  return now - new Date(state.lastRunAt).getTime() >= intervalMs;
}

/**
 * @param {{ config: object, onAfterRun?: () => void | Promise<void> }} params
 */
export function startAutoSignalScheduler({ config, onAfterRun }) {
  const intervalMs = getIntervalMs();
  let lastMarketOpen = isTradeSessionOpen(new Date().toISOString(), config);
  let timer = null;

  const tick = async () => {
    const nowDate = new Date();
    const nowIso = nowDate.toISOString();
    const open = isTradeSessionOpen(nowIso, config);
    const justOpened = open && !lastMarketOpen;
    lastMarketOpen = open;

    if (!open) {
      return;
    }

    const state = loadSchedulerState(config);
    const intervalDue =
      justOpened || shouldRunByInterval(state, intervalMs, nowDate.getTime());

    let moveEarly = false;
    const moveThresholdPct = Number(getEnv("AUTO_SIGNALS_SPOT_MOVE_PCT", "0"));
    if (
      !intervalDue &&
      moveThresholdPct > 0 &&
      config.zerodha.apiKey &&
      config.zerodha.accessToken &&
      state.lastSpotAtRun
    ) {
      try {
        const key = `${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`;
        const map = await fetchQuote(config, [key]);
        const spot = map[key]?.last_price;
        if (spot && state.lastSpotAtRun) {
          const pct =
            (Math.abs(spot - state.lastSpotAtRun) / state.lastSpotAtRun) * 100;
          moveEarly = pct >= moveThresholdPct;
        }
      } catch {
        /* ignore quote errors */
      }
    }

    if (!intervalDue && !moveEarly) {
      return;
    }

    const reason = justOpened
      ? "market_open"
      : moveEarly
        ? "spot_move"
        : "interval";

    const outcome = await runAutoSignalPass(config, {
      skipMarketHoursCheck: true,
      reason
    });

    if (outcome.ran) {
      console.log(
        `[auto-signals] ${outcome.entry.at} ${outcome.entry.direction} score=${outcome.entry.score} spot=${outcome.entry.spot}`
      );
    } else if (outcome.sessionExpired) {
      console.warn(`[auto-signals] SESSION EXPIRED — re-login required. ${outcome.error}`);
    } else if (outcome.error) {
      console.warn(`[auto-signals] error: ${outcome.error}`);
    } else if (outcome.skipped === "no_live_candles") {
      console.warn(`[auto-signals] skipped: ${outcome.detail ?? outcome.skipped}`);
    }

    if (outcome.ran && typeof onAfterRun === "function") {
      try {
        await onAfterRun();
      } catch (e) {
        console.warn("[auto-signals] onAfterRun:", e.message);
      }
    }
  };

  void tick();
  timer = setInterval(() => {
    void tick();
  }, Math.min(intervalMs, 60_000));

  return () => {
    if (timer) clearInterval(timer);
  };
}

export function isAutoSignalsEnabled() {
  return getBoolEnv("AUTO_SIGNALS_ENABLED", false);
}
