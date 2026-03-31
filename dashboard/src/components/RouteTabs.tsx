export function RouteTabs({ active }: { active: "indian" | "analytics" | "crypto" }) {
  return (
    <a href="/" className="flex items-center gap-2 text-base font-bold text-white tracking-tight">
      <span className="text-teal-400">⚡</span> NSE Options Desk
    </a>
  );
}
