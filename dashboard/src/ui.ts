import type { NoticeTone, WsState } from "./types";

export function toneClasses(tone: NoticeTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (tone === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
  if (tone === "error") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-sky-200 bg-sky-50 text-sky-900";
}

export function escapeText(value: unknown) {
  return value == null ? "-" : String(value);
}

export function sentimentClasses(sentiment?: string) {
  if (sentiment === "bullish") return "bg-emerald-50 text-emerald-700";
  if (sentiment === "bearish") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

export function wsLabel(state: WsState) {
  if (state === "live") return "Live";
  if (state === "connecting") return "Connecting";
  return "Offline";
}

export function wsClasses(state: WsState) {
  if (state === "live") return "bg-emerald-50 text-emerald-700";
  if (state === "connecting") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export function outcomeClasses(outcome?: string) {
  if (outcome === "WIN") return "bg-emerald-50 text-emerald-700";
  if (outcome === "LOSS") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}
