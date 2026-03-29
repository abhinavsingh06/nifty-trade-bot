import { getConfig, getEnv } from "./config.js";
import { runBacktest } from "./backtestEngine.js";
import { exchangeRequestToken, getLoginUrl, isSessionExpiredError, refreshInstruments } from "./kiteApi.js";
import { loadBacktestCandles, loadRuntimeCandles } from "./marketData.js";
import {
  checkSessionRun,
  generateAutoTradeRun,
  generateSignalRun,
  generateTicketRun,
  monitorPositionsRun,
  reviewForwardSignalsRun,
  reconcileBrokerRun
} from "./executor.js";
import { persistRunArtifact } from "./reporters.js";
import { formatCurrency, formatTimestamp } from "./utils.js";

function printSignal(signal, timezone) {
  console.log(`Signal status: ${signal.status}`);
  console.log(`Direction: ${signal.direction}`);
  console.log(`Score: ${signal.score}/10`);
  if (signal.dualSide?.call && signal.dualSide?.put) {
    console.log(
      `Dual chart: CALL ${signal.dualSide.call.score}/10 (${signal.dualSide.call.status}, ${signal.dualSide.call.confirmationCount}c) vs PUT ${signal.dualSide.put.score}/10 (${signal.dualSide.put.status}, ${signal.dualSide.put.confirmationCount}c)`
    );
  }
  console.log(`Confirmations: ${signal.confirmations?.count ?? 0}/${signal.confirmations?.minimumRequired ?? 0}`);
  console.log(`Time: ${formatTimestamp(signal.timestamp, timezone)}`);
  console.log(`Entry zone: ${signal.entryZone[0]} - ${signal.entryZone[1]}`);
  console.log(`Stop loss: ${signal.stopLoss}`);
  console.log(`Targets: ${signal.targets.join(", ")}`);
  console.log(`Spot price: ${signal.spotPrice}`);
  console.log(`Option: ${signal.option?.tradingsymbol ?? "not resolved"}`);
  console.log(`Reason: ${signal.reasons.join("; ") || "No qualifying reason"}`);
}

function printRiskCheck(riskCheck) {
  console.log(`Quantity: ${riskCheck.quantity}`);
  console.log(`Estimated risk: ${formatCurrency(riskCheck.notionalRisk)}`);
  console.log("Checks:");
  for (const check of riskCheck.checks) {
    console.log(`- ${check.pass ? "PASS" : "FAIL"}: ${check.name} (${check.detail})`);
  }
}

function printMonitorResult(result) {
  console.log(`Monitor status: ${result.status}`);
  if (result.reason) {
    console.log(`Reason: ${result.reason}`);
  }
  if (result.spotPrice) {
    console.log(`Spot price: ${result.spotPrice}`);
  }
  if (!result.positions?.length) {
    console.log("No positions to report.");
    return;
  }

  for (const item of result.positions) {
    console.log(`- ${item.id}: ${item.action}`);
    if (item.exitReason) {
      console.log(`  Exit reason: ${item.exitReason}`);
    }
    if (item.position?.activeStopLoss) {
      console.log(`  Active stop: ${item.position.activeStopLoss}`);
    }
    if (item.position?.target2) {
      console.log(`  Target2: ${item.position.target2}`);
    }
  }
}

function printSessionResult(result) {
  console.log(`Session status: ${result.status}`);
  console.log(`User: ${result.profile.userName} (${result.profile.userId})`);
  console.log(`Email: ${result.profile.email}`);
  console.log(`Broker: ${result.profile.broker}`);
  console.log(`Exchanges: ${result.profile.exchanges.join(", ")}`);
}

