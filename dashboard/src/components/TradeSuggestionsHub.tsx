import { SetupPlanCard } from "./SetupPlanCard";
import type { DashboardState } from "../types";
import { escapeText, inr, sentimentClasses } from "../ui";

type TradeSuggestionsHubProps = {
  data: DashboardState | null;
  loading: boolean;
  paperBuyDisabled?: boolean;
  paperBuyHint?: string | null;
  onRunCommand: (command: string) => void;
  onRefreshDashboard: () => void;
  onApplySuggestion: (id: string) => void;
  onPaperBuy: (id: string) => void;
  onAiAnalysis: () => void;
};

export function TradeSuggestionsHub({
  data,
  loading,
  paperBuyDisabled = false,
  paperBuyHint = null,
  onRunCommand,
  onRefreshDashboard,
  onApplySuggestion,
  onPaperBuy,
  onAiAnalysis,
}: TradeSuggestionsHubProps) {
  const intelligence = data?.intelligence;
  const session = data?.runtime.session;
  const signalArtifact = data?.runtime.signals;

  const callConf = intelligence?.suggestions?.call?.confidence ?? 0;
  const putConf = intelligence?.suggestions?.put?.confidence ?? 0;
  const blendTotal = Math.max(0.001, callConf + putConf);
  const callBarPct = (callConf / blendTotal) * 100;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="p-4 md:p-5">

        {(() => {
          const td = data?.runtime?.tradingDay;
          const limit = td?.dailyTradeSlotLimit ?? data?.config?.dailyTradeSlotLimit ?? 0;
          const stats = td?.stats;
          const entries = td?.journal?.entries ?? [];
          const recent = entries.slice(-5).reverse();
          if (!td?.tradingDate && !recent.length) return null;
          const buys = stats?.paperBuysToday ?? 0;
          const atLimit = stats?.atPaperBuyLimit ?? (limit > 0 && buys >= limit);
          const limitLabel =
            limit > 0 ? `${buys} / ${limit} paper buys today` : `${buys} paper buys today (no cap)`;
          return (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-slate-300">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="font-semibold text-amber-200/90">Today’s desk</span>
                {td?.tradingDate ? (
                  <span className="tabular-nums text-slate-400">
                    {td.tradingDate}
                    {td.timezone ? ` · ${td.timezone}` : ""}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-slate-400">{limitLabel}.</p>
              {atLimit ? (
                <p className="mt-1 font-medium text-rose-300">
                  Daily paper BUY limit reached — exit or wait for next session.
                </p>
              ) : null}
              {recent.length > 0 ? (
                <ul className="mt-2 max-h-24 space-y-0.5 overflow-y-auto border-t border-white/10 pt-2 text-slate-500">
                  {recent.map((e, i) => (
                    <li key={`${e.at ?? ""}-${e.kind ?? ""}-${i}`} className="tabular-nums">
                      <span className="text-slate-600">
                        {e.at
                          ? new Date(e.at).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })
                          : "—"}
                      </span>{" "}
                      <span className="text-slate-400">{e.kind ?? ""}</span>
                      {e.setupId ? ` · ${e.setupId}` : ""}
                      {e.option ? ` · ${e.option}` : ""}
                      {typeof e.reason === "string" && e.reason
                        ? ` — ${e.reason.slice(0, 80)}${e.reason.length > 80 ? "…" : ""}`
                        : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 border-t border-white/10 pt-2 text-slate-600">
                  No journal entries yet — Apply a plan or Paper Buy to log this session.
                </p>
              )}
            </div>
          );
        })()}

        {intelligence?.status !== "READY" && (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-5 py-8 text-center">
            <div className="text-xl mb-2">{intelligence?.status === "UNAVAILABLE" ? "⚡" : "⏸"}</div>
            <div className="text-sm font-semibold text-slate-300 mb-1">
              {intelligence?.status === "UNAVAILABLE" ? "No signal yet" : "Signals skipped — market may be closed"}
            </div>
            <div className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              {intelligence?.reason ?? "Go to the Signals tab and click ▶ Run Signals."}
            </div>
          </div>
        )}

        {intelligence?.status === "READY" && (
          <>
            {/* Call/Put tilt bar */}
            <div className="relative h-2 overflow-hidden rounded-full bg-slate-950/80 ring-1 ring-white/10">
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-500" style={{ width: `${callBarPct}%` }} />
              <div className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-rose-500 to-fuchsia-600 opacity-90 transition-[width] duration-500" style={{ width: `${100 - callBarPct}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              <span className="text-emerald-400/90">CALL confidence {callConf.toFixed(1)}/10</span>
              <span className="text-rose-400/90">PUT confidence {putConf.toFixed(1)}/10</span>
            </div>

            {intelligence.suggestions?.caution && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-950/25 px-3 py-2 text-xs text-amber-200/80 leading-relaxed">
                ⚠ {escapeText(intelligence.suggestions.caution)}
              </div>
            )}

        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_min(100%,300px)] xl:items-start">
          <div className="min-w-0 space-y-4">
                {/* Paper Buy cards */}
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">Paper buy — simulate a trade</div>
                    <div className="flex flex-wrap gap-1.5">
                      {data?.runtime.appliedSuggestion?.suggestion?.action && (
                        <span className="rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-[11px] font-semibold text-teal-300">
                          Applied: {data.runtime.appliedSuggestion.suggestion.action}
                        </span>
                      )}
                      <button type="button" disabled={loading} onClick={onAiAnalysis} className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50">AI overlay</button>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {(intelligence.actionableSuggestions || []).map((setup) => (
                      <SetupPlanCard key={setup.id} setup={setup} loading={loading} paperBuyDisabled={paperBuyDisabled} paperBuyHint={paperBuyHint} onApply={onApplySuggestion} onPaperBuy={onPaperBuy} />
                    ))}
                  </div>
                </div>

                {data?.runtime.signals?.signal?.dualSide ? (
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      Dual chart engine
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-emerald-950/20 p-3">
                        <div className="text-xs font-semibold text-emerald-300/90">
                          Call leg
                        </div>
                        <div className="mt-1 text-2xl font-bold tabular-nums text-white">
                          {escapeText(data.runtime.signals.signal.dualSide.call?.score)}
                          <span className="text-base text-emerald-400/70">/10</span>
                        </div>
                        <p className="mt-2 text-xs text-emerald-200/80">
                          {escapeText(data.runtime.signals.signal.dualSide.call?.confirmationCount)} conf. ·{" "}
                          {escapeText(data.runtime.signals.signal.dualSide.call?.status)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-rose-950/20 p-3">
                        <div className="text-xs font-semibold text-rose-300/90">Put leg</div>
                        <div className="mt-1 text-2xl font-bold tabular-nums text-white">
                          {escapeText(data.runtime.signals.signal.dualSide.put?.score)}
                          <span className="text-base text-rose-400/70">/10</span>
                        </div>
                        <p className="mt-2 text-xs text-rose-200/80">
                          {escapeText(data.runtime.signals.signal.dualSide.put?.confirmationCount)} conf. ·{" "}
                          {escapeText(data.runtime.signals.signal.dualSide.put?.status)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}


                {false && <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      Spot &amp; session
                    </p>
                    {intelligence.openingContext ? (
                      <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-950/30 p-4 text-sm text-amber-100/95">
                        <div className="font-semibold text-amber-200">Gap context</div>
                        <p className="mt-2 text-xs leading-5 text-amber-100/85">
                          {escapeText(intelligence.openingContext.hint)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-200/90">
                          <span className="rounded-md bg-black/30 px-2 py-1">
                            {escapeText(intelligence.openingContext.regime)}
                          </span>
                          {intelligence.openingContext.openPrice != null ? (
                            <span className="rounded-md bg-black/30 px-2 py-1">
                              O {escapeText(intelligence.openingContext.openPrice)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {intelligence.atmOptions?.callSymbol || intelligence.atmOptions?.putSymbol ? (
                      <div className="mt-4 rounded-xl border border-teal-500/20 bg-black/30 p-4 text-xs text-slate-300">
                        <div className="font-bold text-teal-300/90">ATM LTP</div>
                        <div className="mt-2 space-y-1 font-mono">
                          <div>
                            CE {escapeText(intelligence.atmOptions.callSymbol)} ·{" "}
                            {intelligence.atmOptions.callPremium != null &&
                            Number.isFinite(Number(intelligence.atmOptions.callPremium))
                              ? inr(intelligence.atmOptions.callPremium)
                              : escapeText(intelligence.atmOptions.callPremium)}
                          </div>
                          <div>
                            PE {escapeText(intelligence.atmOptions.putSymbol)} ·{" "}
                            {intelligence.atmOptions.putPremium != null &&
                            Number.isFinite(Number(intelligence.atmOptions.putPremium))
                              ? inr(intelligence.atmOptions.putPremium)
                              : escapeText(intelligence.atmOptions.putPremium)}
                          </div>
                        </div>
                        {intelligence.atmOptions.fetchError ? (
                          <p className="mt-2 text-rose-400">{escapeText(intelligence.atmOptions.fetchError)}</p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div>
                        <span className="text-[11px] text-slate-500">Spot</span>
                        <strong className="mt-1 block text-xl tabular-nums text-white">
                          {escapeText(intelligence.marketMove?.spot)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500">Prev close</span>
                        <strong className="mt-1 block text-lg tabular-nums text-slate-200">
                          {escapeText(intelligence.marketMove?.previousClose)}
                        </strong>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-[11px] text-slate-500">Δ</span>
                        <strong
                          className={`mt-1 block text-lg tabular-nums ${
                            (intelligence.marketMove?.changePct || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}>
                          {typeof intelligence.marketMove?.changePct === "number"
                            ? `${intelligence.marketMove.changePct > 0 ? "+" : ""}${intelligence.marketMove.changePct.toFixed(2)}%`
                            : escapeText(intelligence.marketMove?.changePct)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                          Headlines
                        </p>
                        <p className="mt-1 text-base font-semibold text-white">
                          Bias {escapeText(intelligence.news?.summary?.bias)}
                        </p>
                        {(intelligence.news?.summary?.dominantThemes?.length ?? 0) > 0 ? (
                          <p className="mt-2 text-xs text-slate-400">
                            Themes:{" "}
                            {intelligence.news?.summary?.dominantThemes?.slice(0, 5).join(", ")}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${sentimentClasses(intelligence.news?.summary?.bias)}`}>
                        {escapeText(intelligence.news?.summary?.bias)}
                      </span>
                    </div>
                    <div className="mt-3 rounded-xl border border-white/5 bg-black/20 p-3 text-xs text-slate-400">
                      Weighted {escapeText(intelligence.news?.summary?.score)} · ↑{" "}
                      {escapeText(intelligence.news?.summary?.bullish)} · ↓{" "}
                      {escapeText(intelligence.news?.summary?.bearish)}
                    </div>
                    <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                      {(intelligence.news?.headlines || []).slice(0, 6).map((headline) => (
                        <a
                          key={headline.link}
                          href={headline.link}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl border border-white/10 bg-slate-950/60 p-3 transition hover:border-teal-500/30 hover:bg-slate-900/80">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-medium leading-snug text-slate-100">
                              {headline.title}
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${sentimentClasses(headline.sentiment)}`}>
                              {headline.sentiment}
                            </span>
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            {headline.source} · {headline.pubDate || ""}
                          </div>
                        </a>
                      ))}
                    </div>
                    {intelligence.news?.error ? (
                      <p className="mt-3 text-sm text-rose-400">{intelligence.news.error}</p>
                    ) : null}
                  </div>
                </div>}
          </div>

          {/* Session + daily slot rail */}
          <aside className="rounded-2xl border border-white/10 bg-black/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:sticky lg:top-24 space-y-4">
            {session && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">Session</p>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs">
                  <p className="font-bold text-emerald-400">{escapeText(session.status)}</p>
                  <p className="mt-1 text-slate-400">{escapeText(session.profile?.userName)} · {escapeText(session.profile?.userId)}</p>
                </div>
              </div>
            )}
            {data?.runtime.aiAnalysis?.status === "READY" && data.runtime.aiAnalysis.analysis && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-2">AI verdict</p>
                <div className="space-y-2 text-xs">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 px-3 py-2">
                    <span className="text-emerald-300 font-semibold">CALL </span>
                    <span className="text-emerald-200/80">{escapeText(data.runtime.aiAnalysis.analysis.call_buy?.verdict)}</span>
                  </div>
                  <div className="rounded-lg border border-rose-500/20 bg-rose-950/20 px-3 py-2">
                    <span className="text-rose-300 font-semibold">PUT </span>
                    <span className="text-rose-200/80">{escapeText(data.runtime.aiAnalysis.analysis.put_buy?.verdict)}</span>
                  </div>
                  <p className="text-slate-500 leading-snug">{escapeText(data.runtime.aiAnalysis.analysis.risk_note)}</p>
                </div>
              </div>
            )}
          </aside>
        </div>
          </>
        )}
      </div>
    </section>
  );
}
