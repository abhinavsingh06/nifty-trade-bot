/**
 * Aggregates closed paper option positions for dashboard analytics.
 */
function isPaperDeskClose(p) {
  if (p.brokerMode === "live") return false;
  return p.brokerMode === "paper" || p.brokerMode == null;
}

export function buildPaperAnalytics(positions) {
  const closed = (positions?.closed ?? []).filter(isPaperDeskClose);
  const trades = [];
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let totalPnl = 0;

  for (const p of closed) {
    const qty = Number(p.quantity ?? 0);
    const entry = p.entryOptionPrice != null ? Number(p.entryOptionPrice) : null;
    const exitRaw =
      p.exit?.optionPrice ?? p.exit?.optionFillPrice ?? p.exit?.fillPrice ?? null;
    const exit = exitRaw != null ? Number(exitRaw) : null;
    if (entry == null || exit == null || !Number.isFinite(qty)) {
      trades.push({
        id: p.id,
        option: p.option?.tradingsymbol ?? p.symbol,
        closedAt: p.closedAt,
        setupId: p.paperSetupId ?? null,
        pnl: null,
        outcome: "UNKNOWN"
      });
      continue;
    }
    const pnl = Number(((exit - entry) * qty).toFixed(2));
    totalPnl = Number((totalPnl + pnl).toFixed(2));
    let outcome = "FLAT";
    if (pnl > 0) {
      outcome = "WIN";
      wins += 1;
    } else if (pnl < 0) {
      outcome = "LOSS";
      losses += 1;
    } else {
      breakeven += 1;
    }
    trades.push({
      id: p.id,
      option: p.option?.tradingsymbol ?? p.symbol,
      direction: p.direction,
      closedAt: p.closedAt,
      setupId: p.paperSetupId ?? null,
      entryPremium: entry,
      exitPremium: exit,
      quantity: qty,
      pnl,
      outcome,
      exitReason: p.exit?.reason ?? null
    });
  }

  const decided = wins + losses + breakeven;
  const winRatePct = decided > 0 ? Number(((wins / decided) * 100).toFixed(1)) : null;

  /** @type {Record<string, { count: number; wins: number; losses: number; breakeven: number; totalPnl: number }>} */
  const bySetup = {};
  for (const t of trades) {
    if (t.pnl == null) continue;
    const sid = t.setupId ?? "_unknown";
    if (!bySetup[sid]) {
      bySetup[sid] = { count: 0, wins: 0, losses: 0, breakeven: 0, totalPnl: 0 };
    }
    const bucket = bySetup[sid];
    bucket.count += 1;
    bucket.totalPnl = Number((bucket.totalPnl + t.pnl).toFixed(2));
    if (t.outcome === "WIN") bucket.wins += 1;
    else if (t.outcome === "LOSS") bucket.losses += 1;
    else bucket.breakeven += 1;
  }

  const bySetupRows = Object.entries(bySetup)
    .map(([setupId, v]) => ({
      setupId,
      count: v.count,
      wins: v.wins,
      losses: v.losses,
      breakeven: v.breakeven,
      totalPnl: v.totalPnl,
      winRatePct:
        v.wins + v.losses + v.breakeven > 0
          ? Number(((v.wins / (v.wins + v.losses + v.breakeven)) * 100).toFixed(1))
          : null
    }))
    .sort((a, b) => (b.totalPnl !== a.totalPnl ? b.totalPnl - a.totalPnl : a.setupId.localeCompare(b.setupId)));

  return {
    closedCount: closed.length,
    withPnlCount: trades.filter((t) => t.pnl != null).length,
    wins,
    losses,
    breakeven,
    winRatePct,
    totalRealizedPnl: totalPnl,
    trades: trades.slice().reverse(),
    bySetup,
    bySetupRows
  };
}
