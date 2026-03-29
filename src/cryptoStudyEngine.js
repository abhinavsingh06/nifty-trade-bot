import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calculateSimpleMovingAverage, detectRange } from "./marketData.js";
import { fetchMarketNews, summarizeNews } from "./newsEngine.js";
import { readJson } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRYPTO_FEED_URL =
  "https://news.google.com/rss/search?q=Bitcoin%20OR%20BTC%20OR%20Ethereum%20OR%20crypto%20market%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en";

async function loadLiveCryptoCandles(config) {
  const headers = {
    accept: "application/json"
  };

  if (config.crypto.apiKey) {
    headers["x-cg-demo-api-key"] = config.crypto.apiKey;
  }

  const days = 1;
  const marketChartUrl = new URL(`${config.crypto.baseUrl}/coins/${config.crypto.coinId}/market_chart`);
  marketChartUrl.searchParams.set("vs_currency", config.crypto.vsCurrency);
  marketChartUrl.searchParams.set("days", String(days));
  marketChartUrl.searchParams.set("interval", "hourly");

  const chartResponse = await fetch(marketChartUrl, { headers });
  if (!chartResponse.ok) {
    throw new Error(`Crypto chart request failed with ${chartResponse.status}`);
  }

  const chartPayload = await chartResponse.json();
  const prices = chartPayload.prices ?? [];
  if (!prices.length) {
    throw new Error("Crypto provider returned no prices.");
  }

  const candles = prices.map((point, index) => {
    const price = Number(point[1]);
    const previous = Number(prices[Math.max(0, index - 1)]?.[1] ?? price);
    const drift = price - previous;
    const open = Number((index === 0 ? previous : previous).toFixed(2));
    const close = Number(price.toFixed(2));
    const high = Number((Math.max(open, close) + Math.abs(drift) * 0.35 + 8).toFixed(2));
    const low = Number((Math.min(open, close) - Math.abs(drift) * 0.35 - 8).toFixed(2));
    const volumePoint = chartPayload.total_volumes?.[index]?.[1];
    return {
      timestamp: new Date(point[0]).toISOString(),
      open,
      high,
      low,
      close,
      volume: Number((volumePoint ?? 0).toFixed(2))
    };
  });

  const trimmed = candles.slice(-config.crypto.lookbackCandles);
  return {
    candles: trimmed,
    source: "live",
    note: "Loaded live crypto market data from configured provider."
  };
}