function printReconcileResult(result) {
  console.log(`Reconcile status: ${result.status}`);
  console.log(`User: ${result.profile.userName} (${result.profile.userId})`);
  console.log(`Local open: ${result.totals.localOpen}`);
  console.log(`Local closed: ${result.totals.localClosed}`);
  console.log(`Broker orders today: ${result.totals.brokerOrdersToday}`);
  console.log(`Broker net positions: ${result.totals.brokerNetPositions}`);
  if (!result.openPositions.length) {
    console.log("No local open positions to reconcile.");
    return;
  }

  for (const position of result.openPositions) {
    console.log(`- ${position.localId}`);
    console.log(`  Option: ${position.localOption}`);
    console.log(`  Broker order: ${position.brokerOrderId ?? "n/a"} (${position.brokerOrderStatus})`);
    console.log(`  Filled qty: ${position.brokerFilledQuantity}`);
    console.log(`  Broker net qty: ${position.brokerNetQuantity}`);
  }
}

function printBacktestResult(result) {
  console.log(`Backtest generated at: ${result.generatedAt}`);
  console.log(`Signals tested: ${result.stats.totalSignals}`);
  console.log(`Closed signals: ${result.stats.closedSignals}`);
  console.log(`Win rate: ${result.stats.winRate}%`);
  console.log(`Avg win (R): ${result.stats.avgWinR}`);
  console.log(`Avg loss (R): ${result.stats.avgLossR}`);
  console.log(`Expectancy (R): ${result.stats.expectancyR}`);
  console.log(`Max drawdown (R): ${result.stats.maxDrawdownR}`);
}

function printForwardReviewResult(result) {
  console.log(`Forward review status: ${result.status}`);
  console.log(`Pending signals: ${result.pendingCount}`);
  console.log(`Resolved signals: ${result.resolvedCount}`);
  if (!result.resolvedNow?.length) {
    console.log("No signals resolved in this review.");
    return;
  }

  for (const item of result.resolvedNow) {
    console.log(`- ${item.id}: ${item.outcome}`);
  }
}

