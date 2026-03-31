import type { DashboardState, MultiTimeframeRow, OptionChainRow, TradeSetupCard } from "../types";

// ─── Formatting helpers ─────────────────────────────────────────────────────

function fmt(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}
function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}
function chg(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}
function signedPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

// ─── SVG SparkLine ──────────────────────────────────────────────────────────

function SparkLine({
  data,
  color = "#10b981",
  height = 44,
  width = 140,
  zeroLine = false,
  refLine,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  zeroLine?: boolean;
  refLine?: number;
}) {
  if (!data || data.length < 2) return <svg width={width} height={height} />;
  const mn = Math.min(...data);
  const mx = Math.max(...data);
  const range = mx - mn || 1;
  const xs = data.map((_, i) => (i / (data.length - 1)) * width);
  const ys = data.map((v) => height - 2 - ((v - mn) / range) * (height - 4));
  const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
  const zeroY = height - 2 - ((0 - mn) / range) * (height - 4);
  const refY = refLine != null ? height - 2 - ((refLine - mn) / range) * (height - 4) : null;
  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {zeroLine && (
        <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#555" strokeWidth={0.7} strokeDasharray="2,2" />
      )}
      {refY != null && (
        <line x1={0} y1={refY} x2={width} y2={refY} stroke="#f59e0b" strokeWidth={0.7} strokeDasharray="2,2" />
      )}
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={pts} />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={2.5} fill={color} />
    </svg>
  );
}

// ─── MACD Chart ─────────────────────────────────────────────────────────────

function MACDChart({
  history,
  width = 200,
  height = 56,
}: {
  history: Array<{ macd: number; signal: number; histogram: number }>;
  width?: number;
  height?: number;
}) {
  if (!history || history.length < 2) return <svg width={width} height={height} />;
  const allVals = history.flatMap((h) => [h.macd, h.signal, h.histogram]).filter(Number.isFinite);
  const mn = Math.min(...allVals);
  const mx = Math.max(...allVals);
  const range = mx - mn || 1;
  const yt = (v: number) => height - 2 - ((v - mn) / range) * (height - 4);
  const xt = (i: number) => (i / (history.length - 1)) * width;
  const zeroY = yt(0);

  const barW = Math.max(1, (width / history.length) * 0.7);

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#555" strokeWidth={0.6} strokeDasharray="2,2" />
      {history.map((h, i) => {
        const x = xt(i);
        const hY = yt(h.histogram);
        const barTop = h.histogram >= 0 ? hY : zeroY;
        const barH = Math.abs(zeroY - hY);
        return (
          <rect
            key={i}
            x={x - barW / 2}
            y={barTop}
            width={barW}
            height={barH}
            fill={h.histogram >= 0 ? "#10b98166" : "#f4385466"}
          />
        );
      })}
      <polyline
        fill="none"
        stroke="#38bdf8"
        strokeWidth={1.4}
        points={history.map((h, i) => `${xt(i)},${yt(h.macd)}`).join(" ")}
      />
      <polyline
        fill="none"
        stroke="#f59e0b"
        strokeWidth={1.1}
        strokeDasharray="3,2"
        points={history.map((h, i) => `${xt(i)},${yt(h.signal)}`).join(" ")}
      />
    </svg>
  );
}

// ─── OI Bar Chart ────────────────────────────────────────────────────────────

