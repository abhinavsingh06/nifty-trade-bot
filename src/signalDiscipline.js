import { detectRange, getLatestCandle } from "./marketData.js";

/**
 * Stricter "patient" path: avoid rushed TRADEABLE calls when structure is
 * compressed or the latest bar has not confirmed continuation of the prior bar.
 */
export function applyTradeDiscipline(signal, candles, config) {
  if (config.tradeDiscipline !== "patient" || candles.length < 2) {
    return signal;
  }

  const latest = getLatestCandle(candles);
  const previous = candles[candles.length - 2];
  const recentRange = detectRange(candles, 12);
  const rangeWidth = recentRange.high - recentRange.low;
  const minRange =
    config.signalMinRecentRangePoints > 0
      ? config.signalMinRecentRangePoints
      : 28;
  const buf = config.signalFollowThroughBuffer;

  const followThroughCall =
    latest.close > previous.high - buf && latest.close > latest.open;
  const followThroughPut =
    latest.close < previous.low + buf && latest.close < latest.open;

  const rangeOk = rangeWidth >= minRange;
  const notes = [];

  if (!rangeOk) {
    notes.push(
      `Patient filter: recent 12-bar range is ${rangeWidth.toFixed(1)} pts (need ≥${minRange} pts for directional commitment).`
    );
  }

  if (signal.direction === "CALL") {
    if (!followThroughCall) {
      notes.push(
        "Patient filter: need a green close above the prior bar high (follow-through) before a tradeable long read."
      );
    }
    if (signal.status === "TRADEABLE" && (!rangeOk || !followThroughCall)) {
      signal.status = "WAIT_CONFIRMATION";
    }
  } else {
    if (!followThroughPut) {
      notes.push(
        "Patient filter: need a red close below the prior bar low (follow-through) before a tradeable short read."
      );
    }
    if (signal.status === "TRADEABLE" && (!rangeOk || !followThroughPut)) {
      signal.status = "WAIT_CONFIRMATION";
    }
  }

  if (notes.length) {
    signal.disciplineNotes = notes;
    signal.reasons = [...signal.reasons, ...notes];
  }

  if (signal.dualSide?.call && signal.dualSide.call.status === "TRADEABLE") {
    if (!rangeOk || !followThroughCall) {
      signal.dualSide.call.status = "WAIT_CONFIRMATION";
    }
  }
  if (signal.dualSide?.put && signal.dualSide.put.status === "TRADEABLE") {
    if (!rangeOk || !followThroughPut) {
      signal.dualSide.put.status = "WAIT_CONFIRMATION";
    }
  }

  return signal;
}
