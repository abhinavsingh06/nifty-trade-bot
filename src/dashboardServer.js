import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { generateAiAnalysis } from "./aiAnalysis.js";
import { getConfig, getEnv } from "./config.js";
import { buildCryptoDashboardPayload, updateCryptoVerification } from "./cryptoStudyEngine.js";
import { buildPaperWalletSnapshot, resetPaperWalletToConfig } from "./paperWallet.js";
import { exchangeRequestToken, fetchProfile, fetchQuote, getLoginUrl } from "./kiteApi.js";
import { loadRuntimeCandles } from "./marketData.js";
import {
  checkSessionRun,
  createPaperTradeFromSuggestion,
  exitPaperPositionNow,
  exitPaperPositionPartial,
  calculateMaxPain,
  fetchCallPutAtmPremiums,
  fetchIndiaVix,
  fetchMultiTimeframeSignals,
  fetchOptionChainOI,
  fetchStrikeLadderPremiums
} from "./executor.js";
import { buildPaperAnalytics } from "./paperAnalytics.js";
import { buildActionableSuggestions, buildTradeSuggestions, fetchMarketNews, summarizeNews } from "./newsEngine.js";
import { buildOpeningContext } from "./sessionContext.js";
import { isAutoSignalsEnabled, startAutoSignalScheduler } from "./autoSignalScheduler.js";
import { isTradeSessionOpen } from "./marketCalendar.js";
import {
  appendDayJournal,
  buildTradingDayContext,
  buildTradingDayExport,
  countPaperBuysToday,
  tradingDateKeyIST
} from "./tradingDayJournal.js";
import { buildPaperEntryGuard, setDeskNoNewEntriesRuntime } from "./tradingDeskPolicy.js";
import { persistRunArtifact } from "./reporters.js";
import { readJson } from "./utils.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "dashboard-dist");

let sessionHealthCache = { at: 0, value: null };
let sessionHealthTokenKey = "";

// Multi-timeframe cache (refreshes every 5 minutes)
let multiTfCache = { at: 0, data: null };
const MULTI_TF_TTL = 5 * 60 * 1000;

// India VIX cache (refreshes every 30 seconds)
let vixCache = { at: 0, value: null };
const VIX_TTL = 30 * 1000;

function invalidateSessionHealthCache() {
  sessionHealthCache = { at: 0, value: null };
}

async function getSessionHealthSnapshot(config) {
  const tokenNow = config.zerodha.accessToken || "";
  if (tokenNow !== sessionHealthTokenKey) {
    sessionHealthTokenKey = tokenNow;
    invalidateSessionHealthCache();
  }

  const ttl = Math.max(5000, Number(config.sessionHealthTtlMs) || 60_000);
  const now = Date.now();
  if (!config.zerodha.apiKey || !config.zerodha.accessToken) {
    return {
      ok: false,
      mode: "no_credentials",
      message: "Zerodha API key or access token missing — connect from the dashboard or update .env.",
      checkedAt: new Date().toISOString()
    };
  }
  if (now - sessionHealthCache.at < ttl && sessionHealthCache.value) {
    return sessionHealthCache.value;
  }
  try {
    const profile = await fetchProfile(config);
    const v = {
      ok: true,
      mode: "kite",
      checkedAt: new Date().toISOString(),
      profile: profile
        ? {
            userId: profile.user_id,
            userName: profile.user_name,
            email: profile.email,
            broker: profile.broker
          }
        : null
    };
    sessionHealthCache = { at: now, value: v };
    return v;
  } catch (error) {
    const v = {
      ok: false,
      mode: "kite",
      message: error.message ?? "Session check failed",
      checkedAt: new Date().toISOString()
    };
    sessionHealthCache = { at: now, value: v };
    return v;
  }
}
const PORT = Number(process.env.DASHBOARD_PORT || 3020);
const HOST = process.env.DASHBOARD_HOST || "127.0.0.1";
const ALLOWED_COMMANDS = new Set([
  "signals",
  "tickets",
  "autotrade",
  "monitor",
  "reconcile",
  "backtest",
  "review-forward",
  "check-session",
  "instruments-refresh",
  "smoke",
  "smoke-connect"
]);

function getDashboardBaseUrl(req) {
  const host = req.headers.host || `${HOST}:${PORT}`;
  const protocol =
    req.headers["x-forwarded-proto"] ||
    (host.startsWith("127.0.0.1") || host.startsWith("localhost")
      ? "http"
      : "https");
  return `${protocol}://${host}`;
}