function runtimePath(config, fileName) {
  return path.join(config.runtimeDir, fileName);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildVerificationBase(config) {
  return readJson(runtimePath(config, "crypto-verifications.json"), {
    updatedAt: null,
    records: {}
  });
}

function persistVerification(config, payload) {
  fs.writeFileSync(runtimePath(config, "crypto-verifications.json"), JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function formatSetupId(prefix, latestTimestamp) {
  return `${prefix}-${latestTimestamp}`;
}

function buildPrediction({ id, side, analog, confidence, entryZone, stopLoss, targets, thesis, lesson, invalidation }) {
  return {
    id,
    side,
    analog,
    confidence: Number(confidence.toFixed(1)),
    entryZone: entryZone.map((value) => Number(value.toFixed(2))),
    stopLoss: Number(stopLoss.toFixed(2)),
    targets: targets.map((value) => Number(value.toFixed(2))),
    thesis,
    lesson,
    invalidation
  };
}

export async function buildCryptoDashboardPayload(config) {
  let candleBundle;
  try {
    candleBundle = await loadLiveCryptoCandles(config);
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      status: "UNAVAILABLE",
      mode: "study-only",
      market: {
        asset: config.crypto.symbol,
        venue: "Study mode",
        bias: "unknown",
        latestClose: null,
        previousClose: null,
        change: null,
        changePct: null
      },
      charts: {
        source: "unavailable",
        note: `Live crypto feed unavailable. ${error.message}`,
        candles: [],
        line: []
      },
      indicators: {
        sma9: null,
        sma20: null,
        recentHigh: null,
        recentLow: null,
        momentumPct: null,
        bias: "unknown"
      },
      learning: {
        objective: "Learn how bullish and bearish chart structures translate into long/short crypto study setups and into CALL/PUT logic for Indian options.",
        guide: [
          "Bullish continuation in crypto maps conceptually to CALL BUY thinking in options: wait for strength, not prediction alone.",
          "Bearish breakdown in crypto maps conceptually to PUT BUY thinking: focus on support failure and invalidation discipline.",
          "For Indian markets, treat options as leveraged expressions of the underlying move; the chart read still starts on the index or stock."
        ],
        chartReadingSteps: [
          "Mark recent high and recent low before deciding whether the market is trending or ranging.",
          "Check whether price is above or below fast and slow averages to judge trend strength.",
          "Only study entries near a trigger zone, and define the invalidation before imagining targets."
        ]
      },
      predictions: [],
      news: {
        summary: { bullish: 0, bearish: 0, neutral: 0, score: 0, bias: "neutral" },
        headlines: [],
        error: null
      }
    };
  }

  const candles = candleBundle.candles;
  const latest = candles[candles.length - 1];
  const previous = candles[candles.length - 2] ?? latest;
  const sma9 = calculateSimpleMovingAverage(candles, 9);
  const sma20 = calculateSimpleMovingAverage(candles, 20);
  const range = detectRange(candles, 12);
  const momentumPct = ((latest.close - previous.close) / previous.close) * 100;
  const trendBias = latest.close > sma9 && sma9 > sma20 ? "bullish" : latest.close < sma9 && sma9 < sma20 ? "bearish" : "range";

  let headlines = [];
  let newsSummary = { bullish: 0, bearish: 0, neutral: 0, score: 0, bias: "neutral" };
  let newsError = null;

  try {
    headlines = await fetchMarketNews(CRYPTO_FEED_URL, 8);
    newsSummary = summarizeNews(headlines);
  } catch (error) {
    newsError = error.message;
  }

  const bullishBonus = newsSummary.bias === "bullish" ? 1.2 : newsSummary.bias === "bearish" ? -1.2 : 0;
  const longConfidence = clamp(5 + (trendBias === "bullish" ? 2 : trendBias === "range" ? 0 : -2) + bullishBonus + momentumPct, 1, 10);
  const shortConfidence = clamp(5 + (trendBias === "bearish" ? 2 : trendBias === "range" ? 0 : -2) - bullishBonus - momentumPct, 1, 10);

  const breakoutTrigger = range.high + 35;
  const breakdownTrigger = range.low - 35;

  const predictions = [
    buildPrediction({
      id: formatSetupId("crypto-long", latest.timestamp),
      side: "LONG",
      analog: "Similar to CALL BUY logic: bullish continuation after breakout confirmation.",
      confidence: longConfidence,
      entryZone: [breakoutTrigger - 45, breakoutTrigger + 30],
      stopLoss: sma9 - 110,
      targets: [breakoutTrigger + 180, breakoutTrigger + 360],
      thesis: [
        `Price is ${latest.close > sma20 ? "above" : "near"} the 20-period average (${sma20.toFixed(2)}).`,
        `Momentum from the last candle is ${momentumPct.toFixed(2)}%.`,
        newsSummary.bias === "bullish" ? "News flow is helping upside continuation." : "Upside needs clean confirmation because news is not strongly supportive."
      ],
      lesson: "Wait for breakout confirmation above recent resistance, then track whether pullbacks hold the fast average.",
      invalidation: "Reject the long study if price falls back under the breakout zone and loses the 9-period average."
    }),
    buildPrediction({
      id: formatSetupId("crypto-short", latest.timestamp),
      side: "SHORT",
      analog: "Similar to PUT BUY logic: bearish breakdown after support failure.",
      confidence: shortConfidence,
      entryZone: [breakdownTrigger - 30, breakdownTrigger + 45],
      stopLoss: sma9 + 120,
      targets: [breakdownTrigger - 190, breakdownTrigger - 380],
      thesis: [
        `Recent support sits near ${range.low.toFixed(2)} and must break for downside follow-through.`,
        `Momentum is currently ${momentumPct >= 0 ? "not yet bearish" : "leaning bearish"}, so short entries need stronger confirmation.`,
        newsSummary.bias === "bearish" ? "News flow can amplify downside if support breaks." : "Without bearish news support, avoid anticipating breakdowns too early."
      ],
      lesson: "Short ideas work best after support gives way on expanding volume instead of guessing tops.",
      invalidation: "Reject the short study if price reclaims the breakdown zone and closes back above the fast average."
    })
  ];

  const verification = buildVerificationBase(config);
  const verificationRecords = predictions.map((prediction) => ({
    ...prediction,
    verification: verification.records[prediction.id] || {
      outcome: "PENDING",
      notes: "Waiting to review how price behaved after the setup appeared.",
      updatedAt: null
    }
  }));

  return {
    generatedAt: new Date().toISOString(),
    status: "READY",
    mode: "study-only",
    market: {
      asset: "BTCUSDT",
      venue: "Study mode",
      bias: trendBias,
      latestClose: latest.close,
      previousClose: previous.close,
      change: Number((latest.close - previous.close).toFixed(2)),
      changePct: Number(momentumPct.toFixed(2))
    },
    charts: {
      source: candleBundle.source,
      note: candleBundle.note,
      candles,
      line: candles.map((candle) => ({
        time: candle.timestamp,
        value: candle.close
      }))
    },
    indicators: {
      sma9: Number(sma9.toFixed(2)),
      sma20: Number(sma20.toFixed(2)),
      recentHigh: range.high,
      recentLow: range.low,
      momentumPct: Number(momentumPct.toFixed(2)),
      bias: trendBias
    },
    learning: {
      objective: "Learn how bullish and bearish chart structures translate into long/short crypto study setups and into CALL/PUT logic for Indian options.",
      guide: [
        "Bullish continuation in crypto maps conceptually to CALL BUY thinking in options: wait for strength, not prediction alone.",
        "Bearish breakdown in crypto maps conceptually to PUT BUY thinking: focus on support failure and invalidation discipline.",
        "For Indian markets, treat options as leveraged expressions of the underlying move; the chart read still starts on the index or stock."
      ],
      chartReadingSteps: [
        "Mark recent high and recent low before deciding whether the market is trending or ranging.",
        "Check whether price is above or below fast and slow averages to judge trend strength.",
        "Only study entries near a trigger zone, and define the invalidation before imagining targets."
      ]
    },
    predictions: verificationRecords,
    news: {
      summary: newsSummary,
      headlines,
      error: newsError
    }
  };
}

export function updateCryptoVerification(config, { id, outcome }) {
  const payload = buildVerificationBase(config);
  payload.updatedAt = new Date().toISOString();
  payload.records[id] = {
    outcome,
    notes:
      outcome === "WIN"
        ? "The setup behaved as expected after confirmation."
        : outcome === "LOSS"
          ? "The setup failed and invalidation was hit."
          : "Studying this setup further before judging the outcome.",
    updatedAt: payload.updatedAt
  };
  persistVerification(config, payload);
  return payload.records[id];
}