function OIBarChart({ rows, atmStrike, width = 280, height = 64 }: {
  rows: OptionChainRow[];
  atmStrike?: number;
  width?: number;
  height?: number;
}) {
  if (!rows?.length) return <svg width={width} height={height} />;
  const maxOI = Math.max(...rows.flatMap((r) => [r.ceOi ?? 0, r.peOi ?? 0]));
  if (!maxOI) return <svg width={width} height={height} />;

  const colW = width / rows.length;
  const barW = colW * 0.38;
  const gap = colW * 0.05;

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      {rows.map((r, i) => {
        const x = i * colW + colW / 2;
        const ceH = ((r.ceOi ?? 0) / maxOI) * (height - 14);
        const peH = ((r.peOi ?? 0) / maxOI) * (height - 14);
        const isAtm = r.strike === atmStrike;
        return (
          <g key={r.strike}>
            {/* CE bar */}
            <rect
              x={x - barW - gap / 2}
              y={height - 8 - ceH}
              width={barW}
              height={ceH}
              fill={isAtm ? "#60a5fa" : "#3b82f680"}
            />
            {/* PE bar */}
            <rect
              x={x + gap / 2}
              y={height - 8 - peH}
              width={barW}
              height={peH}
              fill={isAtm ? "#f87171" : "#ef444480"}
            />
            <text
              x={x}
              y={height - 1}
              textAnchor="middle"
              fontSize={7}
              fill={isAtm ? "#e2e8f0" : "#94a3b8"}
              fontWeight={isAtm ? "bold" : "normal"}
            >
              {r.strike}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Price + Supertrend chart ─────────────────────────────────────────────

function PriceSTChart({
  candles,
  stHistory,
  width = 280,
  height = 80,
}: {
  candles?: Array<{ close: number }>;
  stHistory?: Array<{ value: number; trend: string; close: number }>;
  width?: number;
  height?: number;
}) {
  const closes = (stHistory?.map((h) => h.close) ?? candles?.map((c) => c.close) ?? []).slice(-30);
  const stVals = (stHistory ?? []).slice(-30).map((h) => h.value);
  if (closes.length < 2) return <svg width={width} height={height} />;

  const allVals = [...closes, ...stVals].filter(Number.isFinite);
  const mn = Math.min(...allVals);
  const mx = Math.max(...allVals);
  const range = mx - mn || 1;
  const xt = (i: number) => (i / (closes.length - 1)) * width;
  const yt = (v: number) => height - 4 - ((v - mn) / range) * (height - 8);

  const pricePoints = closes.map((c, i) => `${xt(i)},${yt(c)}`).join(" ");
  const stOffset = closes.length - stVals.length;

  // Split ST into bull/bear segments
  const bullPts: string[] = [];
  const bearPts: string[] = [];
  (stHistory ?? []).slice(-30).forEach((h, i) => {
    const pt = `${xt(i + stOffset)},${yt(h.value)}`;
    if (h.trend === "up") bullPts.push(pt);
    else bearPts.push(pt);
  });

  return (
    <svg width={width} height={height} style={{ overflow: "visible" }}>
      <polyline fill="none" stroke="#94a3b8" strokeWidth={1.2} points={pricePoints} />
      {bullPts.length > 0 && (
        <polyline fill="none" stroke="#10b981" strokeWidth={1.4} strokeDasharray="3,2" points={bullPts.join(" ")} />
      )}
      {bearPts.length > 0 && (
        <polyline fill="none" stroke="#f43f5e" strokeWidth={1.4} strokeDasharray="3,2" points={bearPts.join(" ")} />
      )}
    </svg>
  );
}

// ─── Pill badge ──────────────────────────────────────────────────────────────

function Pill({ label, tone }: { label: string; tone: "bull" | "bear" | "neutral" | "warn" | "blue" }) {
  const cls =
    tone === "bull" ? "bg-emerald-900/70 text-emerald-300 ring-1 ring-emerald-700/40"
    : tone === "bear" ? "bg-rose-900/70 text-rose-300 ring-1 ring-rose-700/40"
    : tone === "warn" ? "bg-amber-900/70 text-amber-300 ring-1 ring-amber-700/40"
    : tone === "blue" ? "bg-blue-900/70 text-blue-300 ring-1 ring-blue-700/40"
    : "bg-slate-700/60 text-slate-300 ring-1 ring-slate-600/40";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none ${cls}`}>
      {label}
    </span>
  );
}

// ─── Signal strength dots ────────────────────────────────────────────────────

function SignalDots({ count, max = 5 }: { count: number; max?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full ${i < count ? "bg-emerald-400" : "bg-slate-700"}`}
        />
      ))}
    </div>
  );
}

// ─── Key stat card ───────────────────────────────────────────────────────────

function KeyStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "bull" | "bear" | "neutral" | "warn";
}) {
  const valueColor =
    tone === "bull" ? "text-emerald-400"
    : tone === "bear" ? "text-rose-400"
    : tone === "warn" ? "text-amber-400"
    : "text-slate-100";
  return (
    <div className="rounded-lg bg-slate-800/60 border border-white/6 px-3 py-2 flex flex-col gap-0.5 min-w-0">
      <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider truncate">{label}</div>
      <div className={`text-lg font-bold tabular-nums leading-tight ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 truncate">{sub}</div>}
    </div>
  );
}

// ─── Indicator row ───────────────────────────────────────────────────────────

function IndRow({
  label,
  value,
  badge,
  badgeTone,
  sub,
}: {
  label: string;
  value: string;
  badge?: string;
  badgeTone?: "bull" | "bear" | "neutral" | "warn" | "blue";
  sub?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0 gap-2">
      <div className="text-xs text-slate-400 min-w-[90px]">{label}</div>
      <div className="text-xs font-semibold text-slate-100 tabular-nums">{value}</div>
      <div className="flex items-center gap-1 min-w-0">
        {badge && <Pill label={badge} tone={badgeTone ?? "neutral"} />}
        {sub && <span className="text-[10px] text-slate-500 truncate max-w-[80px]">{sub}</span>}
      </div>
    </div>
  );
}

// ─── R:R bar ─────────────────────────────────────────────────────────────────

function RRBar({ rr }: { rr: number }) {
  const risk = 1;
  const reward = Math.min(rr, 5);
  const total = risk + reward;
  const riskPct = (risk / total) * 100;
  const rewPct = (reward / total) * 100;
  return (
    <div className="flex w-full h-2 rounded overflow-hidden gap-0.5">
      <div className="bg-rose-600/80 rounded-l" style={{ width: `${riskPct}%` }} />
      <div className="bg-emerald-500/80 rounded-r" style={{ width: `${rewPct}%` }} />
    </div>
  );
}

// ─── Trade setup card ─────────────────────────────────────────────────────────

function TradeSetupCard({ setup }: { setup: TradeSetupCard }) {
  const isBull = (setup.direction ?? setup.action ?? "").toUpperCase().includes("CALL");
  const accentBg = isBull ? "border-emerald-700/40" : "border-rose-700/40";
  const accentText = isBull ? "text-emerald-400" : "text-rose-400";
  const conf = setup.confidence ?? 0;
  const confLabel = conf >= 75 ? "High confidence" : conf >= 50 ? "Medium confidence" : "Speculative";
  const confTone: "bull" | "warn" | "bear" = conf >= 75 ? "bull" : conf >= 50 ? "warn" : "bear";

  return (
    <div className={`rounded-xl border ${accentBg} bg-slate-800/50 p-4 flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">
            {setup.tradeLegLabel ?? (isBull ? "CALL" : "PUT")}
          </div>
          <div className={`text-base font-bold ${accentText}`}>
            {setup.id?.replace(/_/g, " ").toUpperCase() ?? "—"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Pill label={confLabel} tone={confTone} />
          {setup.atrValue != null && (
            <span className="text-[10px] text-slate-500">ATR {fmt(setup.atrValue, 0)}</span>
          )}
        </div>
      </div>

      {/* Setup summary */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-slate-500">Setup</span>{" "}
          <span className="text-slate-200 font-medium">{isBull ? "CALL buy" : "PUT buy"}</span>
        </div>
        <div>
          <span className="text-slate-500">Qty</span>{" "}
          <span className="text-slate-200 font-medium">1 lot ({setup.lotSize ?? 50})</span>
        </div>
      </div>

      {/* Entry + SL */}
      <div className="bg-slate-900/60 rounded-lg p-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-slate-500 mb-0.5">Entry (est. premium)</div>
          <div className="text-sm font-bold text-slate-100">
            ₹{setup.estimatedPremium != null ? fmt(setup.estimatedPremium, 0) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 mb-0.5">Stop loss premium</div>
          <div className="text-sm font-bold text-rose-400">
            ₹{setup.slPremium != null ? fmt(setup.slPremium, 0) : "—"}
            {setup.estimatedPremium && setup.slPremium != null && (
              <span className="text-[10px] text-slate-500 font-normal ml-1">
                (50% of premium)
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 mb-0.5">SL ordering at</div>
          <div className="text-sm font-semibold text-rose-400">
            ₹{setup.slPremium != null ? fmt(setup.slPremium, 0) : "—"}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 mb-0.5">SL underlying at</div>
          <div className="text-sm font-semibold text-rose-400">
            {setup.slUnderlying != null ? fmt(setup.slUnderlying, 0) : "—"}
          </div>
          {setup.supertrendValue && (
            <div className="text-[10px] text-slate-500">
              ST: {fmt(setup.supertrendValue, 0)} ({setup.supertrendDir === "up" ? "Bull" : "Bear"})
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] text-slate-500 mb-0.5">Target 1 (2×ATR)</div>
          <div className="text-sm font-semibold text-emerald-400">
            {setup.target1Underlying != null ? fmt(setup.target1Underlying, 0) : "—"}
          </div>
          {setup.target1Premium != null && (
            <div className="text-[10px] text-slate-500">~₹{fmt(setup.target1Premium, 0)} premium</div>
          )}
        </div>
        <div>
          <div className="text-[10px] text-slate-500 mb-0.5">Target 2 (3×ATR)</div>
          <div className="text-sm font-semibold text-emerald-300">
            {setup.target2Underlying != null ? fmt(setup.target2Underlying, 0) : "—"}
          </div>
          {setup.target2Premium != null && (
            <div className="text-[10px] text-slate-500">~₹{fmt(setup.target2Premium, 0)} premium</div>
          )}
        </div>
      </div>

      {/* R:R */}
      {setup.rrRatio != null && (
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-400">R:R  1:{fmt(setup.rrRatio, 1)}</span>
            <div className="flex gap-3 text-[10px]">
              <span className="text-rose-400">Risk ₹{setup.riskPerLot != null ? fmt(setup.riskPerLot, 0) : "—"}</span>
              <span className="text-emerald-400">Reward ₹{setup.rewardPerLot != null ? fmt(setup.rewardPerLot, 0) : "—"}</span>
            </div>
          </div>
          <RRBar rr={setup.rrRatio} />
          <div className="text-[10px] text-slate-500 mt-1">Book 50% at Target 1</div>
        </div>
      )}

      {/* Thesis */}
      {setup.thesis?.length ? (
        <div className="flex flex-wrap gap-1">
          {setup.thesis.slice(0, 3).map((t, i) => (
            <span key={i} className="text-[10px] bg-slate-700/50 rounded px-1.5 py-0.5 text-slate-300">{t}</span>
          ))}
        </div>
      ) : null}

      {setup.aiSummary && (
        <div className="text-[11px] text-slate-400 leading-snug">{setup.aiSummary}</div>
      )}
    </div>
  );
}

// ─── Multi-timeframe row ──────────────────────────────────────────────────────

function TFColumn({ tf }: { tf: MultiTimeframeRow }) {
  const label = tf.interval === "15minute" ? "15 min" : tf.interval === "60minute" ? "1 hour" : tf.interval === "day" ? "Daily" : tf.interval ?? "—";
  const tone = tf.bias === "Bull" ? "bull" : tf.bias === "Bear" ? "bear" : "neutral";
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg bg-slate-800/50 border border-white/6 px-3 py-2 min-w-[80px]">
      <div className="text-[10px] text-slate-500 font-medium">{label}</div>
      <Pill label={tf.bias ?? "—"} tone={tone} />
      <div className="text-[10px] text-slate-400 text-center leading-tight">
        RSI {tf.rsi != null ? tf.rsi : "—"} {tf.rsiDir ?? ""}
      </div>
      <div className="text-[10px] text-slate-400 text-center leading-tight">
        ST: {tf.supertrendDir ?? "—"}
      </div>
      <div className="text-[10px] text-slate-400 text-center leading-tight">
        VWAP: {tf.vwapPos ?? "—"}
      </div>
    </div>
  );
}

// ─── Main SignalDeskView ─────────────────────────────────────────────────────

interface Props {
  data: DashboardState | null;
  loading?: boolean;
  onRunSignals?: () => void;
  onRefresh?: () => void;
}

export default function SignalDeskView({ data, loading, onRunSignals, onRefresh }: Props) {
  const intel = data?.intelligence;
  const signal = data?.runtime?.signals?.signal;
  const technicals = intel?.technicals ?? signal?.technicals;
  const mm = intel?.marketMove;
  const spot = mm?.spot ?? signal?.spotPrice ?? null;
  const changePct = mm?.changePct ?? null;
  const isMarketOpen = data?.charts?.marketOpenNow ?? false;
  const botMode = data?.config?.botMode ?? "paper";

  const rsi = technicals?.rsi;
  const macd = technicals?.macd;
  const bb = technicals?.bollingerBands;
  const atr = technicals?.atr;
  const st = technicals?.supertrend;

  const signalDir = signal?.direction ?? "—";
  const signalScore = signal?.score ?? null;
  const confirmCount = signal?.confirmations?.count ?? 0;
  const vwap = signal?.indicators?.vwap ?? null;
  const sma9 = signal?.indicators?.sma9 ?? null;
  const sma20 = signal?.indicators?.sma20 ?? null;

  const pcr = intel?.pcr ?? null;
  const callVolPct = intel?.callVolumePct ?? null;
  const putVolPct = intel?.putVolumePct ?? null;
  const indiaVix = intel?.indiaVix ?? null;
  const maxPain = intel?.maxPain ?? null;
  const ivAtm = intel?.ivAtm ?? null;
  const optionChain = intel?.optionChain;
  const atmStrike = optionChain?.atmStrike ?? null;
  const multiTF = intel?.multiTimeframe ?? null;
  const tradeSetups = intel?.tradeSetups ?? [];

  const callPremium = intel?.atmOptions?.callPremium ?? null;
  const putPremium = intel?.atmOptions?.putPremium ?? null;
  const callSymbol = intel?.atmOptions?.callSymbol ?? null;
  const putSymbol = intel?.atmOptions?.putSymbol ?? null;

  // Signal direction tone
  const dirUp = signalDir === "CALL" || signalDir === "UP";
  const dirDown = signalDir === "PUT" || signalDir === "DOWN";
  const dirTone = dirUp ? "text-emerald-400" : dirDown ? "text-rose-400" : "text-slate-300";
  const dirBg = dirUp ? "border-emerald-700/50 bg-emerald-950/40" : dirDown ? "border-rose-700/50 bg-rose-950/40" : "border-white/8 bg-slate-800/40";

  // RSI interpretation
  const rsiVal = rsi?.value ?? null;
  const rsiLabel = rsiVal == null ? "—" : rsiVal > 70 ? "Overbought" : rsiVal > 55 ? "Bull swing" : rsiVal < 30 ? "Oversold" : rsiVal < 45 ? "Bear swing" : "Neutral";
  const rsiTone: "bull" | "bear" | "warn" | "neutral" = rsiVal == null ? "neutral" : rsiVal > 70 ? "warn" : rsiVal > 55 ? "bull" : rsiVal < 30 ? "warn" : rsiVal < 45 ? "bear" : "neutral";

  // MACD interpretation
  const macdHist = macd?.histogram ?? null;
  const macdLabel = macdHist == null ? "—" : macdHist > 0 ? "Bull crossover" : "Bear crossover";
  const macdTone: "bull" | "bear" | "neutral" = macdHist == null ? "neutral" : macdHist > 0 ? "bull" : "bear";

  // BB interpretation
  const bbLabel = bb?.bandLabel ?? bb?.zone ?? "—";
  const bbZone = bb?.zone ?? "";
  const bbTone: "bull" | "bear" | "neutral" | "warn" = bbZone.includes("upper") ? "warn" : bbZone.includes("lower") ? "warn" : "neutral";

  // Supertrend interpretation
  const stTrend = st?.trend ?? null;
  const stTone: "bull" | "bear" | "neutral" = stTrend === "up" ? "bull" : stTrend === "down" ? "bear" : "neutral";

  // PCR interpretation
  const pcrLabel = pcr == null ? "—" : pcr > 1.3 ? "Bearish sell call(s)" : pcr > 1.0 ? "Mild bearish" : pcr < 0.7 ? "Bullish sell put(s)" : "Balanced";
  const pcrTone: "bull" | "bear" | "neutral" = pcr == null ? "neutral" : pcr > 1.3 ? "bear" : pcr < 0.7 ? "bull" : "neutral";

  // VIX interpretation
  const vixLabel = indiaVix == null ? "—" : indiaVix > 20 ? "High — avoid buying" : indiaVix > 15 ? "Moderate" : "Low — good for buys";
  const vixTone: "bull" | "bear" | "warn" | "neutral" = indiaVix == null ? "neutral" : indiaVix > 20 ? "bear" : indiaVix > 15 ? "warn" : "bull";

  // VWAP interpretation
  const vwapPos = spot != null && vwap != null ? (spot > vwap ? "Above VWAP" : "Below VWAP") : "—";
  const vwapTone: "bull" | "bear" | "neutral" = spot == null || vwap == null ? "neutral" : spot > vwap ? "bull" : "bear";

  // Multi-TF alignment score
  const tfBullCount = multiTF?.filter((t) => t.bias === "Bull").length ?? 0;
  const tfBearCount = multiTF?.filter((t) => t.bias === "Bear").length ?? 0;
  const tfTotal = (multiTF?.length ?? 0) + 1; // include 5min estimate from signal
  const tfAlignLabel =
    tfBullCount >= 3 ? "Strong bullish alignment — good to enter CALL"
    : tfBearCount >= 3 ? "Strong bearish alignment — good to enter PUT"
    : tfBullCount >= 2 ? "Moderate bullish — use smaller size"
    : tfBearCount >= 2 ? "Moderate bearish — use smaller size"
    : "Low alignment — wait for confluence before entering";
  const tfAlignTone: "bull" | "bear" | "warn" | "neutral" =
    tfBullCount >= 3 ? "bull" : tfBearCount >= 3 ? "bear" : "warn";

  // OI trend from option chain
  const totalCeOi = optionChain?.totalCeOi ?? 0;
  const totalPeOi = optionChain?.totalPeOi ?? 0;
  const oiTrendLabel = totalPeOi > totalCeOi * 1.3 ? "Short buildup" : totalCeOi > totalPeOi * 1.3 ? "Short covering" : "Balanced";

  // News bias
  const newsBias = intel?.news?.summary?.bias ?? "neutral";
  const newsTone: "bull" | "bear" | "neutral" = newsBias === "bullish" ? "bull" : newsBias === "bearish" ? "bear" : "neutral";

  const stHistory = (st?.history as Array<{ value: number; trend: string; close: number }> | undefined) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* ── Status strip ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isMarketOpen ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
          <span className="text-xs text-slate-400">{isMarketOpen ? "Market open" : "Market closed"}</span>
          <span className="text-xs text-slate-600">·</span>
          <span className="text-xs text-slate-500 capitalize">{botMode} mode</span>
          {data?.intelligence?.generatedAt && (
            <>
              <span className="text-xs text-slate-600">·</span>
              <span className="text-[10px] text-slate-600">
                Updated {new Date(data.intelligence.generatedAt).toLocaleTimeString("en-IN")}
              </span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="px-3 py-1 text-xs rounded bg-slate-700/60 hover:bg-slate-600/60 text-slate-300 border border-white/8"
          >
            ↺ Refresh
          </button>
          <button
            onClick={onRunSignals}
            disabled={loading}
            className="px-3 py-1 text-xs rounded bg-teal-700/80 hover:bg-teal-600/80 text-white font-semibold"
          >
            {loading ? "Running…" : "▶ Run Signals"}
          </button>
        </div>
      </div>

      {/* ── Overall signal card ───────────────────────────────────────────── */}
      <div className={`rounded-xl border ${dirBg} p-4 flex items-center justify-between gap-4`}>
        <div>
          <div className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mb-1">Overall signal</div>
          <div className={`text-4xl font-black tracking-tight ${dirTone}`}>{signalDir}</div>
          <div className="flex items-center gap-2 mt-2">
            <SignalDots count={confirmCount} max={5} />
            <span className="text-xs text-slate-400">{confirmCount}/5 confluent</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {signalScore != null && (
            <div className="text-right">
              <div className="text-[10px] text-slate-500">Score</div>
              <div className="text-2xl font-bold text-slate-100">{fmt(signalScore, 0)}</div>
            </div>
          )}
          <div className="flex flex-wrap gap-1 justify-end">
            <Pill label={stTrend === "up" ? "Supertrend Bull" : stTrend === "down" ? "Supertrend Bear" : "Supertrend —"} tone={stTone} />
            <Pill label={vwapPos} tone={vwapTone} />
          </div>
          <div className="text-[10px] text-slate-500 text-right">
            {confirmCount}/5 confluent
          </div>
        </div>
      </div>

      {/* ── Key stats row 1 ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KeyStat
          label="SPOT"
          value={spot != null ? spot.toLocaleString("en-IN") : "—"}
          sub={changePct != null ? signedPct(changePct) : undefined}
          tone={changePct == null ? "neutral" : changePct >= 0 ? "bull" : "bear"}
        />
        <KeyStat
          label="ATR (14)"
          value={atr?.value != null ? fmt(atr.value, 0) : "—"}
          sub={atr?.value != null ? `SL dist ~${fmt((atr.value ?? 0) * 1.5, 0)} pts` : undefined}
          tone="neutral"
        />
        <KeyStat
          label="SUPERTREND (7,3)"
          value={st?.value != null ? fmt(st.value, 0) : "—"}
          sub={stTrend === "up" ? "Bullish — dynamic SL" : stTrend === "down" ? "Bearish — stay below" : undefined}
          tone={stTone}
        />
        <KeyStat
          label="INDIA VIX"
          value={indiaVix != null ? fmt(indiaVix, 1) : "—"}
          sub={vixLabel}
          tone={vixTone}
        />
      </div>

      {/* ── Key stats row 2 ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KeyStat
          label="VWAP"
          value={vwap != null ? fmt(vwap, 0) : "—"}
          sub={vwapPos}
          tone={vwapTone}
        />
        <KeyStat
          label="PCR (OI)"
          value={pcr != null ? fmt(pcr, 2) : "—"}
          sub={pcrLabel}
          tone={pcrTone}
        />
        <KeyStat
          label="IV ATM"
          value={ivAtm != null ? fmtPct(ivAtm) : "—"}
          sub={ivAtm == null ? undefined : ivAtm > 25 ? "High — options pricey" : ivAtm > 15 ? "Normal range" : "Low IV"}
          tone={ivAtm == null ? "neutral" : ivAtm > 25 ? "bear" : "neutral"}
        />
        <KeyStat
          label="MAX PAIN"
          value={maxPain != null ? maxPain.toLocaleString("en-IN") : "—"}
          sub={maxPain != null && spot != null ? (spot > maxPain ? "Above max — sell line" : "Below max — buy line") : undefined}
          tone={maxPain != null && spot != null ? (spot > maxPain ? "bear" : "bull") : "neutral"}
        />
      </div>

      {/* ── Indicator panels + Options confluence ────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Technical indicators */}
        <div className="rounded-xl border border-white/8 bg-slate-800/40 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Technical indicators</div>
          <IndRow label="VWAP" value={vwap != null ? fmt(vwap, 0) : "—"} badge={vwapPos} badgeTone={vwapTone} />
          <IndRow
            label="RSI (14)"
            value={rsiVal != null ? fmt(rsiVal, 1) : "—"}
            badge={rsiLabel}
            badgeTone={rsiTone}
          />
          <IndRow
            label="MACD (12,26,9)"
            value={macd?.macd != null ? fmt(macd.macd, 2) : "—"}
            badge={macdLabel}
            badgeTone={macdTone}
          />
          <IndRow
            label="Bollinger Bands"
            value={bb?.middle != null ? fmt(bb.middle, 0) : "—"}
            badge={bbLabel || undefined}
            badgeTone={bbTone}
            sub={bb?.upper != null ? `U:${fmt(bb.upper, 0)} L:${fmt(bb.lower, 0)}` : undefined}
          />
          <IndRow
            label="Supertrend (7,3)"
            value={st?.value != null ? fmt(st.value, 0) : "—"}
            badge={stTrend === "up" ? "Bullish" : stTrend === "down" ? "Bearish" : undefined}
            badgeTone={stTone}
          />
          <IndRow
            label="ATR (14)"
            value={atr?.value != null ? fmt(atr.value, 1) : "—"}
            sub={atr?.value != null ? `SL=${fmt((atr.value ?? 0) * 1.5, 0)} T1=${fmt((atr.value ?? 0) * 2, 0)}` : undefined}
          />
          <IndRow label="SMA 9" value={sma9 != null ? fmt(sma9, 0) : "—"} badge={sma9 != null && spot != null ? (spot > sma9 ? "Above" : "Below") : undefined} badgeTone={sma9 != null && spot != null ? (spot > sma9 ? "bull" : "bear") : "neutral"} />
          <IndRow label="SMA 20" value={sma20 != null ? fmt(sma20, 0) : "—"} badge={sma20 != null && spot != null ? (spot > sma20 ? "Above" : "Below") : undefined} badgeTone={sma20 != null && spot != null ? (spot > sma20 ? "bull" : "bear") : "neutral"} />
        </div>

        {/* Options confluence */}
        <div className="rounded-xl border border-white/8 bg-slate-800/40 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Options confluence</div>
          <IndRow label="PCR (OI)" value={pcr != null ? fmt(pcr, 2) : "—"} badge={pcrLabel} badgeTone={pcrTone} />
          <IndRow
            label="OI Trend"
            value={`CE ${fmt(totalCeOi, 1)}L / PE ${fmt(totalPeOi, 1)}L`}
            badge={oiTrendLabel}
            badgeTone={totalPeOi > totalCeOi * 1.2 ? "bear" : totalCeOi > totalPeOi * 1.2 ? "bull" : "neutral"}
          />
          <IndRow
            label="Call volume"
            value={callVolPct != null ? `${callVolPct}%` : "—"}
            badge={callVolPct != null ? (callVolPct > 55 ? "CE heavy" : callVolPct < 45 ? "PE heavy" : "Balanced") : undefined}
            badgeTone={callVolPct != null ? (callVolPct > 55 ? "bull" : callVolPct < 45 ? "bear" : "neutral") : "neutral"}
          />
          <IndRow
            label="India VIX"
            value={indiaVix != null ? fmt(indiaVix, 1) : "—"}
            badge={vixLabel}
            badgeTone={vixTone}
          />
          <IndRow
            label="Max Pain"
            value={maxPain != null ? maxPain.toLocaleString("en-IN") : "—"}
            badge={maxPain != null && spot != null ? (spot > maxPain ? "Above max — sell line" : "Below max") : undefined}
            badgeTone={maxPain != null && spot != null ? (spot > maxPain ? "bear" : "bull") : "neutral"}
          />
          <IndRow
            label="ATM Call premium"
            value={callPremium != null ? `₹${fmt(callPremium, 0)}` : "—"}
            sub={callSymbol ?? undefined}
          />
          <IndRow
            label="ATM Put premium"
            value={putPremium != null ? `₹${fmt(putPremium, 0)}` : "—"}
            sub={putSymbol ?? undefined}
          />
          <IndRow
            label="News bias"
            value={newsBias}
            badge={newsBias}
            badgeTone={newsTone}
          />
        </div>
      </div>

      {/* ── Multi-timeframe alignment ─────────────────────────────────────── */}
      {multiTF && multiTF.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-slate-800/40 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Multi-timeframe alignment — {data?.config?.niftySymbol ?? "NIFTY"}
          </div>
          <div className="flex gap-3 flex-wrap mb-3">
            {/* 5min inferred from current signal */}
            <div className="flex flex-col items-center gap-1 rounded-lg bg-slate-800/50 border border-white/6 px-3 py-2 min-w-[80px]">
              <div className="text-[10px] text-slate-500 font-medium">5 min</div>
              <Pill label={dirUp ? "Bull" : dirDown ? "Bear" : "Mixed"} tone={dirUp ? "bull" : dirDown ? "bear" : "neutral"} />
              <div className="text-[10px] text-slate-400 text-center">RSI {rsiVal != null ? fmt(rsiVal, 0) : "—"} {rsiLabel}</div>
              <div className="text-[10px] text-slate-400 text-center">ST: {stTrend === "up" ? "Bull" : stTrend === "down" ? "Bear" : "—"}</div>
              <div className="text-[10px] text-slate-400 text-center">VWAP: {vwapPos}</div>
            </div>
            {multiTF.map((tf) => <TFColumn key={tf.interval} tf={tf} />)}
          </div>
          <div className={`text-xs rounded px-3 py-1.5 ${
            tfAlignTone === "bull" ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40"
            : tfAlignTone === "bear" ? "bg-rose-950/60 text-rose-300 border border-rose-800/40"
            : "bg-amber-950/60 text-amber-300 border border-amber-800/40"
          }`}>
            {tfAlignLabel}
          </div>
        </div>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Price + Supertrend */}
        <div className="rounded-xl border border-white/8 bg-slate-800/40 p-4">
          <div className="text-xs text-slate-500 mb-2">Price · Supertrend · VWAP (5 candles)</div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center gap-1"><div className="h-0.5 w-4 bg-slate-400" /><span className="text-[10px] text-slate-500">Price</span></div>
            <div className="flex items-center gap-1"><div className="h-0.5 w-4 bg-emerald-500" style={{ borderTop: "1px dashed" }} /><span className="text-[10px] text-slate-500">ST Bull</span></div>
            <div className="flex items-center gap-1"><div className="h-0.5 w-4 bg-rose-500" style={{ borderTop: "1px dashed" }} /><span className="text-[10px] text-slate-500">ST Bear</span></div>
          </div>
          <PriceSTChart stHistory={stHistory} width={280} height={80} />
          {st && (
            <div className="mt-2 flex gap-3 text-[10px] text-slate-400">
              <span>ST: {fmt(st.value, 0)}</span>
              <span className={stTrend === "up" ? "text-emerald-400" : "text-rose-400"}>{stTrend === "up" ? "▲ Bullish" : "▼ Bearish"}</span>
              {vwap && <span>VWAP: {fmt(vwap, 0)}</span>}
            </div>
          )}
        </div>

        {/* RSI + MACD histogram */}
        <div className="rounded-xl border border-white/8 bg-slate-800/40 p-4">
          <div className="text-xs text-slate-500 mb-2">RSI · MACD histogram (15 candles)</div>
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-[10px] text-slate-500 mb-1">RSI (14)</div>
              <SparkLine
                data={rsi?.history ?? []}
                color={rsiVal != null && rsiVal > 50 ? "#10b981" : "#f43f5e"}
                refLine={50}
                width={260}
                height={36}
              />
              <div className="flex gap-3 text-[10px] text-slate-400 mt-0.5">
                <span>RSI: {rsiVal != null ? fmt(rsiVal, 1) : "—"}</span>
                <span className={rsiTone === "bull" ? "text-emerald-400" : rsiTone === "bear" ? "text-rose-400" : "text-amber-400"}>{rsiLabel}</span>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="flex items-center gap-1"><div className="h-0.5 w-3 bg-sky-400" /><span className="text-[10px] text-slate-500">MACD</span></div>
                <div className="flex items-center gap-1"><div className="h-0.5 w-3 bg-amber-400" style={{ borderTop: "1px dashed" }} /><span className="text-[10px] text-slate-500">Signal</span></div>
              </div>
              <MACDChart history={macd?.history ?? []} width={260} height={44} />
              <div className="flex gap-3 text-[10px] text-slate-400 mt-0.5">
                <span>MACD: {macd?.macd != null ? fmt(macd.macd, 2) : "—"}</span>
                <span className={macdTone === "bull" ? "text-emerald-400" : "text-rose-400"}>{macdLabel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── OI Strike chart ───────────────────────────────────────────────── */}
      {optionChain?.rows && optionChain.rows.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-slate-800/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-slate-500">OI strike · CE vs PE (Lakh contracts)</div>
            <div className="flex gap-3 text-[10px]">
              <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded-sm bg-blue-500" /><span className="text-slate-500">CE OI</span></div>
              <div className="flex items-center gap-1"><div className="h-2.5 w-2.5 rounded-sm bg-rose-500" /><span className="text-slate-500">PE OI</span></div>
              {atmStrike && <span className="text-slate-500">ATM: {atmStrike}</span>}
            </div>
          </div>
          <OIBarChart rows={optionChain.rows} atmStrike={atmStrike ?? undefined} width={500} height={72} />
        </div>
      )}

      {/* ── Strike OI snapshot table ──────────────────────────────────────── */}
      {optionChain?.rows && optionChain.rows.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-slate-800/40 overflow-hidden">
          <div className="px-4 py-2 border-b border-white/6 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Strike OI snapshot
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/6">
                  <th className="px-3 py-2 text-left text-slate-500 font-medium">Strike</th>
                  <th className="px-3 py-2 text-right text-blue-400 font-medium">CE OI (L)</th>
                  <th className="px-3 py-2 text-right text-blue-400 font-medium">CE Chg</th>
                  <th className="px-3 py-2 text-right text-blue-400 font-medium">CE ₹</th>
                  <th className="px-3 py-2 text-right text-rose-400 font-medium">PE OI (L)</th>
                  <th className="px-3 py-2 text-right text-rose-400 font-medium">PE Chg</th>
                  <th className="px-3 py-2 text-right text-rose-400 font-medium">PE ₹</th>
                  <th className="px-3 py-2 text-right text-slate-400 font-medium">PCR</th>
                  <th className="px-3 py-2 text-center text-slate-400 font-medium">Bias</th>
                </tr>
              </thead>
              <tbody>
                {optionChain.rows.map((row) => {
                  const isAtm = row.strike === atmStrike;
                  const rowCls = isAtm ? "bg-white/5" : "";
                  const biasClr = row.bias?.includes("CE") ? "text-rose-400" : row.bias?.includes("PE") ? "text-blue-400" : "text-slate-400";
                  return (
                    <tr key={row.strike} className={`border-b border-white/4 last:border-0 ${rowCls}`}>
                      <td className="px-3 py-1.5 font-semibold text-slate-200">
                        {row.strike}{isAtm && <span className="ml-1 text-[9px] text-amber-400 font-bold">ATM</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{fmt(row.ceOi, 1)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${(row.ceChg ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {(row.ceChg ?? 0) >= 0 ? "+" : ""}{fmt(row.ceChg, 1)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">
                        {row.cePremium != null ? `₹${fmt(row.cePremium, 0)}` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{fmt(row.peOi, 1)}</td>
                      <td className={`px-3 py-1.5 text-right tabular-nums ${(row.peChg ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {(row.peChg ?? 0) >= 0 ? "+" : ""}{fmt(row.peChg, 1)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">
                        {row.pePremium != null ? `₹${fmt(row.pePremium, 0)}` : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{row.pcr != null ? fmt(row.pcr, 2) : "—"}</td>
                      <td className={`px-3 py-1.5 text-center ${biasClr}`}>{row.bias ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Trade Setup Cards ─────────────────────────────────────────────── */}
      {tradeSetups.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/12 bg-slate-800/30 px-5 py-8 text-center">
          <div className="text-2xl mb-2">📋</div>
          <div className="text-sm font-semibold text-slate-300 mb-1">No trade setup cards yet</div>
          <div className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
            Click <strong className="text-teal-400">▶ Run Signals</strong> above with a live Zerodha session during market hours (9:15am–3:30pm IST).
            Cards will show entry premium, stop loss, targets and R:R for each suggested option.
          </div>
        </div>
      )}
      {tradeSetups.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span>Trade setup guide</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-500 font-normal normal-case">Entry · Stop loss · Target</span>
          </div>
          <div className="text-[11px] text-slate-500 mb-3 bg-amber-950/30 border border-amber-800/30 rounded px-3 py-2">
            ⚠ Risk management: Never risk more than 1–2% of capital per trade. For ATM trades, capital at risk = ₹2,700 per lot.
            Full position if underlying crosses SL level, exit immediately. Trail SL to entry once Target 1 is hit.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tradeSetups.map((s, i) => (
              <TradeSetupCard key={s.id ?? i} setup={s} />
            ))}
          </div>
        </div>
      )}

      {/* ── ATR-based SL explanation ──────────────────────────────────────── */}
      {atr?.value && (
        <div className="rounded-xl border border-white/8 bg-slate-800/30 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">ATR stop loss guide</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <div className="text-slate-500 mb-0.5">ATR (14)</div>
              <div className="text-slate-100 font-semibold">{fmt(atr.value, 1)} pts</div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">1.5×ATR SL distance</div>
              <div className="text-rose-400 font-semibold">{fmt((atr.value ?? 0) * 1.5, 0)} pts</div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">2×ATR Target 1</div>
              <div className="text-emerald-400 font-semibold">{fmt((atr.value ?? 0) * 2, 0)} pts</div>
            </div>
            <div>
              <div className="text-slate-500 mb-0.5">3×ATR Target 2</div>
              <div className="text-emerald-300 font-semibold">{fmt((atr.value ?? 0) * 3, 0)} pts</div>
            </div>
          </div>
          {spot && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-400">
              <div>Spot: <span className="text-slate-100">{fmt(spot, 0)}</span></div>
              <div>CALL SL: <span className="text-rose-400">{fmt(spot - (atr.value ?? 0) * 1.5, 0)}</span></div>
              <div>CALL T1: <span className="text-emerald-400">{fmt(spot + (atr.value ?? 0) * 2, 0)}</span></div>
              <div>PUT SL: <span className="text-rose-400">{fmt(spot + (atr.value ?? 0) * 1.5, 0)}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
