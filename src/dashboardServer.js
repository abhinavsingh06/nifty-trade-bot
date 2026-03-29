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
import { buildPaperWalletSnapshot } from "./paperWallet.js";
import { exchangeRequestToken, fetchQuote, getLoginUrl } from "./kiteApi.js";
import { loadRuntimeCandles } from "./marketData.js";
import {
  createPaperTradeFromSuggestion,
  exitPaperPositionNow,
  fetchCallPutAtmPremiums
} from "./executor.js";
import { buildActionableSuggestions, buildTradeSuggestions, fetchMarketNews, summarizeNews } from "./newsEngine.js";
import { buildOpeningContext } from "./sessionContext.js";
import { isAutoSignalsEnabled, startAutoSignalScheduler } from "./autoSignalScheduler.js";
import { isMarketOpen, readJson } from "./utils.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "dashboard-dist");
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
  "smoke"
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
  const nextLine = `${key}=${value ?? ""}`;
  let content = "";

  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf8");
  }

  const lines = content ? content.split("\n") : [];
  let updated = false;
  const nextLines = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      updated = true;
      return nextLine;
    }
    return line;
  });

  if (!updated) {
    nextLines.push(nextLine);
  }

  fs.writeFileSync(envPath, nextLines.filter(Boolean).join("\n") + "\n", "utf8");
  process.env[key] = value ?? "";
}

function redirectWithMessage(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
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
  const tradeState = readJson(getRuntimePath("trade-state.json"), {});
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
      autoSignals: {
        enabled: isAutoSignalsEnabled(),
        intervalMinutes: Number(getEnv("AUTO_SIGNALS_INTERVAL_MINUTES", "15")) || 15,
        spotMovePct: Number(getEnv("AUTO_SIGNALS_SPOT_MOVE_PCT", "0")) || 0
      }
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
      forwardTracker: getArtifact("forward-tracker.json"),
      paperWallet: getArtifact("paper-wallet.json"),
      session: getArtifact("check-session-latest.json"),
      appliedSuggestion: getArtifact("applied-suggestion.json"),
      aiAnalysis: getArtifact("ai-analysis.json"),
      positions,
      tradeState,
      autoSignalScheduler: readJson(
        path.join(config.runtimeDir, "auto-signals-scheduler-state.json"),
        { lastRunAt: null, lastSpotAtRun: null, history: [] }
      )
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
      openPositions
    };
  }

  const canUseBroker = config.zerodha.apiKey && config.zerodha.accessToken;
  if (!canUseBroker) {
    return {
      wallet: buildPaperWalletSnapshot(config, openPositions),
      openPositions
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
    const enrichedPositions = openPositions.map((position) => {
      const optionKey = position.option?.tradingsymbol
        ? `${position.option.exchange}:${position.option.tradingsymbol}`
        : null;
      return {
        ...position,
        lastObservedSpot: quoteMap[`${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`]?.last_price ?? position.lastObservedSpot,
        lastObservedOptionPrice: optionKey ? quoteMap[optionKey]?.last_price ?? position.lastObservedOptionPrice : position.lastObservedOptionPrice
      };
    });

    return {
      wallet: buildPaperWalletSnapshot(config, enrichedPositions),
      openPositions: enrichedPositions
    };
  } catch {
    return {
      wallet: buildPaperWalletSnapshot(config, openPositions),
      openPositions
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
    marketOpenNow: isMarketOpen(new Date().toISOString(), config)
  };
}

async function buildDashboardPayload() {
  const [base, intelligence, charts] = await Promise.all([
    Promise.resolve(buildDashboardState()),
    buildTradeIntelligence(),
    buildChartPayload()
  ]);
  const paperTrading = await buildPaperTradingPayload(base);

  return {
    ...base,
    runtime: {
      ...base.runtime,
      positions: {
        ...base.runtime.positions,
        open: paperTrading.openPositions
      },
      paperWallet: paperTrading.wallet
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
    openingContext
  });

  return {
    status: "READY",
    generatedAt: new Date().toISOString(),
    marketMove,
    openingContext,
    atmOptions: {
      callSymbol: optionPremiums.callOption?.tradingsymbol ?? null,
      putSymbol: optionPremiums.putOption?.tradingsymbol ?? null,
      callPremium: optionPremiums.call,
      putPremium: optionPremiums.put,
      fetchError: optionPremiums.fetchError ?? null
    },
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

        const result = await createPaperTradeFromSuggestion(getConfig(), selected, intelligence);
        sendJson(res, 200, {
          ok: true,
          result,
          dashboardState: await buildDashboardPayload()
        });
      })
      .catch((error) => sendJson(res, 400, { error: error.message }));
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/paper-exit") {
    readRequestBody(req)
      .then(async (body) => {
        if (!body.positionId) {
          sendJson(res, 400, { error: "positionId is required." });
          return;
        }

        const result = await exitPaperPositionNow(getConfig(), body.positionId);
        sendJson(res, 200, {
          ok: true,
          result,
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
      .then((result) => {
        const accessToken = result?.data?.access_token || result?.access_token;
        const userId = result?.data?.user_id || result?.user_id;
        if (!accessToken) {
          throw new Error("Zerodha session exchange did not return an access token.");
        }

        updateEnvValue("ZERODHA_ACCESS_TOKEN", accessToken);
        if (userId) {
          updateEnvValue("ZERODHA_USER_ID", userId);
        }

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

setInterval(() => {
  void broadcastDashboardSnapshot();
}, 15000);

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
