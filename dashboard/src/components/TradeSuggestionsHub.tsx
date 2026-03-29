import { SetupPlanCard } from "./SetupPlanCard";
import type { DashboardState } from "../types";
import { escapeText, sentimentClasses } from "../ui";

type TradeSuggestionsHubProps = {
  data: DashboardState | null;
  loading: boolean;
  onRunCommand: (command: string) => void;
  onRefreshDashboard: () => void;
  onApplySuggestion: (id: string) => void;
  onPaperBuy: (id: string) => void;
  onAiAnalysis: () => void;
};

export function TradeSuggestionsHub({
  data,
  loading,
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
    <section className="relative mb-10 overflow-hidden rounded-3xl border border-teal-400/25 bg-[#050a12] shadow-[0_0_100px_-30px_rgba(20,184,166,0.45)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(45,212,191,0.14),transparent)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(2,6,23,0.65))]" />

      <div className="relative p-5 sm:p-8 lg:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.45em] text-teal-400/90">
              Trade desk
            </p>
            <h1 className="font-display mt-3 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.25rem]">
              Suggestions{" "}
              <span className="bg-gradient-to-r from-teal-300 to-cyan-200 bg-clip-text text-transparent">
                that matter now
              </span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
              Live CALL vs PUT from dual chart scores, spot, opening gap, ATM
              premiums, and headlines — then execute with Paper Buy or Apply.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              disabled={loading}
              onClick={() => onRunCommand("signals")}
              className="rounded-full bg-gradient-to-r from-teal-500 to-emerald-600 px-5 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-[0_0_24px_-4px_rgba(20,184,166,0.7)] transition hover:brightness-110 disabled:opacity-50">
              Run Signals
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => onRunCommand("tickets")}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-teal-400/40 hover:bg-white/10 disabled:opacity-50">
              Tickets
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={onRefreshDashboard}
              className="rounded-full border border-slate-600 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:text-white disabled:opacity-50">
              Refresh data
            </button>
          </div>
        </div>

        {data?.config?.autoSignals?.enabled ? (
          <div className="mt-6 rounded-2xl border border-cyan-500/35 bg-cyan-950/35 px-4 py-3 text-sm leading-relaxed text-cyan-100/95">
            <span className="font-bold text-cyan-300">Auto signals active</span> — server
            regenerates <code className="text-cyan-200/90">signals</code> at{" "}
            <strong>market open</strong> and every{" "}
            <strong>{data.config.autoSignals.intervalMinutes} min</strong> while NSE hours
            are open. Dashboard updates over the socket after each run. Last auto run:{" "}
            <span className="tabular-nums text-white">
              {data.runtime?.autoSignalScheduler?.lastRunAt
                ? new Date(data.runtime.autoSignalScheduler.lastRunAt).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "medium",
                  })
                : "—"}
            </span>
            {(data.runtime?.autoSignalScheduler?.history?.length ?? 0) > 0 ? (
              <span className="block mt-2 text-xs text-cyan-200/60">
                Logged passes: {data.runtime.autoSignalScheduler?.history?.length} (see{" "}
                <code className="text-cyan-100/80">runtime/auto-signals-scheduler-state.json</code>)
              </span>
            ) : null}
            {data.config?.tradeDiscipline === "patient" ? (
              <span className="block mt-2 text-xs text-cyan-200/75">
                Patient discipline on: TRADEABLE needs a wider recent range plus a follow-through candle
                vs the prior bar (see README).
              </span>
            ) : null}
            {(data.config?.autoSignals?.spotMovePct ?? 0) > 0 ? (
              <span className="block mt-2 text-xs text-cyan-200/75">
                Spot-move trigger: also runs when index moves ≥{" "}
                <strong className="text-cyan-200">{data.config.autoSignals.spotMovePct}%</strong> vs
                spot at last successful run.
              </span>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-400">Away from desk?</span> Set{" "}
            <code className="text-slate-300">AUTO_SIGNALS_ENABLED=1</code> and keep{" "}
            <code className="text-slate-300">npm run dashboard</code> running on this machine —
            suggestions refresh automatically during market hours.
          </div>
        )}

        {/* Confidence fuse */}
        {intelligence?.status === "READY" ? (
          <div className="relative mt-8 h-3 overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-white/10">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-500"
              style={{ width: `${callBarPct}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-rose-500 to-fuchsia-600 opacity-90 transition-[width] duration-500"
              style={{ width: `${100 - callBarPct}%` }}
            />
          </div>
        ) : null}
        {intelligence?.status === "READY" ? (
          <div className="mt-2 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="text-emerald-400/90">Call tilt {callConf.toFixed(1)}</span>
            <span className="text-rose-400/90">Put tilt {putConf.toFixed(1)}</span>
          </div>
        ) : null}

        <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_min(100%,320px)] xl:items-start">
          <div className="min-w-0 space-y-8">
            {intelligence?.status === "READY" ? (
              <>
                <div
                  className={`relative overflow-hidden rounded-2xl p-6 sm:p-8 ${
                    intelligence.suggestions?.preferredSide === "CALL BUY"
                      ? "bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-900"
                      : "bg-gradient-to-br from-rose-600 via-rose-700 to-red-950"
                  } text-white shadow-xl`}>
                  <div className="absolute right-0 top-0 h-40 w-40 translate-x-1/4 -translate-y-1/4 rounded-full bg-white/10 blur-2xl" />
                  <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.3em] text-white/70">
                        Primary lean
                      </p>
                      <h2 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
                        {escapeText(intelligence.suggestions?.preferredSide)}
                      </h2>
                    </div>
                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      <span className="rounded-full bg-black/25 px-4 py-2 text-sm font-bold backdrop-blur">
                        Score{" "}
                        {escapeText(intelligence.suggestions?.preferredConfidence)}
                        <span className="text-white/70">/10</span>
                      </span>
                    </div>
                  </div>
                  <p className="relative mt-4 max-w-3xl text-base leading-relaxed text-white/90">
                    {escapeText(intelligence.suggestions?.caution)}
                  </p>
                </div>

                {/* Actionable cards — focal row */}
                <div>
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal-400">
                        Execution-ready
                      </p>
                      <h3 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
                        Plans with premium &amp; spot levels
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data?.runtime.appliedSuggestion?.suggestion?.action ? (
                        <span className="rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-200">
                          Applied: {data.runtime.appliedSuggestion.suggestion.action}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={onAiAnalysis}
                        className="rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-xs font-bold uppercase tracking-wider text-violet-200 transition hover:bg-violet-500/25 disabled:opacity-50">
                        AI overlay
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-6 lg:grid-cols-2">
                    {(intelligence.actionableSuggestions || []).map((setup) => (
                      <SetupPlanCard
                        key={setup.id}
                        setup={setup}
                        loading={loading}
                        onApply={onApplySuggestion}
                        onPaperBuy={onPaperBuy}
                      />
                    ))}
                  </div>
                </div>

                {data?.runtime.signals?.signal?.dualSide ? (
                  <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                      Independent chart engine
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/40 p-4">
                        <div className="text-xs font-semibold text-emerald-300/90">
                          Call leg
                        </div>
                        <div className="mt-1 text-3xl font-bold tabular-nums text-white">
                          {escapeText(data.runtime.signals.signal.dualSide.call?.score)}
                          <span className="text-lg text-emerald-400/70">/10</span>
                        </div>
                        <p className="mt-2 text-xs text-emerald-200/80">
                          {escapeText(data.runtime.signals.signal.dualSide.call?.confirmationCount)} conf. ·{" "}
                          {escapeText(data.runtime.signals.signal.dualSide.call?.status)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-rose-500/25 bg-rose-950/40 p-4">
                        <div className="text-xs font-semibold text-rose-300/90">Put leg</div>
                        <div className="mt-1 text-3xl font-bold tabular-nums text-white">
                          {escapeText(data.runtime.signals.signal.dualSide.put?.score)}
                          <span className="text-lg text-rose-400/70">/10</span>
                        </div>
                        <p className="mt-2 text-xs text-rose-200/80">
                          {escapeText(data.runtime.signals.signal.dualSide.put?.confirmationCount)} conf. ·{" "}
                          {escapeText(data.runtime.signals.signal.dualSide.put?.status)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-5 ring-1 ring-emerald-500/10">
                    <div className="flex items-center justify-between">
                      <strong className="text-lg font-bold text-emerald-100">CALL BUY</strong>
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-bold text-emerald-300">
                        {escapeText(intelligence.suggestions?.call?.confidence)}/10
                      </span>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm leading-relaxed text-emerald-100/85">
                      {(intelligence.suggestions?.call?.reasons || []).map((reason) => (
                        <li key={reason} className="flex gap-2">
                          <span className="text-emerald-400">▸</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-rose-500/20 bg-rose-950/20 p-5 ring-1 ring-rose-500/10">
                    <div className="flex items-center justify-between">
                      <strong className="text-lg font-bold text-rose-100">PUT BUY</strong>
                      <span className="rounded-full bg-rose-500/20 px-3 py-1 text-sm font-bold text-rose-300">
                        {escapeText(intelligence.suggestions?.put?.confidence)}/10
                      </span>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm leading-relaxed text-rose-100/85">
                      {(intelligence.suggestions?.put?.reasons || []).map((reason) => (
                        <li key={reason} className="flex gap-2">
                          <span className="text-rose-400">▸</span>
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
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
                            {escapeText(intelligence.atmOptions.callPremium)}
                          </div>
                          <div>
                            PE {escapeText(intelligence.atmOptions.putSymbol)} ·{" "}
                            {escapeText(intelligence.atmOptions.putPremium)}
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

                  <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                          Headlines
                        </p>
                        <p className="mt-1 text-lg font-semibold text-white">
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
                    <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto pr-1">
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
                </div>

                <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-950/50 to-slate-950/80 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300/80">
                        LLM layer
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-white">OpenAI verdict</h3>
                    </div>
                    {data?.runtime.aiAnalysis?.model ? (
                      <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-violet-200">
                        {data.runtime.aiAnalysis.model}
                      </span>
                    ) : null}
                  </div>
                  {data?.runtime.aiAnalysis?.status === "READY" && data.runtime.aiAnalysis.analysis ? (
                    <div className="mt-4 space-y-4 text-sm">
                      <p className="text-slate-300">{escapeText(data.runtime.aiAnalysis.analysis.summary)}</p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl bg-white/5 p-3">
                          <span className="text-[10px] uppercase text-slate-500">Regime</span>
                          <strong className="mt-1 block text-white">
                            {escapeText(data.runtime.aiAnalysis.analysis.market_regime)}
                          </strong>
                        </div>
                        <div className="rounded-xl bg-white/5 p-3">
                          <span className="text-[10px] uppercase text-slate-500">News bias</span>
                          <strong className="mt-1 block text-white">
                            {escapeText(data.runtime.aiAnalysis.analysis.headline_bias)}
                          </strong>
                        </div>
                        <div className="rounded-xl bg-white/5 p-3">
                          <span className="text-[10px] uppercase text-slate-500">Pick</span>
                          <strong className="mt-1 block text-white">
                            {escapeText(data.runtime.aiAnalysis.analysis.preferred_setup_id)}
                          </strong>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3">
                          <span className="text-xs font-semibold text-emerald-300">CALL</span>
                          <span className="ml-2 text-emerald-200/90">
                            {escapeText(data.runtime.aiAnalysis.analysis.call_buy?.verdict)}
                          </span>
                        </div>
                        <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3">
                          <span className="text-xs font-semibold text-rose-300">PUT</span>
                          <span className="ml-2 text-rose-200/90">
                            {escapeText(data.runtime.aiAnalysis.analysis.put_buy?.verdict)}
                          </span>
                        </div>
                      </div>
                      <p className="rounded-xl bg-black/30 p-3 text-slate-400">
                        {escapeText(data.runtime.aiAnalysis.analysis.risk_note)}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">
                      {escapeText(
                        data?.runtime.aiAnalysis?.reason ||
                          "Add OPENAI_API_KEY and tap AI overlay for a second opinion.",
                      )}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/25 p-8 text-amber-100">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-400/90">
                  Waiting on intelligence
                </p>
                <p className="mt-3 text-lg text-amber-100/90">
                  {escapeText(intelligence?.reason || "Run Signals with live or sample data, then refresh.")}
                </p>
                {signalArtifact?.status === "SKIPPED" ? (
                  <p className="mt-4 rounded-xl bg-black/30 p-4 text-sm">
                    Signals skipped: {escapeText(signalArtifact.reason)}
                  </p>
                ) : null}
              </div>
            )}
          </div>

          {/* Session rail */}
          <aside className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 lg:sticky lg:top-24">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Broker</p>
            <h3 className="font-display mt-1 text-xl font-bold text-white">Session</h3>
            {session ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-gradient-to-br from-emerald-600/80 to-teal-900/80 p-4 text-white">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/90">Status</p>
                  <p className="mt-1 text-2xl font-bold">{escapeText(session.status)}</p>
                  <p className="mt-2 text-sm text-emerald-100/85">
                    {escapeText(session.profile?.userName)} · {escapeText(session.profile?.userId)}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  Redirect:{" "}
                  <code className="text-slate-400">http://127.0.0.1:3020/zerodha/callback</code>
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Log in from the header to stream live premiums into suggestions.
              </p>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
