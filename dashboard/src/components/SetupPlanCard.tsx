import { inr } from "../ui";

type SetupPlanCardProps = {
  setup: {
    id: string;
    /** e.g. NIFTY 24500 CE */
    tradeLegLabel?: string;
    action: string;
    confidence: number;
    status: string;
    entryZone: number[];
    stopLoss: number;
    targets: number[];
    premiumEntryZone?: number[] | null;
    premiumStopLoss?: number | null;
    premiumTargets?: number[];
    currentPremium?: number | null;
    chartContext?: {
      support?: number | null;
      resistance?: number | null;
      gapPct?: number;
      gapFromOpenPct?: number | null;
      sessionOpen?: number | null;
      openVsPrevCloseGapPct?: number | null;
      sessionRegime?: string | null;
      openingHint?: string | null;
      structure?: string;
    };
    invalidation: string;
    thesis: string[];
    aiSummary: string;
    reasoningScore: string;
  };
  loading?: boolean;
  paperBuyDisabled?: boolean;
  paperBuyHint?: string | null;
  onApply: (id: string) => void;
  onPaperBuy: (id: string) => void;
};

function formatLevel(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "NA";
  return value.toFixed(2);
}

/** Index / underlying points (not ₹). */
function formatRange(values?: number[] | null) {
  if (!values || values.length < 2) return "NA";
  return `${formatLevel(values[0])} - ${formatLevel(values[1])}`;
}

function formatTargets(values?: number[] | null) {
  if (!values || values.length === 0) return "NA";
  if (values.length === 3) {
    return `T1 ${formatLevel(values[0])} · T2 ${formatLevel(values[1])} · T3 ${formatLevel(values[2])}`;
  }
  return values.map((value) => formatLevel(value)).join(", ");
}

function formatPremiumLevel(value?: number | null) {
  if (value == null || Number.isNaN(value)) return "NA";
  return inr(value);
}

function formatPremiumRange(values?: number[] | null) {
  if (!values || values.length < 2) return "NA";
  return `${formatPremiumLevel(values[0])} – ${formatPremiumLevel(values[1])}`;
}

function formatPremiumTargets(values?: number[] | null) {
  if (!values || values.length === 0) return "NA";
  if (values.length === 3) {
    return `T1 ${formatPremiumLevel(values[0])} · T2 ${formatPremiumLevel(values[1])} · T3 ${formatPremiumLevel(values[2])}`;
  }
  return values.map((value) => formatPremiumLevel(value)).join(", ");
}

function ValueTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3">
      <span className="block text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <strong className="mt-1.5 block break-words text-lg font-semibold leading-7 text-white">
        {value}
      </strong>
    </div>
  );
}

