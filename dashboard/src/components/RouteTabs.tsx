export function RouteTabs({ crypto }: { crypto: boolean }) {
  return (
    <div className="inline-flex flex-wrap gap-3 rounded-full border border-white/10 bg-[#0f172a]/85 p-2 shadow-[0_14px_40px_rgba(2,6,23,0.32)] backdrop-blur">
        <a
          href="/"
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${crypto ? "bg-white/5 text-slate-300 ring-1 ring-white/10" : "bg-white text-slate-900"}`}
        >
          Indian Market Dashboard
        </a>
        <a
          href="/crypto"
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${crypto ? "bg-white text-slate-900" : "bg-white/5 text-slate-300 ring-1 ring-white/10"}`}
        >
          Crypto Study Dashboard
        </a>
      </div>
  );
}
