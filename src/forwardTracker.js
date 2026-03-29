import path from "node:path";
import { readJson, writeJson } from "./utils.js";

function getStorePath(config) {
  return path.join(config.runtimeDir, "forward-tracker.json");
}

function loadStore(config) {
  return readJson(getStorePath(config), {
    pending: [],
    resolved: []
  });
}

function saveStore(config, store) {
  writeJson(getStorePath(config), store);
}

export function registerForwardSignal(config, signal) {
  if (signal.status !== "TRADEABLE") {
    return null;
  }

  const store = loadStore(config);
  const id = `${signal.timestamp}-${signal.direction}`;
  if (store.pending.find((item) => item.id === id) || store.resolved.find((item) => item.id === id)) {
    return null;
  }

  const record = {
    id,
    createdAt: new Date().toISOString(),
    signalTimestamp: signal.timestamp,
    direction: signal.direction,
    score: signal.score,
    entryZone: signal.entryZone,
    stopLoss: signal.stopLoss,
    targets: signal.targets,
    option: signal.option ?? null,
    entryUnderlying: signal.spotPrice ?? signal.entryZone[1],
    entryOptionPrice: signal.optionLastPrice ?? null,
    status: "PENDING"
  };
  store.pending.push(record);
  saveStore(config, store);
  return record;
}

export function reviewForwardSignals(config, liveSnapshot) {
  const store = loadStore(config);
  const remaining = [];
  const resolvedNow = [];

  for (const record of store.pending) {
    let outcome = null;
    if (record.direction === "CALL") {
      if (liveSnapshot.spotPrice <= record.stopLoss) {
        outcome = "STOP_LOSS_HIT";
      } else if (liveSnapshot.spotPrice >= record.targets[1]) {
        outcome = "TARGET_2_HIT";
      } else if (liveSnapshot.spotPrice >= record.targets[0]) {
        outcome = "TARGET_1_HIT";
      }
    } else {
      if (liveSnapshot.spotPrice >= record.stopLoss) {
        outcome = "STOP_LOSS_HIT";
      } else if (liveSnapshot.spotPrice <= record.targets[1]) {
        outcome = "TARGET_2_HIT";
      } else if (liveSnapshot.spotPrice <= record.targets[0]) {
        outcome = "TARGET_1_HIT";
      }
    }

    if (!outcome) {
      remaining.push(record);
      continue;
    }

    resolvedNow.push({
      ...record,
      status: "RESOLVED",
      outcome,
      reviewedAt: new Date().toISOString(),
      exitUnderlying: liveSnapshot.spotPrice,
      exitOptionPrice: liveSnapshot.optionPrice ?? null
    });
  }

  const updatedStore = {
    pending: remaining,
    resolved: [...store.resolved, ...resolvedNow]
  };
  saveStore(config, updatedStore);

  return {
    reviewedAt: new Date().toISOString(),
    spotPrice: liveSnapshot.spotPrice,
    optionPrice: liveSnapshot.optionPrice ?? null,
    pendingCount: updatedStore.pending.length,
    resolvedCount: updatedStore.resolved.length,
    resolvedNow
  };
}

export function readForwardTracker(config) {
  return loadStore(config);
}