async function main() {
  const command = process.argv[2] ?? "smoke";
  const config = getConfig();

  if (command === "auto-signals") {
    const { isAutoSignalsEnabled, startAutoSignalScheduler } = await import("./autoSignalScheduler.js");
    if (!isAutoSignalsEnabled()) {
      console.error("Set AUTO_SIGNALS_ENABLED=1 in .env to run the unattended signal loop.");
      process.exit(1);
    }
    startAutoSignalScheduler({ config, onAfterRun: async () => {} });
    const min = getEnv("AUTO_SIGNALS_INTERVAL_MINUTES", "15");
    console.log(
      `Auto-signals daemon running (${config.marketTimezone}). Interval ~${min} min while market is open. Ctrl+C to stop.`
    );
    return new Promise(() => {});
  }

  const allowSampleFallback = ["smoke", "backtest"].includes(command) || process.env.BOT_ALLOW_SAMPLE_FALLBACK === "1";
  const candleResult = ["login-url", "session-exchange", "instruments-refresh", "monitor", "reconcile", "check-session", "review-forward"].includes(command)
    ? { candles: [], source: "none", skipped: false, reason: "" }
    : await loadRuntimeCandles(config, { allowSampleFallback });

  if (command === "login-url") {
    console.log(getLoginUrl(config));
    return;
  }

  if (command === "session-exchange") {
    const requestToken = process.argv[3];
    if (!requestToken) {
      throw new Error("Pass the request token as: npm run session:exchange -- <request_token>");
    }

    const result = await exchangeRequestToken(config, requestToken);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "instruments-refresh") {
    const filePath = await refreshInstruments(config, config.optionSelection.exchange);
    console.log(`Saved instruments to ${filePath}`);
    return;
  }

  if (command === "monitor") {
    const result = await monitorPositionsRun(config, { enableLiveBrokerData: true });
    printMonitorResult(result);
    console.log(`Saved: ${persistRunArtifact(config, command, result)}`);
    return;
  }

  if (command === "check-session") {
    const result = await checkSessionRun(config);
    printSessionResult(result);
    console.log(`Saved: ${persistRunArtifact(config, command, result)}`);
    return;
  }

  if (command === "reconcile") {
    const result = await reconcileBrokerRun(config);
    printReconcileResult(result);
    console.log(`Saved: ${persistRunArtifact(config, command, result)}`);
    return;
  }

  if (command === "review-forward") {
    const result = await reviewForwardSignalsRun(config);
    printForwardReviewResult(result);
    console.log(`Saved: ${persistRunArtifact(config, command, result)}`);
    return;
  }

  if (command === "backtest") {
    const backtestCandles = await loadBacktestCandles(config);
    if (backtestCandles.reason) {
      console.log(`Data source: ${backtestCandles.source} (${backtestCandles.reason})`);
    }
    const result = runBacktest(config, backtestCandles.candles);
    printBacktestResult(result);
    console.log(`Saved: ${persistRunArtifact(config, command, result)}`);
    return;
  }

  if (candleResult.skipped) {
    const result = {
      status: "SKIPPED",
      reason: candleResult.reason,
      timestamp: new Date().toISOString(),
      command
    };
    console.log(result.reason);
    console.log(`Saved: ${persistRunArtifact(config, command, result)}`);
    return;
  }

  const candles = candleResult.candles;
  const runOptions = {
    enableLiveBrokerData: candleResult.source === "live"
  };
  if (candleResult.reason) {
    console.log(`Data source: ${candleResult.source} (${candleResult.reason})`);
  }

  if (command === "signals") {
    const result = await generateSignalRun(candles, config, runOptions);
    printSignal(result.signal, config.marketTimezone);
    console.log(`Saved: ${persistRunArtifact(config, command, result)}`);
    return;
  }

  if (command === "tickets") {
    const result = await generateTicketRun(candles, config, runOptions);
    printSignal(result.signal, config.marketTimezone);
    printRiskCheck(result.riskCheck);
    console.log(`Action: ${result.ticket.action}`);
    console.log(`Saved: ${persistRunArtifact(config, command, result)}`);
    return;
  }

  if (command === "autotrade") {
    const result = await generateAutoTradeRun(candles, config, runOptions);
    printSignal(result.signal, config.marketTimezone);
    printRiskCheck(result.riskCheck);
    console.log(`Broker mode: ${result.brokerResponse.mode}`);
    console.log(`Broker message: ${result.brokerResponse.message}`);
    console.log(`Broker order id: ${result.brokerResponse.brokerOrder?.order_id ?? "n/a"}`);
    console.log(`Saved: ${persistRunArtifact(config, command, result)}`);
    return;
  }

  if (command === "smoke") {
    console.log("Running signal flow...");
    await mainWithCommand("signals");
    console.log("");
    console.log("Running ticket flow...");
    await mainWithCommand("tickets");
    console.log("");
    console.log("Running auto-trade flow...");
    await mainWithCommand("autotrade");
    console.log("");
    console.log("Running backtest flow...");
    await mainWithCommand("backtest");
    console.log("");
    console.log("Running forward review flow...");
    await mainWithCommand("review-forward");
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

async function mainWithCommand(command) {
  const original = process.argv[2];
  const originalFallback = process.env.BOT_ALLOW_SAMPLE_FALLBACK;
  process.argv[2] = command;
  process.env.BOT_ALLOW_SAMPLE_FALLBACK = "1";
  try {
    await main();
  } finally {
    process.argv[2] = original;
    if (originalFallback === undefined) {
      delete process.env.BOT_ALLOW_SAMPLE_FALLBACK;
    } else {
      process.env.BOT_ALLOW_SAMPLE_FALLBACK = originalFallback;
    }
  }
}

main().catch((error) => {
  if (isSessionExpiredError(error)) {
    console.error("Zerodha session has expired or is invalid. Run `npm run login:url`, log in again, then exchange the new request token with `npm run session:exchange -- <request_token>`.");
    process.exitCode = 1;
    return;
  }
  console.error(error.message);
  process.exitCode = 1;
});
