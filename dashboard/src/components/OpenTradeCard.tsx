import type { ReactNode } from "react";
import type { PositionRecord } from "../types";
import { escapeText, inr } from "../ui";

function Stat({
  label,
  children,
  valueClass,
  compact,
}: {
  label: string;
  children: ReactNode;
  valueClass?: string;
  compact?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div
        className={`font-medium uppercase tracking-[0.06em] text-slate-500 ${compact ? "text-[9px]" : "text-[10px]"}`}>
        {label}
      </div>
      <div
        className={`mt-0.5 truncate font-semibold tabular-nums leading-snug text-slate-100 ${compact ? "text-xs" : "text-[13px]"} ${valueClass ?? ""}`}>
        {children}
      </div>
    </div>
  );
}

export function OpenTradeCard({
  position,
  loading,
  orderProduct = "MIS",
  optionLotSize = 65,
  quoteStaleAfterMs = 60_000,
  onExit,
  onPartialExit,
}: {
  position: PositionRecord;
  loading: boolean;
  orderProduct?: string;
  optionLotSize?: number;
  quoteStaleAfterMs?: number;
  onExit: (positionId: string) => void;
  onPartialExit?: (positionId: string, pct: 25 | 50) => void;
}) {
  const qty = Number(position.quantity ?? 0);
  const entry =
    position.entryOptionPrice != null ? Number(position.entryOptionPrice) : null;
  const ltp =
    position.lastObservedOptionPrice != null
      ? Number(position.lastObservedOptionPrice)
      : null;
  const hasLiveLtp = ltp != null && Number.isFinite(ltp);

  const invested =
    entry != null && Number.isFinite(entry) && qty
      ? entry * qty
      : null;
  const curVal =
    hasLiveLtp && qty ? ltp * qty : invested != null ? invested : null;
  const pnl =
    hasLiveLtp && entry != null && qty
      ? (ltp - entry) * qty
      : null;
  const chgPct =
    hasLiveLtp && entry != null && entry > 0
      ? ((ltp - entry) / entry) * 100
      : null;

  const spot = position.lastObservedSpot;
  const sym =
    position.option?.tradingsymbol || position.symbol || "—";
  const exch = position.option?.exchange || "NFO";
  const strike = position.option?.strike;
  const insType = position.option?.instrument_type;
  const exp = position.option?.expiry;

  let openedLabel: string | null = null;
  const rawCreated = position.createdAt;
  if (rawCreated) {
    try {
      openedLabel = new Date(rawCreated).toLocaleString(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      openedLabel = null;
    }
  }

  const pnlPositive = pnl != null && pnl > 0;
  const pnlNeg = pnl != null && pnl < 0;
  const lotSz = Math.max(1, optionLotSize);
  const totalLots = Math.floor(qty / lotSz);
  const canPartial50 = totalLots >= 2 && typeof onPartialExit === "function";
  const canPartial25 = totalLots >= 4 && typeof onPartialExit === "function";

  let quoteAgeLabel: string | null = null;
  let quoteStale = false;
  const rawQuoteAt = position.lastQuoteAt;
  if (rawQuoteAt) {
    const t = new Date(rawQuoteAt).getTime();
    if (Number.isFinite(t)) {
      const ageMs = Date.now() - t;
      quoteStale = ageMs > quoteStaleAfterMs;
      quoteAgeLabel = `${(ageMs / 1000).toFixed(0)}s`;
    }
  }

  const pnlClass = pnlPositive
    ? "text-emerald-400"
    : pnlNeg
      ? "text-rose-400"
      : "text-slate-300";

  return (
    <article className="rounded-lg border border-teal-500/25 bg-black/35 px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
        <div className="min-w-0 shrink-0 lg:w-[min(100%,14.5rem)]">
          <strong className="block font-mono text-sm font-bold leading-tight text-white">
            {escapeText(sym)}
          </strong>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
              {escapeText(exch)}
            </span>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
              {escapeText(orderProduct)}
            </span>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/90">
              Buy
            </span>
            {insType ? (
              <span className="rounded bg-slate-500/20 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                {escapeText(insType)}
              </span>
            ) : null}
            {position.lots != null ? (
              <span className="rounded border border-white/10 bg-black/30 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                {escapeText(position.lots)}l
              </span>
            ) : null}
          </div>
          {(strike != null && strike !== "") || exp ? (
            <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
              {strike != null && strike !== "" ? (
                <span>Str {escapeText(strike)}</span>
              ) : null}
              {strike != null && strike !== "" && exp ? " · " : null}
              {exp ? <span>{escapeText(exp)}</span> : null}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 border-t border-white/10 pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-x-3">
            <Stat label="Qty" compact>
              {escapeText(qty || "—")}
            </Stat>
            <Stat label="Avg." compact valueClass="text-slate-100">
              {entry != null && Number.isFinite(entry) ? inr(entry) : "—"}
            </Stat>
            <Stat
              label="LTP"
              compact
              valueClass={hasLiveLtp ? "text-cyan-200" : "text-slate-500"}>
              {hasLiveLtp ? inr(ltp) : "—"}
            </Stat>
            <Stat label="Invested" compact valueClass="text-slate-300">
              {invested != null ? inr(invested) : "—"}
            </Stat>
            <Stat label="Cur. val" compact valueClass="text-slate-300">
              {curVal != null ? inr(curVal) : "—"}
            </Stat>
            <Stat label="P&amp;L" compact valueClass={pnlClass}>
              {pnl != null
                ? `${pnl > 0 ? "+" : ""}${inr(pnl)}`
                : hasLiveLtp
                  ? inr(0)
                  : "—"}
            </Stat>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400">
            {chgPct != null && Number.isFinite(chgPct) ? (
              <span>
                Prem. Δ{" "}
                <span
                  className={`font-semibold tabular-nums ${chgPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {chgPct >= 0 ? "+" : ""}
                  {chgPct.toFixed(2)}%
                </span>
              </span>
            ) : null}
            <span>
              Index{" "}
              {typeof spot === "number" && Number.isFinite(spot) ? (
                <span className="font-semibold tabular-nums text-slate-300">
                  {spot.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                </span>
              ) : (
                "—"
              )}
            </span>
            <span>
              Opened{" "}
              <span className="text-slate-300">{openedLabel ?? "—"}</span>
            </span>
            {quoteAgeLabel ? (
              <span>
                Quote{" "}
                <span
                  className={`font-semibold tabular-nums ${quoteStale ? "text-amber-400" : "text-slate-300"}`}>
                  {quoteAgeLabel} ago{quoteStale ? " · stale" : ""}
                </span>
              </span>
            ) : (
              <span className="text-slate-600">Quote refresh pending</span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col justify-end gap-2 lg:items-stretch">
          {(canPartial25 || canPartial50) && position.id ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {canPartial25 ? (
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
                  disabled={loading}
                  onClick={() => onPartialExit?.(String(position.id), 25)}>
                  −25%
                </button>
              ) : null}
              {canPartial50 ? (
                <button
                  type="button"
                  className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-200 transition hover:bg-white/10 disabled:opacity-60"
                  disabled={loading}
                  onClick={() => onPartialExit?.(String(position.id), 50)}>
                  −50%
                </button>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="w-full rounded-full bg-rose-500/90 px-4 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-rose-500 disabled:opacity-60 sm:w-auto lg:w-full lg:min-w-[7.5rem]"
            disabled={loading}
            onClick={() => onExit(String(position.id))}>
            Exit 100%
          </button>
        </div>
      </div>

      <div className="mt-2 border-t border-white/5 pt-2 text-[10px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-500">Plan </span>
        Opt SL {position.activeOptionStopLoss != null ? inr(position.activeOptionStopLoss) : "—"} · OT1{" "}
        {position.optionTarget1 != null ? inr(position.optionTarget1) : "—"} · OT2{" "}
        {position.optionTarget2 != null ? inr(position.optionTarget2) : "—"}
        <span className="text-slate-600"> · Spot </span>SL {escapeText(position.activeStopLoss)} · T1{" "}
        {escapeText(position.target1)} · T2 {escapeText(position.target2)}
      </div>
    </article>
  );
}