function updateEnvValue(key, value) {
  const envPath = path.join(PROJECT_ROOT, ".env");
  const val = value == null ? "" : String(value);
  const nextLine = `${key}=${val}`;
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = content.length ? content.split("\n") : [];
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyRe = new RegExp(`^\\s*${escapedKey}\\s*=`);
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      return true;
    }
    return !keyRe.test(line);
  });
  kept.push(nextLine);
  fs.writeFileSync(envPath, kept.join("\n") + "\n", "utf8");
  process.env[key] = val;
  if (key === "ZERODHA_ACCESS_TOKEN" || key === "ZERODHA_API_KEY") {
    invalidateSessionHealthCache();
  }
}

function redirectWithMessage(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function csvEscape(value) {
  if (value == null) return "";
  const t = String(value);
  if (/[",\n]/.test(t)) {
    return `"${t.replace(/"/g, '""')}"`;
  }
  return t;
}

function sendFile(res, filePath, contentType) {
  try {
    const body = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "File not found" });
  }
}

function getRuntimePath(fileName) {
  const config = getConfig();
  return path.join(config.runtimeDir, fileName);
}

function getArtifact(name) {
  return readJson(getRuntimePath(name), null);
}

function writeArtifact(name, payload) {
  fs.writeFileSync(getRuntimePath(name), JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function listRuntimeFiles() {
  const config = getConfig();
  try {
    return fs.readdirSync(config.runtimeDir).sort();
  } catch {
    return [];
  }
}

function buildDashboardState() {
  const config = getConfig();
  const positions = readJson(getRuntimePath("positions.json"), { open: [], closed: [] });
  const paperAnalytics = buildPaperAnalytics(positions);
  const tradeState = readJson(getRuntimePath("trade-state.json"), {});
  const deskPolicy = buildPaperEntryGuard(config, positions);
  return {
    generatedAt: new Date().toISOString(),
    config: {
      botMode: config.botMode,
      marketTimezone: config.marketTimezone,
      niftySymbol: config.niftySymbol,
      optionLotSize: config.optionLotSize,
      minSignalScore: config.minSignalScore,
      marketHours: config.marketHours,
      zerodhaRedirectUrl: config.zerodha.redirectUrl,
      tradeDiscipline: config.tradeDiscipline,
      marketSessionStrict: config.marketSessionStrict,
      trailingStopUnderlyingPoints: config.trailingStopUnderlyingPoints,
      monitorRequireTradeSession: config.monitorRequireTradeSession,
      autoSignals: {
        enabled: isAutoSignalsEnabled(),
        intervalMinutes: Number(getEnv("AUTO_SIGNALS_INTERVAL_MINUTES", "15")) || 15,
        spotMovePct: Number(getEnv("AUTO_SIGNALS_SPOT_MOVE_PCT", "0")) || 0
      },
      dailyTradeSlotLimit: config.dailyTradeSlotLimit,
      paperInitialCapital: config.paperTrading.initialCapital,
      paperDefaultLots: config.paperTrading.defaultLots,
      paperMaxTradeRupees: config.paperMaxTradeRupees,
      paperMaxTradePctWallet: config.paperMaxTradePctWallet,
      paperCooldownLossCountToday: config.paperCooldownLossCountToday,
      paperCooldownMaxDailyLossRupees: config.paperCooldownMaxDailyLossRupees,
      dashboardBroadcastMsIdle: config.dashboardBroadcastMsIdle,
      dashboardBroadcastMsOpen: config.dashboardBroadcastMsOpen,
      quoteStaleAfterMs: config.quoteStaleAfterMs,
      orderProduct: config.orderDefaults.product
    },
    runtime: {
      files: listRuntimeFiles(),
      signals: getArtifact("signals-latest.json"),
      tickets: getArtifact("tickets-latest.json"),
      autotrade: getArtifact("autotrade-latest.json"),
      monitor: getArtifact("monitor-latest.json"),
      reconcile: getArtifact("reconcile-latest.json"),
      backtest: getArtifact("backtest-latest.json"),
      validationSummary: getArtifact("validation-summary.json"),
      forwardReview: getArtifact("review-forward-latest.json"),
      forwardTracker: getArtifact("forward-tracker.json") ?? {
        pending: [],
        resolved: []
      },
      paperWallet: getArtifact("paper-wallet.json"),
      session: getArtifact("check-session-latest.json"),
      appliedSuggestion: getArtifact("applied-suggestion.json"),
      aiAnalysis: getArtifact("ai-analysis.json"),
      positions,
      tradeState,
      autoSignalScheduler: readJson(
        path.join(config.runtimeDir, "auto-signals-scheduler-state.json"),
        { lastRunAt: null, lastSpotAtRun: null, history: [] }
      ),
      tradingDay: buildTradingDayContext(config, positions),
      paperAnalytics,
      deskPolicy
    }
  };
}

async function buildPaperTradingPayload(baseState) {
  const config = getConfig();
  const positions = baseState.runtime.positions ?? { open: [], closed: [] };
  const openPositions = positions.open ?? [];
  if (!openPositions.length) {
    return {
      wallet: buildPaperWalletSnapshot(config, openPositions),
      openPositions,
      quoteBulkLastAt: null
    };
  }

  const canUseBroker = config.zerodha.apiKey && config.zerodha.accessToken;
  if (!canUseBroker) {
    return {
      wallet: buildPaperWalletSnapshot(config, openPositions),
      openPositions,
      quoteBulkLastAt: null
    };
  }

  try {
    const quoteKeys = [
      `${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`,
      ...openPositions
        .filter((position) => position.option?.tradingsymbol)
        .map((position) => `${position.option.exchange}:${position.option.tradingsymbol}`)
    ];
    const quoteMap = await fetchQuote(config, quoteKeys);
    const fetchedAt = new Date().toISOString();
    const idxKey = `${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`;
    const enrichedPositions = openPositions.map((position) => {
      const optionKey = position.option?.tradingsymbol
        ? `${position.option.exchange}:${position.option.tradingsymbol}`
        : null;
      return {
        ...position,
        lastObservedSpot: quoteMap[idxKey]?.last_price ?? position.lastObservedSpot,
        lastObservedOptionPrice: optionKey ? quoteMap[optionKey]?.last_price ?? position.lastObservedOptionPrice : position.lastObservedOptionPrice,
        lastQuoteAt: fetchedAt
      };
    });

    return {
      wallet: buildPaperWalletSnapshot(config, enrichedPositions),
      openPositions: enrichedPositions,
      quoteBulkLastAt: fetchedAt
    };
  } catch {
    return {
      wallet: buildPaperWalletSnapshot(config, openPositions),
      openPositions,
      quoteBulkLastAt: null
    };
  }
}

async function buildChartPayload() {
  const config = getConfig();
  const candleResult = await loadRuntimeCandles(config, { allowSampleFallback: true });
  const candles = candleResult.candles.slice(-36).map((candle) => ({
    time: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume
  }));

  const tradeState = readJson(getRuntimePath("trade-state.json"), {});
  const pnlHistory = Object.entries(tradeState)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, value]) => ({
      date,
      realizedPnL: value.realizedPnL ?? 0,
      tradesPlaced: value.tradesPlaced ?? 0
    }));

  return {
    source: candleResult.source,
    note: candleResult.reason,
    candles,
    line: candles.map((candle) => ({
      time: candle.time,
      value: candle.close
    })),
    pnlHistory,
    marketOpenNow: isTradeSessionOpen(new Date().toISOString(), config)
  };
}

