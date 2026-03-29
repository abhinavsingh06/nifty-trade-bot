import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchHistoricalCandles } from "./kiteApi.js";
import { isMarketOpen } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_PATH = path.resolve(__dirname, "../data/sample-nifty.json");

export function loadCandles(filePath = SAMPLE_PATH) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function getLatestCandle(candles) {
  return candles[candles.length - 1];
}

export async function loadRuntimeCandles(config, options = {}) {
  const { allowSampleFallback = false } = options;
  const hasLiveAuth = config.zerodha.apiKey && config.zerodha.accessToken;
  if (!hasLiveAuth) {
    return {
      candles: loadCandles(),
      source: "sample",
      skipped: false,
      reason: "Live Zerodha credentials are not configured."
    };
  }

  const now = new Date();
  if (!isMarketOpen(now.toISOString(), config)) {
    if (allowSampleFallback) {
      return {
        candles: loadCandles(),
        source: "sample",
        skipped: false,
        reason: "Market is closed, using sample candles for smoke/demo flow."
      };
    }

    return {
      candles: [],
      source: "live",
      skipped: true,
      reason: "Market is currently closed. Skipping live candle analysis."
    };
  }

  const from = new Date(now.getTime() - config.historicalLookbackMinutes * 60 * 1000);
  const liveCandles = await fetchHistoricalCandles(
    config,
    config.niftyIndex.instrumentToken,
    "5minute",
    formatKiteDate(from),
    formatKiteDate(now)
  );

  if (!liveCandles.length) {
    throw new Error("Zerodha returned no live candles during market hours. Refusing to fall back to sample data.");
  }

  return {
    candles: liveCandles.map((candle) => ({
      timestamp: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5]
    })),
    source: "live",
    skipped: false,
    reason: "Loaded live candles from Zerodha."
  };
}

export async function loadBacktestCandles(config) {
  const hasLiveAuth = config.zerodha.apiKey && config.zerodha.accessToken;
  if (!hasLiveAuth) {
    return {
      candles: loadCandles(),
      source: "sample",
      reason: "Live Zerodha credentials are not configured. Using sample candles for backtest."
    };
  }

  const now = new Date();
  const from = new Date(now.getTime() - config.backtestLookbackDays * 24 * 60 * 60 * 1000);
  const liveCandles = await fetchHistoricalCandles(
    config,
    config.niftyIndex.instrumentToken,
    "5minute",
    formatKiteDate(from),
    formatKiteDate(now)
  );

  if (!liveCandles.length) {
    return {
      candles: loadCandles(),
      source: "sample",
      reason: "Zerodha returned no candles for the backtest lookback window. Using sample candles."
    };
  }

  return {
    candles: liveCandles.map((candle) => ({
      timestamp: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5]
    })),
    source: "live",
    reason: `Loaded ${config.backtestLookbackDays} day(s) of live historical candles from Zerodha.`
  };
}

export function calculateSimpleMovingAverage(candles, period, field = "close") {
  const slice = candles.slice(-period);
  const total = slice.reduce((sum, candle) => sum + candle[field], 0);
  return total / slice.length;
}

export function calculateVWAP(candles) {
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
  }

  return cumulativeVolume ? cumulativePV / cumulativeVolume : 0;
}

export function detectRange(candles, period = 10) {
  const slice = candles.slice(-period);
  return {
    high: Math.max(...slice.map((candle) => candle.high)),
    low: Math.min(...slice.map((candle) => candle.low))
  };
}

function formatKiteDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
