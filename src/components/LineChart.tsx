/** 极简折线图，不引入图表库 */
export function LineChart({ points, unit, height = 120 }: { points: { date: string; value: number }[]; unit: string; height?: number }) {
  if (points.length < 2) {
    return <p className="muted small">至少需要两次记录才能画出趋势。</p>;
  }
  const w = 320;
  const pad = 28;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || Math.abs(max) * 0.05 || 1;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const y = (v: number) => height - pad + 8 - ((v - min) / span) * (height - pad * 1.5);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label="趋势图">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={p.date + i}>
          <circle cx={x(i)} cy={y(p.value)} r={4} fill="var(--accent)" />
          <text x={x(i)} y={y(p.value) - 9} textAnchor="middle" className="chart-v">
            {p.value}
            {unit}
          </text>
          <text x={x(i)} y={height - 4} textAnchor="middle" className="chart-l">
            {p.date.slice(2, 7)}
          </text>
        </g>
      ))}
    </svg>
  );
}
