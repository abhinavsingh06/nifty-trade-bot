export function buildOpeningContext({ spot, previousClose, openPrice }) {
  if (spot == null) {
    return null;
  }

  const gapFromPrev =
    previousClose != null && previousClose !== 0
      ? Number((((spot - previousClose) / previousClose) * 100).toFixed(2))
      : null;

  let gapFromOpenPct = null;
  if (openPrice != null && openPrice !== 0) {
    gapFromOpenPct = Number((((spot - openPrice) / openPrice) * 100).toFixed(2));
  }

  let openVsPrevCloseGapPct = null;
  if (openPrice != null && previousClose != null && previousClose !== 0) {
    openVsPrevCloseGapPct = Number((((openPrice - previousClose) / previousClose) * 100).toFixed(2));
  }

  let regime = "regular";
  let hint =
    "Trade relative to prior close and the official open — both matter for gap and mean-reversion risk.";

  if (openVSPrevLabel(openVsPrevCloseGapPct) === "up") {
    regime = "gap_up_open";
    hint =
      "Session opened above prior close — longs want defence of the open; failed hold can invite gap-fill.";
  } else if (openVSPrevLabel(openVsPrevCloseGapPct) === "down") {
    regime = "gap_down_open";
    hint =
      "Session opened below prior close — bears want follow-through; reclaim through the gap warns shorts.";
  }

  if (gapFromOpenPct != null) {
    if (gapFromOpenPct >= 0.35 && regime.startsWith("gap_up")) {
      hint += " Spot is stretching above the day’s open — trending risk is elevated.";
    }
    if (gapFromOpenPct <= -0.35 && regime.startsWith("gap_down")) {
      hint += " Spot is pressing under the open — watch for flush vs short trap.";
    }
    if (regime === "gap_up_open" && gapFromOpenPct <= -0.2) {
      regime = "gap_up_fade";
      hint =
        "Gap-up open but price has slipped materially below the open — fade / balance-day behaviour is more likely until buyers reclaim.";
    }
    if (regime === "gap_down_open" && gapFromOpenPct >= 0.2) {
      regime = "gap_down_reclaim";
      hint =
        "Gap-down but price is back above the open — bearish edge fades until range lows break again.";
    }
  }

  return {
    openPrice: openPrice ?? null,
    gapFromOpenPct,
    gapFromPrevClosePct: gapFromPrev,
    openVsPrevCloseGapPct,
    regime,
    hint
  };
}

function openVSPrevLabel(pct) {
  if (pct == null || Number.isNaN(pct)) return "flat";
  if (pct >= 0.35) return "up";
  if (pct <= -0.35) return "down";
  return "flat";
}