export function SetupPlanCard({
  setup,
  loading,
  paperBuyDisabled = false,
  paperBuyHint = null,
  onApply,
  onPaperBuy,
}: SetupPlanCardProps) {
  const isPrimary = setup.status === "PRIMARY";
  const accent =
    setup.action === "CALL BUY"
      ? {
          badge: "bg-emerald-500/12 text-emerald-300 border-emerald-500/25",
          text: "text-emerald-300",
          card: "border-emerald-500/20",
          glow: "from-emerald-500/14 to-transparent",
          action: "bg-emerald-600 hover:bg-emerald-700",
        }
      : {
          badge: "bg-rose-500/12 text-rose-300 border-rose-500/25",
          text: "text-rose-300",
          card: "border-rose-500/20",
          glow: "from-rose-500/14 to-transparent",
          action: "bg-rose-600 hover:bg-rose-700",
        };

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-shadow duration-300 ${accent.card} ${
        isPrimary
          ? "ring-2 ring-teal-400/50 ring-offset-2 ring-offset-slate-950"
          : "opacity-95 hover:opacity-100"
      }`}>
      <div
        className={`pointer-events-none absolute hidden`}
      />
      <div className={`mb-4 h-px w-full bg-gradient-to-r ${accent.glow}`} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-300">
              {setup.status}
            </span>
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${accent.badge}`}>
              Confidence {setup.confidence}/10
            </span>
          </div>
          <h3 className={`mt-2 text-2xl font-semibold ${accent.text}`}>
            {setup.tradeLegLabel ?? setup.action}
          </h3>
          {setup.tradeLegLabel ? (
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {setup.action}
            </p>
          ) : null}
        </div>
          <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-right">
          <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
            Live premium
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-white">
            {setup.currentPremium != null && !Number.isNaN(Number(setup.currentPremium))
              ? inr(setup.currentPremium)
              : "NA"}
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-7 text-slate-300">{setup.aiSummary}</p>

      <div className="mt-4 space-y-3">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Option premium plan
          </p>
          <div className="mt-3 grid gap-3 min-[640px]:grid-cols-3">
            <ValueTile
              label="Premium entry"
              value={formatPremiumRange(setup.premiumEntryZone)}
            />
            <ValueTile
              label="Premium stop"
              value={formatPremiumLevel(setup.premiumStopLoss)}
            />
            <ValueTile
              label="Premium targets (T1–T3)"
              value={formatPremiumTargets(setup.premiumTargets)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Chart context
          </p>
          <div className="mt-3 grid gap-3 min-[640px]:grid-cols-2">
            <ValueTile
              label="Support"
              value={formatLevel(setup.chartContext?.support)}
            />
            <ValueTile
              label="Resistance"
              value={formatLevel(setup.chartContext?.resistance)}
            />
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {setup.chartContext?.gapPct != null ? (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                  Vs prior close {setup.chartContext.gapPct > 0 ? "+" : ""}
                  {setup.chartContext.gapPct.toFixed(2)}%
                </span>
              ) : null}
              {setup.chartContext?.gapFromOpenPct != null ? (
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                  Vs open {setup.chartContext.gapFromOpenPct > 0 ? "+" : ""}
                  {setup.chartContext.gapFromOpenPct.toFixed(2)}%
                </span>
              ) : null}
              {setup.chartContext?.openVsPrevCloseGapPct != null ? (
                <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-100">
                  Open gap{" "}
                  {setup.chartContext.openVsPrevCloseGapPct > 0 ? "+" : ""}
                  {setup.chartContext.openVsPrevCloseGapPct.toFixed(2)}%
                </span>
              ) : null}
              {setup.chartContext?.sessionRegime &&
              setup.chartContext.sessionRegime !== "regular" ? (
                <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-medium text-sky-100">
                  {setup.chartContext.sessionRegime.replaceAll("_", " ")}
                </span>
              ) : null}
              <span className="text-sm leading-6 text-slate-300">
                {setup.chartContext?.structure || "Wait for structure confirmation."}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Underlying trigger map
          </p>
          <span className="text-sm text-slate-400">
            AI score {setup.reasoningScore}/10
          </span>
        </div>
        <div className="mt-3 grid gap-3 min-[640px]:grid-cols-3">
          <ValueTile label="Spot entry" value={formatRange(setup.entryZone)} />
          <ValueTile label="Spot stop" value={formatLevel(setup.stopLoss)} />
          <ValueTile label="Spot targets" value={formatTargets(setup.targets)} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Why this setup
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
            {setup.thesis.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-slate-300">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Invalidation
          </p>
          <p className="mt-2">{setup.invalidation}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col items-end gap-1.5">
        {paperBuyHint ? (
          <p className="max-w-md text-right text-[10px] leading-snug text-amber-200/90">
            {paperBuyHint}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
            disabled={loading}
            onClick={() => onApply(setup.id)}>
            Apply plan
          </button>
          <button
            type="button"
            title={paperBuyDisabled ? paperBuyHint ?? "Paper buy disabled" : undefined}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60 ${accent.action}`}
            disabled={loading || paperBuyDisabled}
            onClick={() => onPaperBuy(setup.id)}>
            Paper buy
          </button>
        </div>
      </div>
    </div>
  );
}
