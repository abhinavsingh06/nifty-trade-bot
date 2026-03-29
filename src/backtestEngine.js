import path from "node:path";
import { analyzeSignal } from "./signalEngine.js";
import { readJson, writeJson } from "./utils.js";

function round(value) {
  return Number(value.toFixed(2));
}

function runtimePath(config, fileName) {
  return path.join(config.runtimeDir, fileName);
}

function resolveOutcome(signal, forwardCandles) {
  if (!forwardCandles.length) {
    return {
      outcome: "OPEN",
      exitReason: "NOT_ENOUGH_FORWARD_DATA",
      exitPrice: signal.entryZone[1],
      rewardRisk: 0,
      pnlPoints: 0
    };
  }

  const conservativeEntry = signal.direction === "CALL" ? signal.entryZone[1] : signal.entryZone[0];
  const stop = signal.stopLoss;
  const [target1, target2] = signal.targets;

  for (const candle of forwardCandles) {
    if (signal.direction === "CALL") {
      if (candle.low <= stop) {
        return {
          outcome: "LOSS",
          exitReason: "STOP_LOSS",
          exitPrice: stop,
          rewardRisk: -1,
          pnlPoints: round(stop - conservativeEntry)
        };
      }
      if (candle.high >= target2) {
        return {
          outcome: "WIN",
          exitReason: "TARGET_2",
          exitPrice: target2,
          rewardRisk: 2.2,
          pnlPoints: round(target2 - conservativeEntry)
        };
      }
      if (candle.high >= target1) {
        return {
          outcome: "PARTIAL_WIN",
          exitReason: "TARGET_1",
          exitPrice: target1,
          rewardRisk: 1.5,
          pnlPoints: round(target1 - conservativeEntry)
        };
      }
      continue;
    }

    if (candle.high >= stop) {
      return {
        outcome: "LOSS",
        exitReason: "STOP_LOSS",
        exitPrice: stop,
        rewardRisk: -1,
        pnlPoints: round(conservativeEntry - stop)
      };
    }
    if (candle.low <= target2) {
      return {
        outcome: "WIN",
        exitReason: "TARGET_2",
        exitPrice: target2,
        rewardRisk: 2.2,
        pnlPoints: round(conservativeEntry - target2)
      };
    }
    if (candle.low <= target1) {
      return {
        outcome: "PARTIAL_WIN",
        exitReason: "TARGET_1",
        exitPrice: target1,
        rewardRisk: 1.5,
        pnlPoints: round(conservativeEntry - target1)
      };
    }
  }

  const finalClose = forwardCandles[forwardCandles.length - 1].close;
  return {
    outcome: signal.direction === "CALL"
      ? finalClose >= conservativeEntry
        ? "TIME_EXIT_WIN"
        : "TIME_EXIT_LOSS"
      : finalClose <= conservativeEntry
        ? "TIME_EXIT_WIN"
        : "TIME_EXIT_LOSS",
    exitReason: "TIME_EXIT",
    exitPrice: round(finalClose),
    rewardRisk: round(
      signal.direction === "CALL"
        ? (finalClose - conservativeEntry) / Math.max(conservativeEntry - stop, 1)
        : (conservativeEntry - finalClose) / Math.max(stop - conservativeEntry, 1)
    ),
    pnlPoints: round(signal.direction === "CALL" ? finalClose - conservativeEntry : conservativeEntry - finalClose)
  };
}

function buildStats(trades) {
  const closedTrades = trades.filter((trade) => trade.outcome !== "OPEN");
  const wins = closedTrades.filter((trade) => ["WIN", "PARTIAL_WIN", "TIME_EXIT_WIN"].includes(trade.outcome));
  const losses = closedTrades.filter((trade) => ["LOSS", "TIME_EXIT_LOSS"].includes(trade.outcome));
  const totalRewardRisk = closedTrades.reduce((sum, trade) => sum + trade.rewardRisk, 0);
  const avgWin = wins.length ? wins.reduce((sum, trade) => sum + trade.rewardRisk, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((sum, trade) => sum + trade.rewardRisk, 0) / losses.length : 0;

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of closedTrades) {
    equity += trade.rewardRisk;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }

  return {
    totalSignals: trades.length,
    closedSignals: closedTrades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closedTrades.length ? round((wins.length / closedTrades.length) * 100) : 0,
    avgWinR: round(avgWin),
    avgLossR: round(avgLoss),
    expectancyR: closedTrades.length ? round(totalRewardRisk / closedTrades.length) : 0,
    totalRewardRisk: round(totalRewardRisk),
    maxDrawdownR: round(maxDrawdown)
  };
}

export function runBacktest(config, candles) {
  const warmup = 20;
  const minimumCandles = warmup + Math.max(config.backtestLookaheadCandles, 1) + 1;
  if (!Array.isArray(candles) || candles.length < minimumCandles) {
    throw new Error(`At least ${minimumCandles} candles are required to run the backtest.`);
  }

  const trades = [];
  for (let index = warmup; index < candles.length - 1; index += 1) {
    const slice = candles.slice(0, index + 1);
    const signal = analyzeSignal(slice, config);
    if (signal.status !== "TRADEABLE") {
      continue;
    }

    const forwardCandles = candles.slice(index + 1, index + 1 + config.backtestLookaheadCandles);
    const outcome = resolveOutcome(signal, forwardCandles);
    trades.push({
      timestamp: signal.timestamp,
      direction: signal.direction,
      score: signal.score,
      confirmationCount: signal.confirmations?.count ?? 0,
      entryZone: signal.entryZone,
      stopLoss: signal.stopLoss,
      targets: signal.targets,
      outcome: outcome.outcome,
      exitReason: outcome.exitReason,
      exitPrice: outcome.exitPrice,
      rewardRisk: outcome.rewardRisk,
      pnlPoints: outcome.pnlPoints
    });
  }

  const stats = buildStats(trades);
  const journal = {
    generatedAt: new Date().toISOString(),
    sourceCandles: candles.length,
    lookaheadCandles: config.backtestLookaheadCandles,
    stats,
    trades
  };

  writeJson(runtimePath(config, "trade-journal.json"), journal);
  writeJson(runtimePath(config, "validation-summary.json"), {
    generatedAt: journal.generatedAt,
    stats,
    lastFiveTrades: trades.slice(-5)
  });

  return journal;
}

export function readValidationSummary(config) {
  return readJson(runtimePath(config, "validation-summary.json"), null);
}
