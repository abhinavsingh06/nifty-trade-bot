import type { ReactNode } from "react";

type SectionCardProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function SectionCard({
  eyebrow,
  title,
  description,
  action,
  children,
  className = "",
}: SectionCardProps) {
  return (
    <article
      className={`rounded-[28px] border border-white/8 bg-[#111827]/88 p-6 shadow-[0_18px_60px_rgba(2,6,23,0.35)] backdrop-blur ${className}`}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-1 text-2xl font-semibold text-white">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="max-w-full shrink-0">{action}</div> : null}
      </div>
      {children}
    </article>
  );
}