async function buildDashboardPayload() {
  const config = getConfig();
  const [base, intelligence, charts, sessionHealth] = await Promise.all([
    Promise.resolve(buildDashboardState()),
    buildTradeIntelligence(),
    buildChartPayload(),
    getSessionHealthSnapshot(config)
  ]);
  const paperTrading = await buildPaperTradingPayload(base);

  return {
    ...base,
    sessionHealth,
    runtime: {
      ...base.runtime,
      positions: {
        ...base.runtime.positions,
        open: paperTrading.openPositions
      },
      paperWallet: paperTrading.wallet,
      quoteBulkLastAt: paperTrading.quoteBulkLastAt ?? null
    },
    intelligence,
    charts
  };
}

async function buildTradeIntelligence() {
  const config = getConfig();
  const signalArtifact = getArtifact("signals-latest.json");
  const signal = signalArtifact?.signal;
  if (!signal) {
    return {
      status: "UNAVAILABLE",
      reason: "Run signals first to generate technical context."
    };
  }

  let marketMove = {
    spot: signal.spotPrice ?? signal.indicators?.latestClose ?? null,
    previousClose: null,
    change: 0,
    changePct: 0,
    source: "signal"
  };

  let indexQuote = null;

  try {
    const quoteMap = await fetchQuote(config, [`${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`]);
    const quote = quoteMap[`${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`];
    indexQuote = quote ?? null;
    if (quote?.last_price) {
      const previousClose = quote.ohlc?.close ?? signal.indicators?.latestClose ?? quote.last_price;
      const change = quote.last_price - previousClose;
      const changePct = previousClose ? (change / previousClose) * 100 : 0;
      marketMove = {
        spot: quote.last_price,
        previousClose,
        change,
        changePct,
        source: "zerodha-quote"
      };
    }
  } catch (error) {
    marketMove.error = error.message;
  }

  const openingContext = buildOpeningContext({
    spot: marketMove.spot,
    previousClose: marketMove.previousClose,
    openPrice: indexQuote?.ohlc?.open ?? null
  });

  let optionPremiums = { call: null, put: null, callOption: null, putOption: null };
  try {
    optionPremiums = await fetchCallPutAtmPremiums(
      config,
      marketMove.spot,
      signal.timestamp || new Date().toISOString()
    );
  } catch (error) {
    optionPremiums = {
      call: null,
      put: null,
      callOption: null,
      putOption: null,
      fetchError: error.message
    };
  }

  let strikeLadder = { atmStrike: 0, indexLabel: "NIFTY", rows: [] };
  try {
    strikeLadder = await fetchStrikeLadderPremiums(
      config,
      marketMove.spot,
      signal.timestamp || new Date().toISOString()
    );
  } catch {
    strikeLadder = { atmStrike: 0, indexLabel: "NIFTY", rows: [] };
  }

  let optionChain = { rows: [], totalCeOi: 0, totalPeOi: 0, pcr: null, callVolumePct: null, putVolumePct: null, atmStrike: strikeLadder.atmStrike, indexLabel: strikeLadder.indexLabel };
  try {
    optionChain = await fetchOptionChainOI(
      config,
      marketMove.spot,
      signal.timestamp || new Date().toISOString()
    );
  } catch {
    /* leave empty */
  }

  let headlines = [];
  let newsSummary = { bullish: 0, bearish: 0, neutral: 0, score: 0, bias: "neutral" };
  let newsError = null;

  try {
    headlines = await fetchMarketNews();
    newsSummary = summarizeNews(headlines);
  } catch (error) {
    newsError = error.message;
  }

  const suggestions = buildTradeSuggestions({
    signal,
    marketMove,
    news: newsSummary
  });
  const actionableSuggestions = buildActionableSuggestions({
    signal,
    marketMove,
    news: newsSummary,
    suggestions,
    optionPremiums: { call: optionPremiums.call, put: optionPremiums.put },
    openingContext,
    strikeLadder
  });

  // India VIX (cached 30s)
  let indiaVix = null;
  if (Date.now() - vixCache.at < VIX_TTL && vixCache.value !== null) {
    indiaVix = vixCache.value;
  } else {
    try {
      indiaVix = await fetchIndiaVix(config);
      vixCache = { at: Date.now(), value: indiaVix };
    } catch { /* leave null */ }
  }

  // Multi-timeframe analysis (cached 5min)
  let multiTimeframe = null;
  const instrument = config.niftyIndex;
  if (instrument?.instrumentToken) {
    if (Date.now() - multiTfCache.at < MULTI_TF_TTL && multiTfCache.data) {
      multiTimeframe = multiTfCache.data;
    } else {
      try {
        multiTimeframe = await fetchMultiTimeframeSignals(config, instrument);
        multiTfCache = { at: Date.now(), data: multiTimeframe };
      } catch { /* leave null */ }
    }
  }

  // Max pain from option chain OI
  const maxPain = calculateMaxPain(optionChain?.rows ?? []);

  // ATM IV from chain
  const atmRow = optionChain?.rows?.find((r) => r.strike === optionChain.atmStrike);
  const ivAtm = atmRow?.ceIv ?? atmRow?.peIv ?? null;

  // Build trade setup cards for actionable suggestions
  const atr = signal.technicals?.atr?.value ?? null;
  const supertrend = signal.technicals?.supertrend ?? null;
  const spot = marketMove.spot ?? null;
  const lotSize = config.optionSelection?.lotSize ?? 50;
  const tradeSetups = (actionableSuggestions || []).map((sug) => {
    const premium = sug.estimatedPremium ?? sug.premium ?? null;
    const isBull = sug.direction === "CALL";
    const slUnderlying = atr && spot ? (isBull ? spot - 1.5 * atr : spot + 1.5 * atr) : null;
    const t1Underlying = atr && spot ? (isBull ? spot + 2 * atr : spot - 2 * atr) : null;
    const t2Underlying = atr && spot ? (isBull ? spot + 3 * atr : spot - 3 * atr) : null;
    const slPremium = premium != null ? Number((premium * 0.5).toFixed(1)) : null;
    const deltaApprox = sug.strikeType === "ATM" ? 0.45 : sug.strikeType === "OTM1" ? 0.28 : 0.18;
    const t1Premium = premium != null && atr ? Number((premium + deltaApprox * 2 * atr).toFixed(1)) : null;
    const t2Premium = premium != null && atr ? Number((premium + deltaApprox * 3 * atr).toFixed(1)) : null;
    const riskPer = premium != null && slPremium != null ? Number(((premium - slPremium) * lotSize).toFixed(0)) : null;
    const rewardPer = t1Premium != null && premium != null ? Number(((t1Premium - premium) * lotSize).toFixed(0)) : null;
    const rrRatio = riskPer && rewardPer ? Number((rewardPer / riskPer).toFixed(1)) : null;
    return {
      ...sug,
      atrValue: atr,
      slPremium,
      slUnderlying: slUnderlying != null ? Number(slUnderlying.toFixed(0)) : null,
      target1Underlying: t1Underlying != null ? Number(t1Underlying.toFixed(0)) : null,
      target2Underlying: t2Underlying != null ? Number(t2Underlying.toFixed(0)) : null,
      target1Premium: t1Premium,
      target2Premium: t2Premium,
      riskPerLot: riskPer,
      rewardPerLot: rewardPer,
      rrRatio,
      lotSize,
      supertrendDir: supertrend?.trend ?? null,
      supertrendValue: supertrend?.value ?? null
    };
  });

  return {
    status: "READY",
    generatedAt: new Date().toISOString(),
    marketMove,
    openingContext,
    strikeLadder,
    optionChain,
    atmOptions: {
      callSymbol: optionPremiums.callOption?.tradingsymbol ?? null,
      putSymbol: optionPremiums.putOption?.tradingsymbol ?? null,
      callPremium: optionPremiums.call,
      putPremium: optionPremiums.put,
      fetchError: optionPremiums.fetchError ?? null
    },
    technicals: signal.technicals ?? null,
    pcr: optionChain.pcr,
    callVolumePct: optionChain.callVolumePct,
    putVolumePct: optionChain.putVolumePct,
    indiaVix,
    maxPain,
    ivAtm,
    multiTimeframe,
    tradeSetups,
    news: {
      summary: newsSummary,
      headlines,
      error: newsError
    },
    suggestions,
    actionableSuggestions
  };
}

