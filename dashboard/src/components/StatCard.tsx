export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
    </article>
  );
}
