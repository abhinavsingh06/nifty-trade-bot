import path from "node:path";
import { readJson, writeJson } from "./utils.js";

function getStorePath(config) {
  return path.join(config.runtimeDir, "positions.json");
}

function loadStore(config) {
  const filePath = getStorePath(config);
  const store = readJson(filePath, {
    open: [],
    closed: []
  });

  return {
    filePath,
    store
  };
}

function saveStore(filePath, store) {
  writeJson(filePath, store);
}

export function listOpenPositions(config) {
  return loadStore(config).store.open;
}

export function listClosedPositions(config) {
  return loadStore(config).store.closed;
}

export function createPositionRecord(config, signal, riskCheck, brokerResponse) {
  const { filePath, store } = loadStore(config);
  const entryOptionPrice = Number(signal.optionLastPrice ?? 0) || null;
  const optionRisk =
    entryOptionPrice != null
      ? Number(Math.max(entryOptionPrice * 0.25, 6).toFixed(2))
      : null;
  const position = {
    id: `${signal.option?.tradingsymbol ?? signal.symbol}-${Date.now()}`,
    status: "OPEN",
    createdAt: new Date().toISOString(),
    symbol: signal.symbol,
    direction: signal.direction,
    option: signal.option,
    quantity: riskCheck.quantity,
    lots: Math.max(1, Math.round(Number(riskCheck.quantity ?? 0) / Math.max(config.optionLotSize, 1))),
    entryUnderlying: signal.entryZone[1],
    entryOptionPrice,
    entryZone: signal.entryZone,
    initialStopLoss: signal.stopLoss,
    activeStopLoss: signal.stopLoss,
    initialOptionStopLoss: entryOptionPrice != null && optionRisk != null ? Number(Math.max(entryOptionPrice - optionRisk, 0.5).toFixed(2)) : null,
    activeOptionStopLoss: entryOptionPrice != null && optionRisk != null ? Number(Math.max(entryOptionPrice - optionRisk, 0.5).toFixed(2)) : null,
    target1: signal.targets[0],
    target2: signal.targets[1],
    optionTarget1: entryOptionPrice != null && optionRisk != null ? Number((entryOptionPrice + optionRisk * 1.4).toFixed(2)) : null,
    optionTarget2: entryOptionPrice != null && optionRisk != null ? Number((entryOptionPrice + optionRisk * 2.1).toFixed(2)) : null,
    target1Hit: false,
    invalidation: signal.invalidation,
    score: signal.score,
    reasons: signal.reasons,
    brokerMode: brokerResponse.mode,
    brokerOrderId: brokerResponse.brokerOrder?.order_id ?? null,
    lastObservedSpot: signal.spotPrice,
    lastObservedOptionPrice: null
  };

  store.open.push(position);
  saveStore(filePath, store);
  return position;
}

export function updateOpenPosition(config, positionId, updater) {
  const { filePath, store } = loadStore(config);
  const index = store.open.findIndex((position) => position.id === positionId);
  if (index === -1) {
    return null;
  }

  const current = store.open[index];
  const next = updater({ ...current });
  store.open[index] = next;
  saveStore(filePath, store);
  return next;
}

export function removeOpenPosition(config, positionId) {
  const { filePath, store } = loadStore(config);
  const index = store.open.findIndex((position) => position.id === positionId);
  if (index === -1) {
    return null;
  }

  const [removed] = store.open.splice(index, 1);
  saveStore(filePath, store);
  return removed;
}

export function closePositionRecord(config, positionId, exitInfo) {
  const { filePath, store } = loadStore(config);
  const index = store.open.findIndex((position) => position.id === positionId);
  if (index === -1) {
    return null;
  }

  const [position] = store.open.splice(index, 1);
  const closed = {
    ...position,
    status: "CLOSED",
    closedAt: new Date().toISOString(),
    exit: exitInfo
  };
  store.closed.push(closed);
  saveStore(filePath, store);
  return closed;
}

export function evaluateExit(position, spotPrice, optionPrice = null) {
  const updated = {
    ...position,
    lastObservedSpot: spotPrice,
    lastObservedOptionPrice: optionPrice
  };

  if (!updated.target1Hit) {
    const hitTarget1Underlying =
      updated.direction === "CALL" ? spotPrice >= updated.target1 : spotPrice <= updated.target1;
    const hitTarget1Option =
      optionPrice != null && updated.optionTarget1 != null ? optionPrice >= updated.optionTarget1 : false;
    const hitTarget1 = hitTarget1Underlying || hitTarget1Option;

    if (hitTarget1) {
      updated.target1Hit = true;
      updated.activeStopLoss = updated.entryUnderlying;
      if (updated.entryOptionPrice != null) {
        updated.activeOptionStopLoss = updated.entryOptionPrice;
      }
    }
  }

  const target2HitUnderlying =
    updated.direction === "CALL" ? spotPrice >= updated.target2 : spotPrice <= updated.target2;
  const target2HitOption =
    optionPrice != null && updated.optionTarget2 != null ? optionPrice >= updated.optionTarget2 : false;
  const target2Hit = target2HitUnderlying || target2HitOption;
  if (target2Hit) {
    return {
      updatedPosition: updated,
      shouldExit: true,
      exitReason: target2HitOption ? "OPTION_TARGET_2_HIT" : "TARGET_2_HIT"
    };
  }

  const stopHitUnderlying =
    updated.direction === "CALL" ? spotPrice <= updated.activeStopLoss : spotPrice >= updated.activeStopLoss;
  const stopHitOption =
    optionPrice != null && updated.activeOptionStopLoss != null ? optionPrice <= updated.activeOptionStopLoss : false;
  const stopHit = stopHitUnderlying || stopHitOption;
  if (stopHit) {
    return {
      updatedPosition: updated,
      shouldExit: true,
      exitReason: stopHitOption
        ? updated.target1Hit
          ? "OPTION_TRAILING_STOP_HIT"
          : "OPTION_STOP_LOSS_HIT"
        : updated.target1Hit
          ? "TRAILING_STOP_HIT"
          : "STOP_LOSS_HIT"
    };
  }

  return {
    updatedPosition: updated,
    shouldExit: false,
    exitReason: null
  };
}
