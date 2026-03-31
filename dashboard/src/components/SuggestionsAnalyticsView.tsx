import type { DashboardState } from "../types";
import { escapeText, inr } from "../ui";

function outcomeProfitLabel(outcome: string | undefined): "win" | "loss" | "other" {
  if (!outcome) return "other";
  if (outcome === "STOP_LOSS_HIT") return "loss";
  if (outcome.startsWith("TARGET_")) return "win";
  return "other";
}

function aggregateJournalBuys(
  entries: Array<{ kind?: string; setupId?: string }> | undefined,
) {
  const map = new Map<string, number>();
  for (const e of entries ?? []) {
    if (e?.kind !== "PAPER_BUY" || !e.setupId) continue;
    map.set(e.setupId, (map.get(e.setupId) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function SuggestionsAnalyticsView({
  data,
  loading,
  onRefresh,
}: {
  data: DashboardState | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const analytics = data?.runtime.paperAnalytics;
  const tracker = data?.runtime.forwardTracker;
  const journal = data?.runtime.tradingDay?.journal;
  const wallet = data?.runtime.paperWallet;
  const backtest = data?.runtime.backtest;
  const buyCounts = aggregateJournalBuys(journal?.entries);

  const resolved = tracker?.resolved ?? [];
  let fwdWins = 0;
  let fwdLosses = 0;
  let fwdOther = 0;
  for (const r of resolved) {
    const o = outcomeProfitLabel(r?.outcome);
    if (o === "win") fwdWins += 1;
    else if (o === "loss") fwdLosses += 1;
    else fwdOther += 1;
  }

  const paperWins = analytics?.wins ?? 0;
  const paperLosses = analytics?.losses ?? 0;
  const paperDecided = paperWins + paperLosses + (analytics?.breakeven ?? 0);
  const paperPnl = analytics?.totalRealizedPnl ?? 0;
  const rows = analytics?.bySetupRows ?? [];
  const tradeRows = (analytics?.trades ?? []).filter((t) => t.pnl != null);
  const walletRealized = wallet?.realizedPnL;

  if (!data && loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 px-6 py-16 text-center text-slate-400">
        <p className="text-sm font-medium text-slate-300">Loading dashboard…</p>
        <p className="mt-2 text-xs text-slate-500">
          If this hangs, open the home page first, then return here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/50 p-4 ring-1 ring-white/5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-teal-300/90">
            Suggested setups
          </p>
          <h1 className="font-display mt-2 text-2xl font-bold text-white md:text-3xl">
            Profit &amp; loss analytics
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
            Stats come from your <strong className="text-slate-300">runtime</strong> folder on
            disk. Paper numbers use option entry/exit premiums. Rows group by{" "}
            <span className="font-mono text-slate-300">setup id</span> from dashboard{" "}
            <strong className="text-slate-300">Paper buy</strong>. Forward review uses spot vs
            your levels (run <code className="text-slate-500">review-forward</code>).
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            void onRefresh().catch(() => {
              /* App handles errors */
            })
          }
          className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-50">
          Refresh data
        </button>
      </div>

      {wallet &&
      (wallet.cashBalance != null ||
        wallet.equity != null ||
        walletRealized != null) ? (
        <article className="rounded-2xl border border-cyan-500/25 bg-slate-950/60 p-5 shadow-inner">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Paper wallet (ledger)
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <span className="text-xs text-slate-500">Cash</span>
              <p className="text-lg font-semibold tabular-nums text-slate-100">
                {wallet.cashBalance != null ? inr(wallet.cashBalance) : "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Equity (est.)</span>
              <p className="text-lg font-semibold tabular-nums text-slate-100">
                {wallet.equity != null ? inr(wallet.equity) : "—"}
              </p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Ledger realized P&amp;L</span>
              <p
                className={`text-lg font-semibold tabular-nums ${(walletRealized ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {walletRealized != null
                  ? walletRealized >= 0
                    ? `+${inr(walletRealized)}`
                    : inr(walletRealized)
                  : "—"}
              </p>
            </div>
          </div>
        </article>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-2xl border border-teal-500/25 bg-slate-950/60 p-5 shadow-inner">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Paper realized (options)
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">Wins</span>
              <p className="text-xl font-bold tabular-nums text-emerald-400">{paperWins}</p>
            </div>
            <div>
              <span className="text-slate-500">Losses</span>
              <p className="text-xl font-bold tabular-nums text-rose-400">{paperLosses}</p>
            </div>
            <div className="col-span-2 border-t border-white/10 pt-3">
              <span className="text-slate-500">Total realized P&amp;L (positions)</span>
              <p
                className={`text-lg font-bold tabular-nums ${paperPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {paperPnl >= 0 ? `+${inr(paperPnl)}` : inr(paperPnl)}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                {paperDecided > 0
                  ? `Win rate ${(((paperWins / paperDecided) * 100).toFixed(1))}% of ${paperDecided} decided closes`
                  : "Close at least one paper trade with entry + exit premiums to see W/L here."}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-sky-500/25 bg-slate-950/60 p-5 shadow-inner">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Forward signals (underlying)
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500">Target hits</span>
              <p className="text-xl font-bold tabular-nums text-emerald-400">{fwdWins}</p>
            </div>
            <div>
              <span className="text-slate-500">Stop hits</span>
              <p className="text-xl font-bold tabular-nums text-rose-400">{fwdLosses}</p>
            </div>
            <div className="col-span-2 border-t border-white/10 pt-3 text-[11px] text-slate-500">
              {resolved.length} resolved · {tracker?.pending?.length ?? 0} pending
              {fwdOther > 0 ? ` · ${fwdOther} other outcome` : ""}
              {resolved.length === 0 && (tracker?.pending?.length ?? 0) === 0 ? (
                <span className="mt-1 block text-amber-200/80">
                  No forward-tracker data yet. TRADEABLE signals register when you run{" "}
                  <code className="text-slate-400">signals</code>.
                </span>
              ) : null}
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-white/10 bg-slate-950/60 p-5 shadow-inner md:col-span-2 lg:col-span-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Paper buys today (journal)
          </p>
          {buyCounts.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No PAPER_BUY rows for today&apos;s trading date (IST).
            </p>
          ) : (
            <ul className="mt-3 max-h-40 space-y-2 overflow-y-auto text-sm">
              {buyCounts.map(([setupId, n]) => (
                <li
                  key={setupId}
                  className="flex justify-between gap-2 rounded-lg bg-black/30 px-2 py-1.5 font-mono text-xs text-slate-300">
                  <span className="truncate">{escapeText(setupId)}</span>
                  <span className="shrink-0 tabular-nums text-slate-400">×{n}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      {backtest?.stats ? (
        <article className="rounded-2xl border border-indigo-500/25 bg-slate-900/70 p-5">
          <h2 className="font-display text-lg font-bold text-white">Last backtest (artifact)</h2>
          <p className="mt-1 text-xs text-slate-500">
            From <code className="text-slate-400">npm run backtest</code> — not live paper.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-xl bg-black/25 px-3 py-2">
              <span className="text-[10px] text-slate-500">Closed signals</span>
              <p className="text-lg font-bold text-slate-100">
                {escapeText(backtest.stats.closedSignals)}
              </p>
            </div>
            <div className="rounded-xl bg-black/25 px-3 py-2">
              <span className="text-[10px] text-slate-500">Win rate</span>
              <p className="text-lg font-bold text-slate-100">
                {backtest.stats.winRate != null
                  ? `${Number(backtest.stats.winRate).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-black/25 px-3 py-2">
              <span className="text-[10px] text-slate-500">Wins / losses</span>
              <p className="text-lg font-bold text-slate-100">
                {escapeText(backtest.stats.wins)} / {escapeText(backtest.stats.losses)}
              </p>
            </div>
            <div className="rounded-xl bg-black/25 px-3 py-2">
              <span className="text-[10px] text-slate-500">Expectancy (R)</span>
              <p className="text-lg font-bold text-slate-100">
                {backtest.stats.expectancyR != null
                  ? Number(backtest.stats.expectancyR).toFixed(2)
                  : "—"}
              </p>
            </div>
          </div>
        </article>
      ) : null}

      <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
        <h2 className="font-display text-lg font-bold text-white">By setup id (paper)</h2>
        <p className="mt-1 text-xs text-slate-500">
          Realized option P&amp;L. <code className="text-slate-600">_unknown</code> means the
          position had no <code className="text-slate-600">paperSetupId</code> at entry.
        </p>
        {rows.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-6 text-sm text-slate-400">
            <p className="font-medium text-slate-300">No grouped stats yet</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-slate-500">
              <li>
                On the home dashboard, run <strong className="text-slate-400">Signals</strong>, then
                use <strong className="text-slate-400">Paper buy</strong> on a card (tags the
                setup id).
              </li>
              <li>
                Exit the position from <strong className="text-slate-400">Open trades</strong> so
                entry/exit premiums are recorded.
              </li>
              <li>Return here — wins/losses and P&amp;L fill in automatically.</li>
            </ol>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">Setup</th>
                  <th className="py-2 pr-3">Trades</th>
                  <th className="py-2 pr-3">W / L</th>
                  <th className="py-2 pr-3">Win %</th>
                  <th className="py-2 text-right">Σ P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.setupId}
                    className="border-b border-white/5 text-slate-200 last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs">{escapeText(row.setupId)}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{row.count ?? 0}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-400">
                      <span className="text-emerald-400">{row.wins ?? 0}</span>
                      {" / "}
                      <span className="text-rose-400">{row.losses ?? 0}</span>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-400">
                      {row.winRatePct != null ? `${row.winRatePct.toFixed(1)}%` : "—"}
                    </td>
                    <td
                      className={`py-2.5 text-right font-semibold tabular-nums ${(row.totalPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {(row.totalPnl ?? 0) >= 0 ? "+" : ""}
                      {inr(row.totalPnl ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {tradeRows.length > 0 ? (
        <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <h2 className="font-display text-lg font-bold text-white">All closed paper trades</h2>
          <p className="mt-1 text-xs text-slate-500">Newest first; premium-based P&amp;L only.</p>
          <div className="mt-4 max-h-80 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-900/95 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-2 pr-2">Closed</th>
                  <th className="py-2 pr-2">Option</th>
                  <th className="py-2 pr-2">Setup</th>
                  <th className="py-2 pr-2">Outcome</th>
                  <th className="py-2 text-right">P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {tradeRows.map((t) => (
                  <tr key={t.id} className="border-b border-white/5 text-slate-300">
                    <td className="py-2 pr-2 whitespace-nowrap text-slate-500">
                      {t.closedAt
                        ? new Date(t.closedAt).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </td>
                    <td className="max-w-[10rem] truncate py-2 pr-2 font-mono">
                      {escapeText(t.option)}
                    </td>
                    <td className="py-2 pr-2 font-mono text-slate-400">
                      {escapeText(t.setupId ?? "—")}
                    </td>
                    <td className="py-2 pr-2">{escapeText(t.outcome)}</td>
                    <td
                      className={`py-2 text-right font-semibold tabular-nums ${(t.pnl ?? 0) > 0 ? "text-emerald-400" : (t.pnl ?? 0) < 0 ? "text-rose-400" : "text-slate-500"}`}>
                      {(t.pnl ?? 0) > 0 ? "+" : ""}
                      {inr(t.pnl ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      {resolved.length > 0 ? (
        <article className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
          <h2 className="font-display text-lg font-bold text-white">Resolved forward signals</h2>
          <p className="mt-1 text-xs text-slate-500">
            Latest first. Outcome from automated forward review (spot vs levels).
          </p>
          <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
            {resolved
              .slice()
              .reverse()
              .map((r) => {
                const kind = outcomeProfitLabel(r?.outcome);
                return (
                  <li
                    key={r?.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/25 px-3 py-2 text-xs">
                    <span className="font-mono text-slate-300">{escapeText(r?.id)}</span>
                    <span className="text-slate-400">{escapeText(r?.direction)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        kind === "win"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : kind === "loss"
                            ? "bg-rose-500/20 text-rose-300"
                            : "bg-slate-500/20 text-slate-400"
                      }`}>
                      {escapeText(r?.outcome)}
                    </span>
                  </li>
                );
              })}
          </ul>
        </article>
      ) : null}
    </div>
  );
}
