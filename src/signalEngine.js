import { clamp } from "./utils.js";
import {
  calculateATR,
  calculateBollingerBands,
  calculateMACD,
  calculateRSI,
  calculateSimpleMovingAverage,
  calculateSupertrend,
  calculateVWAP,
  detectRange,
  getLatestCandle
} from "./marketData.js";

function round(value) {
  return Number(value.toFixed(2));
}

export function analyzeSignal(candles, config) {
  if (!Array.isArray(candles) || candles.length < 20) {
    throw new Error("At least 20 candles are required for signal analysis.");
  }

  const latest = getLatestCandle(candles);
  const previous = candles[candles.length - 2];
  const sma9 = calculateSimpleMovingAverage(candles, 9);
  const sma20 = calculateSimpleMovingAverage(candles, 20);
  const vwap = calculateVWAP(candles);
  const recentRange = detectRange(candles, 12);
  const recentCloses = candles.slice(-5).map((candle) => candle.close);
  const breakoutBuffer = 8;
  const breakdownBuffer = 8;

  const callBreakout = latest.close > recentRange.high - breakoutBuffer;
  const putBreakdown = latest.close < recentRange.low + breakdownBuffer;
  const bullishTrend = latest.close > sma9 && sma9 > sma20 && latest.close > vwap;
  const bearishTrend = latest.close < sma9 && sma9 < sma20 && latest.close < vwap;
  const bullishMomentum = latest.close > previous.close && latest.volume >= previous.volume;
  const bearishMomentum = latest.close < previous.close && latest.volume >= previous.volume;
  const candleBody = Math.abs(latest.close - latest.open);
  const averageRecentMove =
    recentCloses.length > 1
      ? recentCloses
          .slice(1)
          .reduce((sum, close, index) => sum + Math.abs(close - recentCloses[index]), 0) /
        (recentCloses.length - 1)
      : candleBody;
  const bullishStructure = latest.low >= sma9 || latest.low >= vwap;
  const bearishStructure = latest.high <= sma9 || latest.high <= vwap;
  const bullishBodyConfirmation = latest.close > latest.open && candleBody >= Math.max(6, averageRecentMove * 0.5);
  const bearishBodyConfirmation = latest.close < latest.open && candleBody >= Math.max(6, averageRecentMove * 0.5);

  const callScore = clamp(
    (bullishTrend ? 4 : 0) +
      (callBreakout ? 2 : 0) +
      (bullishMomentum ? 2 : 0) +
      (latest.close > latest.open ? 1 : 0),
    0,
    10
  );

  const putScore = clamp(
    (bearishTrend ? 4 : 0) +
      (putBreakdown ? 2 : 0) +
      (bearishMomentum ? 2 : 0) +
      (latest.close < latest.open ? 1 : 0),
    0,
    10
  );

  const direction = callScore >= putScore ? "CALL" : "PUT";
  const score = Math.max(callScore, putScore);

  const callConfirmationFlags = {
    trendAligned: bullishTrend,
    breakoutConfirmed: callBreakout,
    momentumConfirmed: bullishMomentum,
    structureHeld: bullishStructure,
    candleBodyConfirmed: bullishBodyConfirmation
  };
  const putConfirmationFlags = {
    trendAligned: bearishTrend,
    breakoutConfirmed: putBreakdown,
    momentumConfirmed: bearishMomentum,
    structureHeld: bearishStructure,
    candleBodyConfirmed: bearishBodyConfirmation
  };
  const callConfirmationCount = Object.values(callConfirmationFlags).filter(Boolean).length;
  const putConfirmationCount = Object.values(putConfirmationFlags).filter(Boolean).length;

  function sideStatus(sideScore, confirmationCount) {
    if (sideScore >= config.minSignalScore && confirmationCount >= config.minConfirmationCount) {
      return "TRADEABLE";
    }
    if (sideScore >= config.minSignalScore) {
      return "WAIT_CONFIRMATION";
    }
    return "SKIP";
  }

  const confirmationFlags =
    direction === "CALL"
      ? callConfirmationFlags
      : putConfirmationFlags;
  const confirmationCount = direction === "CALL" ? callConfirmationCount : putConfirmationCount;
  const setupPasses = score >= config.minSignalScore && confirmationCount >= config.minConfirmationCount;
  const entry = round(latest.close);
  const stopLoss = round(direction === "CALL" ? latest.low - 12 : latest.high + 12);
  const riskPerUnit = Math.abs(entry - stopLoss);
  const target1 = round(direction === "CALL" ? entry + riskPerUnit * 1.5 : entry - riskPerUnit * 1.5);
  const target2 = round(direction === "CALL" ? entry + riskPerUnit * 2.2 : entry - riskPerUnit * 2.2);

  const callStopLoss = round(latest.low - 12);
  const putStopLoss = round(latest.high + 12);
  const callRiskPerUnit = Math.abs(entry - callStopLoss);
  const putRiskPerUnit = Math.abs(putStopLoss - entry);
  const callTarget1 = round(entry + callRiskPerUnit * 1.5);
  const callTarget2 = round(entry + callRiskPerUnit * 2.2);
  const putTarget1 = round(entry - putRiskPerUnit * 1.5);
  const putTarget2 = round(entry - putRiskPerUnit * 2.2);

  const callReasons = [];
  if (bullishTrend) callReasons.push("price above 9 SMA, 20 SMA, and VWAP");
  if (callBreakout) callReasons.push("breakout near recent range high");
  if (bullishMomentum) callReasons.push("positive price and volume confirmation");
  if (bullishStructure) callReasons.push("pullbacks still holding fast support");
  if (bullishBodyConfirmation) callReasons.push("bull candle body is large enough to confirm intent");
  if (!callReasons.length) callReasons.push("call-side structure not fully aligned on this bar");

  const putReasons = [];
  if (bearishTrend) putReasons.push("price below 9 SMA, 20 SMA, and VWAP");
  if (putBreakdown) putReasons.push("breakdown near recent range low");
  if (bearishMomentum) putReasons.push("negative price and volume confirmation");
  if (bearishStructure) putReasons.push("bounces still capped below fast resistance");
  if (bearishBodyConfirmation) putReasons.push("bear candle body is large enough to confirm intent");
  if (!putReasons.length) putReasons.push("put-side structure not fully aligned on this bar");

  const reasons = direction === "CALL" ? [...callReasons] : [...putReasons];

  const dualSide = {
    call: {
      score: callScore,
      status: sideStatus(callScore, callConfirmationCount),
      confirmationCount: callConfirmationCount,
      confirmations: {
        ...callConfirmationFlags,
        minimumRequired: config.minConfirmationCount
      },
      entryZone: [round(entry - 5), round(entry + 5)],
      stopLoss: callStopLoss,
      targets: [callTarget1, callTarget2],
      reasons: callReasons,
      invalidation: "lose VWAP and break candle low"
    },
    put: {
      score: putScore,
      status: sideStatus(putScore, putConfirmationCount),
      confirmationCount: putConfirmationCount,
      confirmations: {
        ...putConfirmationFlags,
        minimumRequired: config.minConfirmationCount
      },
      entryZone: [round(entry - 5), round(entry + 5)],
      stopLoss: putStopLoss,
      targets: [putTarget1, putTarget2],
      reasons: putReasons,
      invalidation: "reclaim VWAP and break candle high"
    }
  };

  const rsiResult = calculateRSI(candles, 14, 20);
  const macdResult = calculateMACD(candles, 12, 26, 9);
  const bbResult = calculateBollingerBands(candles, 20, 2);
  const atrResult = calculateATR(candles, 14);
  const supertrendResult = calculateSupertrend(candles, 7, 3);

  return {
    symbol: config.niftySymbol,
    direction,
    score,
    status: setupPasses ? "TRADEABLE" : score >= config.minSignalScore ? "WAIT_CONFIRMATION" : "SKIP",
    timestamp: latest.timestamp,
    entryZone: [round(entry - 5), round(entry + 5)],
    stopLoss,
    targets: [target1, target2],
    invalidation: direction === "CALL" ? "lose VWAP and break candle low" : "reclaim VWAP and break candle high",
    reasons,
    confirmations: {
      ...confirmationFlags,
      count: confirmationCount,
      minimumRequired: config.minConfirmationCount
    },
    dualSide,
    indicators: {
      latestClose: round(latest.close),
      sma9: round(sma9),
      sma20: round(sma20),
      vwap: round(vwap),
      recentHigh: round(recentRange.high),
      recentLow: round(recentRange.low),
      candleBody: round(candleBody),
      averageRecentMove: round(averageRecentMove)
    },
    technicals: {
      rsi: rsiResult,
      macd: macdResult,
      bollingerBands: bbResult,
      atr: atrResult,
      supertrend: supertrendResult
    }
  };
}
