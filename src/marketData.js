import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchHistoricalCandles } from "./kiteApi.js";
import { isTradeSessionOpen } from "./marketCalendar.js";

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
  if (!isTradeSessionOpen(now.toISOString(), config)) {
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

// ─── Technical Indicators ──────────────────────────────────────────────────

function emaValues(prices, period) {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const seed = prices.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const result = [seed];
  for (let i = period; i < prices.length; i++) {
    result.push(prices[i] * k + result[result.length - 1] * (1 - k));
  }
  return result;
}

/**
 * Compute RSI(period) for each of the last `historyCount` candles.
 * Returns { value, history } where history is an array of { index, value }.
 */
export function calculateRSI(candles, period = 14, historyCount = 20) {
  const closes = candles.map((c) => c.close);
  if (closes.length < period + 1) return { value: null, history: [] };

  const history = [];
  const startIdx = Math.max(period, closes.length - historyCount);

  for (let end = startIdx; end <= closes.length; end++) {
    const slice = closes.slice(0, end);
    if (slice.length < period + 1) continue;
    let gains = 0;
    let losses = 0;
    for (let i = slice.length - period; i < slice.length; i++) {
      const diff = slice[i] - slice[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rsi = avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
    history.push(rsi);
  }

  return { value: history[history.length - 1] ?? null, history };
}

/**
 * Compute MACD(fast, slow, signal) from candles.
 * Returns { macd, signal, histogram, history: [{macd, signal, histogram}] }
 */
export function calculateMACD(candles, fast = 12, slow = 26, sigPeriod = 9) {
  const closes = candles.map((c) => c.close);
  if (closes.length < slow + 1) return { macd: null, signal: null, histogram: null, history: [] };
  const effectiveSig = Math.min(sigPeriod, Math.max(2, closes.length - slow));

  const fastEma = emaValues(closes, fast);
  const slowEma = emaValues(closes, slow);
  const macdLine = fastEma.slice(slow - fast).map((v, i) => v - slowEma[i]);
  if (macdLine.length < effectiveSig) return { macd: null, signal: null, histogram: null, history: [] };

  const sigLine = emaValues(macdLine, effectiveSig);
  const sigOffset = macdLine.length - sigLine.length;
  const histLine = sigLine.map((v, i) => macdLine[sigOffset + i] - v);

  const r = (v) => Number(v.toFixed(2));
  const take = 20;
  const history = sigLine.slice(-take).map((sv, i) => {
    const mi = sigLine.length - take + i;
    return {
      macd: r(macdLine[sigOffset + mi] ?? 0),
      signal: r(sv),
      histogram: r(histLine[mi] ?? 0)
    };
  });

  return {
    macd: r(macdLine[macdLine.length - 1]),
    signal: r(sigLine[sigLine.length - 1]),
    histogram: r(histLine[histLine.length - 1]),
    history
  };
}

/**
 * Bollinger Bands (period, stdDev multiplier).
 * Returns { upper, middle, lower, position, zone }
 */
export function calculateBollingerBands(candles, period = 20, std = 2) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period).map((c) => c.close);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const stddev = Math.sqrt(variance);
  const upper = Number((mean + std * stddev).toFixed(2));
  const lower = Number((mean - std * stddev).toFixed(2));
  const latest = slice[slice.length - 1];
  const position = upper !== lower ? Number(((latest - lower) / (upper - lower)).toFixed(3)) : 0.5;
  const zone =
    position > 0.8 ? "Upper zone" : position < 0.2 ? "Lower zone" : "Mid zone";
  const bandLabel =
    position > 0.65 ? "Near upper band" : position < 0.35 ? "Near lower band" : "Mid band";
  return { upper, middle: Number(mean.toFixed(2)), lower, position, zone, bandLabel };
}

/**
 * Wilder's ATR (Average True Range).
 * Returns { value, history: number[] }
 */
export function calculateATR(candles, period = 14) {
  if (candles.length < period + 1) return { value: null, history: [] };
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  const history = [Number(atr.toFixed(2))];
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    history.push(Number(atr.toFixed(2)));
  }
  return { value: history[history.length - 1], history };
}

/**
 * Supertrend(period, multiplier).
 * Returns { value, trend: 'up'|'down', upperBand, lowerBand, history }
 */
export function calculateSupertrend(candles, period = 7, multiplier = 3) {
  const atrResult = calculateATR(candles, period);
  if (!atrResult.value || !atrResult.history.length) return null;

  const startIdx = candles.length - atrResult.history.length;
  let prevUpper = null;
  let prevLower = null;
  let prevST = null;
  let prevTrend = null;
  const history = [];

  for (let i = 0; i < atrResult.history.length; i++) {
    const c = candles[startIdx + i];
    const atr = atrResult.history[i];
    const hl2 = (c.high + c.low) / 2;
    let upper = Number((hl2 + multiplier * atr).toFixed(2));
    let lower = Number((hl2 - multiplier * atr).toFixed(2));

    if (prevLower !== null) {
      lower = lower > prevLower || candles[startIdx + i - 1]?.close < prevLower ? lower : prevLower;
    }
    if (prevUpper !== null) {
      upper = upper < prevUpper || candles[startIdx + i - 1]?.close > prevUpper ? upper : prevUpper;
    }

    let st;
    let trend;
    if (prevST === null) {
      trend = c.close >= hl2 ? "up" : "down";
      st = trend === "up" ? lower : upper;
    } else if (prevTrend === "up") {
      if (c.close < lower) { trend = "down"; st = upper; }
      else { trend = "up"; st = lower; }
    } else {
      if (c.close > upper) { trend = "up"; st = lower; }
      else { trend = "down"; st = upper; }
    }

    history.push({ value: Number(st.toFixed(2)), trend, upper: Number(upper.toFixed(2)), lower: Number(lower.toFixed(2)), close: c.close });
    prevST = st; prevTrend = trend; prevUpper = upper; prevLower = lower;
  }

  const last = history[history.length - 1];
  return { value: last.value, trend: last.trend, upperBand: last.upper, lowerBand: last.lower, history: history.slice(-30) };
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
