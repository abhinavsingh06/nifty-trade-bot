import path from "node:path";
import { isMarketOpen, readJson, writeJson } from "./utils.js";

function getDateKey(timestamp, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

export function getTradeState(config, timestamp) {
  const filePath = path.join(config.runtimeDir, "trade-state.json");
  const dateKey = getDateKey(timestamp, config.marketTimezone);
  const state = readJson(filePath, {});

  if (!state[dateKey]) {
    state[dateKey] = {
      realizedPnL: 0,
      tradesPlaced: 0,
      history: []
    };
    writeJson(filePath, state);
  }

  if (!Array.isArray(state[dateKey].history)) {
    state[dateKey].history = [];
    writeJson(filePath, state);
  }

  return {
    filePath,
    dateKey,
    state
  };
}

export function buildRiskCheck(config, signal) {
  const perUnitRisk = Math.abs(signal.entryZone[0] - signal.stopLoss);
  const affordableUnits = Math.max(1, Math.floor(config.risk.maxRiskPerTrade / Math.max(perUnitRisk, 1)));
  const quantity = Math.max(config.optionLotSize, Math.floor(affordableUnits / config.optionLotSize) * config.optionLotSize);
  const notionalRisk = quantity * perUnitRisk;

  const tradeState = getTradeState(config, signal.timestamp);
  const dailyState = tradeState.state[tradeState.dateKey];

  const checks = [
    {
      name: "signal quality",
      pass: signal.status === "TRADEABLE",
      detail: `score ${signal.score} vs threshold ${config.minSignalScore}`
    },
    {
      name: "confirmation stack",
      pass: (signal.confirmations?.count ?? 0) >= config.minConfirmationCount,
      detail: `${signal.confirmations?.count ?? 0} confirmations vs minimum ${config.minConfirmationCount}`
    },
    {
      name: "market session",
      pass: isMarketOpen(signal.timestamp, config),
      detail: `${signal.timestamp} in ${config.marketTimezone}`
    },
    {
      name: "option contract resolved",
      pass: Boolean(signal.option),
      detail: signal.option?.tradingsymbol ?? "no option instrument selected"
    },
    {
      name: "daily loss limit",
      pass: dailyState.realizedPnL > -config.risk.maxDailyLoss,
      detail: `PnL ${dailyState.realizedPnL} vs floor ${-config.risk.maxDailyLoss}`
    },
    {
      name: "trade count limit",
      pass: dailyState.tradesPlaced < config.risk.maxTradesPerDay,
      detail: `trades ${dailyState.tradesPlaced} vs limit ${config.risk.maxTradesPerDay}`
    },
    {
      name: "per trade risk limit",
      pass: notionalRisk <= config.risk.maxRiskPerTrade * 1.2,
      detail: `estimated risk ${notionalRisk.toFixed(2)}`
    }
  ];

  return {
    quantity,
    perUnitRisk,
    notionalRisk,
    checks,
    approved: checks.every((check) => check.pass),
    tradeState
  };
}

export function recordTradePlacement(riskCheck) {
  const { tradeState } = riskCheck;
  tradeState.state[tradeState.dateKey].tradesPlaced += 1;
  writeJson(tradeState.filePath, tradeState.state);
}

export function recordTradeExit(config, closedPosition) {
  const timestamp = closedPosition.closedAt ?? new Date().toISOString();
  const tradeState = getTradeState(config, timestamp);
  const dayState = tradeState.state[tradeState.dateKey];
  const entry = Number(closedPosition.entryUnderlying ?? 0);
  const exit = Number(closedPosition.exit?.spotPrice ?? entry);
  const signedPoints =
    closedPosition.direction === "CALL" ? exit - entry : entry - exit;
  const realizedPnL = Number((signedPoints * Number(closedPosition.quantity ?? 0)).toFixed(2));

  dayState.realizedPnL = Number((dayState.realizedPnL + realizedPnL).toFixed(2));
  dayState.history.push({
    positionId: closedPosition.id,
    closedAt: timestamp,
    direction: closedPosition.direction,
    option: closedPosition.option?.tradingsymbol ?? closedPosition.symbol,
    realizedPnL,
    exitReason: closedPosition.exit?.reason ?? "UNKNOWN"
  });
  writeJson(tradeState.filePath, tradeState.state);

  return realizedPnL;
}
