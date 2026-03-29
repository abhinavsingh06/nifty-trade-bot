import path from "node:path";
import { ensureDir, formatCurrency, formatTimestamp, writeJson } from "./utils.js";

export function buildManualTicket(signal, riskCheck, config) {
  return {
    symbol: signal.symbol,
    action: `${signal.direction}_BUY`,
    tradingsymbol: signal.option?.tradingsymbol ?? null,
    exchange: signal.option?.exchange ?? null,
    quantity: riskCheck.quantity,
    product: "MIS",
    orderType: "LIMIT",
    entryZone: signal.entryZone,
    stopLoss: signal.stopLoss,
    targets: signal.targets,
    invalidation: signal.invalidation,
    score: signal.score,
    reasons: signal.reasons,
    estimatedRisk: formatCurrency(riskCheck.notionalRisk),
    timestamp: formatTimestamp(signal.timestamp, config.marketTimezone)
  };
}

export function buildPositionSummary(position, config) {
  return {
    id: position.id,
    option: position.option?.tradingsymbol ?? position.symbol,
    direction: position.direction,
    quantity: position.quantity,
    lots: position.lots,
    entryUnderlying: position.entryUnderlying,
    entryOptionPrice: position.entryOptionPrice,
    activeStopLoss: position.activeStopLoss,
    activeOptionStopLoss: position.activeOptionStopLoss,
    target1: position.target1,
    target2: position.target2,
    optionTarget1: position.optionTarget1,
    optionTarget2: position.optionTarget2,
    target1Hit: position.target1Hit,
    lastObservedSpot: position.lastObservedSpot,
    lastObservedOptionPrice: position.lastObservedOptionPrice,
    brokerMode: position.brokerMode,
    createdAt: formatTimestamp(position.createdAt, config.marketTimezone)
  };
}

export function persistRunArtifact(config, command, payload) {
  ensureDir(config.runtimeDir);
  const filePath = path.join(config.runtimeDir, `${command}-latest.json`);
  writeJson(filePath, payload);
  return filePath;
}
