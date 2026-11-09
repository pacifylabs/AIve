/** A tiny line of numbers over time. Drawn from the data alone; the figures beside it say the same in words. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const span = Math.max(Math.max(...values) - min, 1);
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * 80},${22 - ((value - min) / span) * 20}`)
    .join(' ');
  return (
    <svg width="80" height="24" viewBox="0 0 80 24" role="img" aria-label={label} className="text-accent">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