async function runBotCommand(command) {
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error(`Unsupported command: ${command}`);
  }

  const { stdout, stderr } = await execFileAsync("npm", ["run", command], {
    cwd: PROJECT_ROOT,
    env: process.env,
    maxBuffer: 1024 * 1024 * 8
  });

  const dashboardState = await buildDashboardPayload();
  return {
    command,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    dashboardState
  };
}

function tryServeStatic(res, pathname) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const targetPath = path.normalize(path.join(PUBLIC_DIR, normalized));

  if (!targetPath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return true;
  }

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    const extension = path.extname(targetPath);
    const contentType =
      extension === ".html"
        ? "text/html; charset=utf-8"
        : extension === ".js"
          ? "application/javascript; charset=utf-8"
          : extension === ".css"
            ? "text/css; charset=utf-8"
            : extension === ".svg"
              ? "image/svg+xml"
              : extension === ".json"
                ? "application/json; charset=utf-8"
                : "application/octet-stream";
    sendFile(res, targetPath, contentType);
    return true;
  }

  return false;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function routeApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    buildDashboardPayload()
      .then((payload) => sendJson(res, 200, payload))
      .catch((error) => sendJson(res, 500, { error: error.message }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/export/trading-day") {
    try {
      const config = getConfig();
      const store = readJson(getRuntimePath("positions.json"), { open: [], closed: [] });
      const payload = buildTradingDayExport(config, store);
      const format = (url.searchParams.get("format") || "json").toLowerCase();
      if (format === "csv") {
        const lines = ["section,kind,at,setupId,action,positionId,option,reason,extra"];
        for (const e of payload.journal?.entries ?? []) {
          lines.push(
            [
              "journal",
              csvEscape(e.kind),
              csvEscape(e.at),
              csvEscape(e.setupId),
              csvEscape(e.action),
              csvEscape(e.positionId),
              csvEscape(e.option),
              csvEscape(e.reason),
              ""
            ].join(",")
          );
        }
        for (const c of payload.closedTradesToday ?? []) {
          lines.push(
            [
              "closed",
              csvEscape(c.status),
              csvEscape(c.closedAt),
              csvEscape(c.paperSetupId),
              csvEscape(c.direction),
              csvEscape(c.id),
              csvEscape(c.option?.tradingsymbol ?? c.symbol),
              csvEscape(c.exit?.reason),
              csvEscape(c.quantity)
            ].join(",")
          );
        }
        res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8" });
        res.end(lines.join("\n"));
        return true;
      }
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/crypto-dashboard") {
    buildCryptoDashboardPayload(getConfig())
      .then((payload) => sendJson(res, 200, payload))
      .catch((error) => sendJson(res, 500, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/run/")) {
    const command = url.pathname.replace("/api/run/", "");
    runBotCommand(command)
      .then((result) => sendJson(res, 200, result))
      .catch((error) => sendJson(res, 500, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/apply-suggestion") {
    readRequestBody(req)
      .then(async (body) => {
        const intelligence = await buildTradeIntelligence();
        const suggestions = intelligence.actionableSuggestions ?? [];
        const selected = suggestions.find((item) => item.id === body.id);
        if (!selected) {
          sendJson(res, 404, { error: "Suggestion not found" });
          return;
        }

        const payload = {
          appliedAt: new Date().toISOString(),
          suggestion: selected,
          marketMove: intelligence.marketMove,
          newsBias: intelligence.news?.summary?.bias ?? "neutral"
        };
        writeArtifact("applied-suggestion.json", payload);
        appendDayJournal(getConfig(), {
          kind: "APPLY_PLAN",
          setupId: selected.id,
          action: selected.action
        });
        sendJson(res, 200, {
          ok: true,
          applied: payload,
          dashboardState: await buildDashboardPayload()
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/paper-enter") {
    readRequestBody(req)
      .then(async (body) => {
        const intelligence = await buildTradeIntelligence();
        const suggestions = intelligence.actionableSuggestions ?? [];
        const selected = suggestions.find((item) => item.id === body.id);
        if (!selected) {
          sendJson(res, 404, { error: "Suggestion not found" });
          return;
        }

        const config = getConfig();
        if (
          config.dailyTradeSlotLimit > 0 &&
          countPaperBuysToday(config) >= config.dailyTradeSlotLimit
        ) {
          sendJson(res, 400, {
            error: `Daily paper trade limit (${config.dailyTradeSlotLimit}) reached for ${tradingDateKeyIST(config)}. Exit or wait for next session.`
          });
          return;
        }

        const result = await createPaperTradeFromSuggestion(config, selected, intelligence);
        appendDayJournal(config, {
          kind: "PAPER_BUY",
          setupId: selected.id,
          action: selected.action,
          positionId: result.position?.id ?? null
        });
        sendJson(res, 200, {
          ok: true,
          result,
          dashboardState: await buildDashboardPayload()
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/reset-paper-wallet") {
    try {
      const config = getConfig();
      const store = readJson(getRuntimePath("positions.json"), { open: [], closed: [] });
      if ((store.open?.length ?? 0) > 0) {
        sendJson(res, 400, {
          error: "Close all open positions before resetting the paper wallet (ledger must match no open risk)."
        });
        return true;
      }
      resetPaperWalletToConfig(config);
      buildDashboardPayload()
        .then((dashboardState) => sendJson(res, 200, { ok: true, dashboardState }))
        .catch((error) => sendJson(res, 500, { error: error.message }));
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/paper-exit") {
    readRequestBody(req)
      .then(async (body) => {
        if (!body.positionId) {
          sendJson(res, 400, { error: "positionId is required." });
          return;
        }

        const config = getConfig();
        const result = await exitPaperPositionNow(config, body.positionId);
        appendDayJournal(config, {
          kind: "PAPER_EXIT",
          positionId: body.positionId,
          option: result.closedPosition?.option?.tradingsymbol ?? null,
          reason: result.closedPosition?.exit?.reason ?? null
        });
        sendJson(res, 200, {
          ok: true,
          result,
          dashboardState: await buildDashboardPayload()
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/paper-exit-partial") {
    readRequestBody(req)
      .then(async (body) => {
        if (!body.positionId) {
          sendJson(res, 400, { error: "positionId is required." });
          return;
        }
        const pct = Number(body.pct ?? body.fractionPct);
        const config = getConfig();
        const result = await exitPaperPositionPartial(config, body.positionId, pct);
        sendJson(res, 200, {
          ok: true,
          result,
          dashboardState: await buildDashboardPayload()
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/desk-no-new-entries") {
    readRequestBody(req)
      .then(async (body) => {
        if (typeof body.enabled !== "boolean") {
          sendJson(res, 400, { error: "Body must include enabled: true|false." });
          return;
        }
        const config = getConfig();
        const meta = setDeskNoNewEntriesRuntime(config, body.enabled);
        sendJson(res, 200, {
          ok: true,
          deskNoNewEntries: meta,
          dashboardState: await buildDashboardPayload()
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/crypto-verify") {
    readRequestBody(req)
      .then(async (body) => {
        if (!body.id || !body.outcome) {
          sendJson(res, 400, { error: "Both id and outcome are required." });
          return;
        }

        const verification = updateCryptoVerification(getConfig(), {
          id: body.id,
          outcome: body.outcome
        });

        sendJson(res, 200, {
          ok: true,
          verification,
          dashboardState: await buildCryptoDashboardPayload(getConfig())
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ai-analysis") {
    buildTradeIntelligence()
      .then(async (intelligence) => {
        if (intelligence.status !== "READY") {
          sendJson(res, 400, { error: intelligence.reason || "Trade intelligence is not ready." });
          return;
        }

        const signal = getArtifact("signals-latest.json")?.signal;
        if (!signal) {
          sendJson(res, 400, { error: "Run signals first before AI analysis." });
          return;
        }

        const aiResult = await generateAiAnalysis({
          config: getConfig(),
          signal,
          marketMove: intelligence.marketMove,
          news: intelligence.news,
          baseSuggestions: intelligence.suggestions
        });

        writeArtifact("ai-analysis.json", aiResult);
        sendJson(res, 200, {
          ok: true,
          ai: aiResult,
          dashboardState: await buildDashboardPayload()
        });
      })
      .catch((error) => sendJson(res, 500, { error: error.message }));
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/login-url") {
    const envPath = path.join(PROJECT_ROOT, ".env");
    const envExists = fs.existsSync(envPath);
    sendJson(res, 200, {
      hasEnv: envExists,
      hint: "Use `npm run login:url` in the terminal for an interactive session login URL."
    });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/set-access-token") {
    readRequestBody(req)
      .then(async (body) => {
        const token = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
        if (token.length < 8) {
          sendJson(res, 400, { error: "Access token is too short or missing." });
          return;
        }
        updateEnvValue("ZERODHA_ACCESS_TOKEN", token);

        const freshConfig = getConfig();
        let sessionResult = null;
        let sessionOk = false;
        try {
          sessionResult = await checkSessionRun(freshConfig);
          persistRunArtifact(freshConfig, "check-session", sessionResult);
          sessionOk = sessionResult?.status === "SESSION_OK" || sessionResult?.status === "ok" || sessionResult?.status === "verified";
        } catch (sessionErr) {
          sessionResult = { status: "error", message: sessionErr.message };
        }

        broadcastDashboardSnapshot();

        sendJson(res, 200, {
          ok: sessionOk,
          session: sessionResult,
          message: sessionOk
            ? "Token saved and session verified."
            : `Token saved but session check failed: ${sessionResult?.message || "unknown error"}`
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  return false;
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const baseUrl = getDashboardBaseUrl(req);

  if (req.method === "GET" && url.pathname === "/auth/zerodha/start") {
    const config = getConfig();
    const expectedRedirect = `${baseUrl}/zerodha/callback`;
    if (config.zerodha.redirectUrl !== expectedRedirect) {
      const nextUrl = new URL("/", baseUrl);
      nextUrl.searchParams.set("zerodha", "redirect-mismatch");
      nextUrl.searchParams.set("expected", expectedRedirect);
      nextUrl.searchParams.set("configured", config.zerodha.redirectUrl || "");
      redirectWithMessage(res, nextUrl.toString());
      return;
    }

    try {
      redirectWithMessage(res, getLoginUrl(config));
    } catch (error) {
      const nextUrl = new URL("/", baseUrl);
      nextUrl.searchParams.set("zerodha", "start-error");
      nextUrl.searchParams.set("message", error.message);
      redirectWithMessage(res, nextUrl.toString());
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/zerodha/callback") {
    const requestToken = url.searchParams.get("request_token");
    const status = url.searchParams.get("status");
    const config = getConfig();
    const nextUrl = new URL("/", baseUrl);

    if (status !== "success" || !requestToken) {
      nextUrl.searchParams.set("zerodha", "login-failed");
      nextUrl.searchParams.set("message", "Zerodha did not return a valid request token.");
      redirectWithMessage(res, nextUrl.toString());
      return;
    }

    exchangeRequestToken(config, requestToken)
      .then(async (result) => {
        const accessToken = result?.data?.access_token || result?.access_token;
        const userId = result?.data?.user_id || result?.user_id;
        if (!accessToken) {
          throw new Error("Zerodha session exchange did not return an access token.");
        }

        updateEnvValue("ZERODHA_ACCESS_TOKEN", accessToken);
        if (userId) {
          updateEnvValue("ZERODHA_USER_ID", userId);
        }

        try {
          const freshConfig = getConfig();
          const sessionResult = await checkSessionRun(freshConfig);
          persistRunArtifact(freshConfig, "check-session", sessionResult);
        } catch {
          /* token saved; CLI will still validate */
        }

        broadcastDashboardSnapshot();

        nextUrl.searchParams.set("zerodha", "connected");
        redirectWithMessage(res, nextUrl.toString());
      })
      .catch((error) => {
        nextUrl.searchParams.set("zerodha", "exchange-failed");
        nextUrl.searchParams.set("message", error.message);
        redirectWithMessage(res, nextUrl.toString());
      });
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (!routeApi(req, res, url)) {
      sendJson(res, 404, { error: "API route not found" });
    }
    return;
  }

  if (tryServeStatic(res, url.pathname)) {
    return;
  }

  sendFile(res, path.join(PUBLIC_DIR, "index.html"), "text/html; charset=utf-8");
});

const wss = new WebSocketServer({ server, path: "/ws" });

async function broadcastDashboardSnapshot() {
  if (!wss.clients.size) {
    return;
  }

  try {
    const [dashboardPayload, cryptoPayload] = await Promise.all([
      buildDashboardPayload(),
      buildCryptoDashboardPayload(getConfig())
    ]);

    const payload = JSON.stringify({
      type: "dashboard:update",
      data: dashboardPayload,
      cryptoData: cryptoPayload
    });
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  } catch (error) {
    const payload = JSON.stringify({
      type: "dashboard:error",
      error: error.message
    });
    for (const client of wss.clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }
}

wss.on("connection", async (socket) => {
  socket.send(JSON.stringify({
    type: "dashboard:hello",
    message: "Connected to live dashboard updates."
  }));

  try {
    const [dashboardPayload, cryptoPayload] = await Promise.all([
      buildDashboardPayload(),
      buildCryptoDashboardPayload(getConfig())
    ]);

    socket.send(JSON.stringify({
      type: "dashboard:update",
      data: dashboardPayload,
      cryptoData: cryptoPayload
    }));
  } catch (error) {
    socket.send(JSON.stringify({
      type: "dashboard:error",
      error: error.message
    }));
  }
});

function scheduleDashboardBroadcast() {
  const config = getConfig();
  const t = setTimeout(async () => {
    await broadcastDashboardSnapshot();
    scheduleDashboardBroadcast();
  }, nextBroadcastDelayMs(config));

  if (typeof t.unref === "function") {
    t.unref();
  }
}

function nextBroadcastDelayMs(config) {
  let store;
  try {
    store = readJson(getRuntimePath("positions.json"), { open: [], closed: [] });
  } catch {
    store = { open: [] };
  }
  const hasOpen = (store.open?.length ?? 0) > 0;
  const fast = Math.max(2000, Number(config.dashboardBroadcastMsOpen) || 5000);
  const slow = Math.max(3000, Number(config.dashboardBroadcastMsIdle) || 15_000);
  return hasOpen ? fast : slow;
}

scheduleDashboardBroadcast();

server.listen(PORT, HOST, () => {
  console.log(`Dashboard running at http://${HOST}:${PORT}`);
  if (isAutoSignalsEnabled()) {
    const everyMin = Number(getEnv("AUTO_SIGNALS_INTERVAL_MINUTES", "15")) || 15;
    startAutoSignalScheduler({
      config: getConfig(),
      onAfterRun: broadcastDashboardSnapshot
    });
    console.log(
      `Auto signals enabled: run at market open + every ~${everyMin} min while open (AUTO_SIGNALS_INTERVAL_MINUTES).`
    );
  }
});
