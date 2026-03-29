export function CandleChart({
  candles
}: {
  candles: Array<{ time: string; open: number; high: number; low: number; close: number }>;
}) {
  if (!candles.length) {
    return <div className="flex min-h-[240px] items-center text-slate-500">No candle data available.</div>;
  }

  const width = 920;
  const height = 280;
  const padding = 20;
  const highs = candles.map((item) => item.high);
  const lows = candles.map((item) => item.low);
  const maxPrice = Math.max(...highs);
  const minPrice = Math.min(...lows);
  const priceRange = Math.max(1, maxPrice - minPrice);
  const candleGap = width / candles.length;
  const bodyWidth = Math.max(5, candleGap * 0.52);
  const yForPrice = (price: number) => padding + ((maxPrice - price) / priceRange) * (height - padding * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full rounded-[24px] bg-slate-950/95">
      {candles.map((candle, index) => {
        const x = index * candleGap + candleGap / 2;
        const openY = yForPrice(candle.open);
        const closeY = yForPrice(candle.close);
        const highY = yForPrice(candle.high);
        const lowY = yForPrice(candle.low);
        const bullish = candle.close >= candle.open;
        const bodyTop = Math.min(openY, closeY);
        const bodyHeight = Math.max(2, Math.abs(closeY - openY));
        const color = bullish ? "#10b981" : "#fb7185";

        return (
          <g key={`${candle.time}-${index}`}>
            <line x1={x} x2={x} y1={highY} y2={lowY} stroke={color} strokeWidth="1.8" />
            <rect
              x={x - bodyWidth / 2}
              y={bodyTop}
              width={bodyWidth}
              height={bodyHeight}
              rx="4"
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({
  points,
  positive
}: {
  points: Array<{ label: string; value: number }>;
  positive?: boolean;
}) {
  if (!points.length) {
    return <div className="flex min-h-[220px] items-center text-slate-500">No line data available.</div>;
  }

  const width = 920;
  const height = 220;
  const padding = 18;
  const values = points.map((item) => item.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(1, max - min);
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const y = (value: number) => padding + ((max - value) / range) * (height - padding * 2);
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${padding + index * step} ${y(point.value)}`)
    .join(" ");
  const areaPath = `${path} L ${padding + (points.length - 1) * step} ${height - padding} L ${padding} ${height - padding} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[220px] w-full rounded-[24px] bg-white">
      <path d={areaPath} fill={positive ? "rgba(16,185,129,0.12)" : "rgba(59,130,246,0.12)"} />
      <path
        d={path}
        fill="none"
        stroke={positive ? "#10b981" : "#2563eb"}
        strokeWidth="3.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((point, index) => (
        <circle key={`${point.label}-${index}`} cx={padding + index * step} cy={y(point.value)} r="4.5" fill={positive ? "#10b981" : "#2563eb"} />
      ))}
    </svg>
  );
}
