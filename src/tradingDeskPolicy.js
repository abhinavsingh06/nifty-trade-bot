import path from "node:path";
import { readJson, writeJson } from "./utils.js";
import { getEnv } from "./config.js";
import { tradingDateKeyIST } from "./tradingDayJournal.js";

function envFlagOn(name) {
  const v = String(getEnv(name, "")).toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
}

export function deskNoNewEntriesPath(config) {
  return path.join(config.runtimeDir, "desk-no-new-entries.json");
}

export function readDeskNoNewEntriesFile(config) {
  return readJson(deskNoNewEntriesPath(config), { enabled: false });
}

export function isNoNewEntriesActive(config) {
  if (envFlagOn("NO_NEW_ENTRIES")) {
    return { active: true, source: "env" };
  }
  const file = readDeskNoNewEntriesFile(config);
  if (file.enabled) {
    return { active: true, source: "runtime", updatedAt: file.updatedAt ?? null };
  }
  return { active: false, source: null };
}

export function setDeskNoNewEntriesRuntime(config, enabled) {
  const payload = {
    enabled: Boolean(enabled),
    updatedAt: new Date().toISOString()
  };
  writeJson(deskNoNewEntriesPath(config), payload);
  return payload;
}

function closedAtDateKey(iso, config) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.marketTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso));
}

function isPaperDeskClose(p) {
  if (p.brokerMode === "live") return false;
  return p.brokerMode === "paper" || p.brokerMode == null;
}

function pnlForClosedPaper(p) {
  const qty = Number(p.quantity ?? 0);
  const entry = p.entryOptionPrice != null ? Number(p.entryOptionPrice) : null;
  const exitRaw =
    p.exit?.optionPrice ?? p.exit?.optionFillPrice ?? p.exit?.fillPrice ?? null;
  const exit = exitRaw != null ? Number(exitRaw) : null;
  if (entry == null || exit == null || !Number.isFinite(qty) || qty <= 0) return null;
  return Number(((exit - entry) * qty).toFixed(2));
}

export function paperClosedTradesToday(config, positions) {
  const dateKey = tradingDateKeyIST(config);
  return (positions?.closed ?? []).filter((c) => {
    if (!c.closedAt || !isPaperDeskClose(c)) return false;
    return closedAtDateKey(c.closedAt, config) === dateKey;
  });
}

export function buildPaperCooldownGuard(config, positions) {
  const maxLosses = Number(config.paperCooldownLossCountToday ?? 0);
  const maxDailyLoss = Number(config.paperCooldownMaxDailyLossRupees ?? 0);
  const closed = paperClosedTradesToday(config, positions);
  let lossCount = 0;
  let dayPnl = 0;
  for (const c of closed) {
    const pnl = pnlForClosedPaper(c);
    if (pnl == null) continue;
    dayPnl = Number((dayPnl + pnl).toFixed(2));
    if (pnl < 0) lossCount += 1;
  }
  const stats = { lossCountToday: lossCount, realizedPnlToday: dayPnl };
  if (maxLosses > 0 && lossCount >= maxLosses) {
    return {
      blocked: true,
      reason: `Paper cooldown: ${lossCount} losing close(s) today (limit ${maxLosses}).`,
      stats
    };
  }
  if (maxDailyLoss > 0 && dayPnl <= -maxDailyLoss) {
    return {
      blocked: true,
      reason: `Paper cooldown: today's realized paper P&L is ${dayPnl.toFixed(0)} (floor −${maxDailyLoss}).`,
      stats
    };
  }
  return { blocked: false, reason: null, stats };
}

export function buildPaperEntryGuard(config, positions) {
  const noNew = isNoNewEntriesActive(config);
  const cooldown = buildPaperCooldownGuard(config, positions);
  const reasons = [];
  if (noNew.active) {
    reasons.push(
      noNew.source === "env"
        ? "New entries disabled (NO_NEW_ENTRIES)."
        : "New entries disabled (runtime kill-switch)."
    );
  }
  if (cooldown.blocked && cooldown.reason) {
    reasons.push(cooldown.reason);
  }
  return {
    blocked: noNew.active || cooldown.blocked,
    reasons,
    noNewEntries: noNew,
    cooldown
  };
}

export function assertPaperEntryAllowed(config, positions) {
  const guard = buildPaperEntryGuard(config, positions);
  if (guard.blocked) {
    throw new Error(guard.reasons.join(" "));
  }
}

/** Kill-switch applies to any mode; paper mode also enforces loss / daily PnL cooldown. */
export function assertAutotradeEntryAllowed(config, positions) {
  const noNew = isNoNewEntriesActive(config);
  if (noNew.active) {
    throw new Error(
      noNew.source === "env"
        ? "New entries disabled (NO_NEW_ENTRIES)."
        : "New entries disabled (runtime kill-switch)."
    );
  }
  if (config.botMode === "paper") {
    const cooldown = buildPaperCooldownGuard(config, positions);
    if (cooldown.blocked) {
      throw new Error(cooldown.reason);
    }
  }
}
