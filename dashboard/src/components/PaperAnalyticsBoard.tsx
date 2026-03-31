import type { PaperAnalyticsSummary } from "../types";
import { escapeText, inr } from "../ui";

export function PaperAnalyticsBoard({
  analytics,
}: {
  analytics: PaperAnalyticsSummary | null | undefined;
}) {
  if (!analytics || (analytics.closedCount ?? 0) === 0) {
    return (
      <article className="rounded-2xl border border-teal-500/20 bg-slate-900/70 p-4 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Paper desk
          </p>
          <h2 className="font-display text-lg font-bold text-white">
            Analytics
          </h2>
        </div>
        <p className="text-xs leading-relaxed text-slate-500">
          Close at least one paper position to see win/loss counts and P&amp;L
          here. Open positions use live marks; realized P&amp;L updates on exit.
        </p>
      </article>
    );
  }

  const pnl = analytics.totalRealizedPnl ?? 0;
  const trades = analytics.trades ?? [];

  return (
    <article className="rounded-2xl border border-teal-500/20 bg-slate-900/70 p-4 text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Paper desk
          </p>
          <h2 className="font-display text-lg font-bold text-white">
            Analytics
          </h2>
        </div>
        <span
          className={`text-sm font-bold tabular-nums ${pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          Σ {pnl >= 0 ? `+${inr(pnl)}` : inr(pnl)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2">
          <span className="text-[10px] text-slate-500">Closed</span>
          <strong className="block text-lg tabular-nums text-white">
            {analytics.closedCount ?? 0}
          </strong>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2">
          <span className="text-[10px] text-slate-500">Wins</span>
          <strong className="block text-lg tabular-nums text-emerald-400">
            {analytics.wins ?? 0}
          </strong>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2">
          <span className="text-[10px] text-slate-500">Losses</span>
          <strong className="block text-lg tabular-nums text-rose-400">
            {analytics.losses ?? 0}
          </strong>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2">
          <span className="text-[10px] text-slate-500">Win rate</span>
          <strong className="block text-lg tabular-nums text-slate-200">
            {analytics.winRatePct != null
              ? `${analytics.winRatePct.toFixed(1)}%`
              : "—"}
          </strong>
        </div>
      </div>

      {(analytics.bySetupRows?.length ?? 0) > 0 ? (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            By setup id
          </p>
          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
            {(analytics.bySetupRows ?? []).map((row) => (
              <div
                key={row.setupId}
                className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5 text-[11px]">
                <span className="min-w-0 truncate font-mono text-slate-300">
                  {escapeText(row.setupId)}
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {row.wins ?? 0}W / {row.losses ?? 0}L · n={row.count ?? 0}
                </span>
                <span
                  className={`w-full text-right text-[11px] font-semibold tabular-nums sm:w-auto ${(row.totalPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {(row.totalPnl ?? 0) >= 0 ? "+" : ""}
                  {inr(row.totalPnl ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 border-t border-white/10 pt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Recent realized
        </p>
        <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {trades.slice(0, 12).map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 rounded-lg border border-white/5 bg-black/20 px-2 py-1.5 text-[11px]">
              <span className="min-w-0 truncate font-medium text-slate-300">
                {escapeText(t.option)}
                {t.setupId ? (
                  <span className="text-slate-600"> · {escapeText(t.setupId)}</span>
                ) : null}
              </span>
              {t.pnl != null ? (
                <span
                  className={`shrink-0 tabular-nums font-semibold ${t.pnl > 0 ? "text-emerald-400" : t.pnl < 0 ? "text-rose-400" : "text-slate-500"}`}>
                  {t.pnl > 0 ? `+${inr(t.pnl)}` : inr(t.pnl)}
                </span>
              ) : (
                <span className="text-slate-600">—</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
