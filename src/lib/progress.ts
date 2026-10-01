import type { AppState, BodyRecord, DexaRecord, Milestone, MilestoneMetric } from '../types';

export type Zone = 'green' | 'yellow' | 'red';

/** WHO 标准：T ≥ -1 正常；-1 ~ -2.5 骨量减少；≤ -2.5 骨质疏松 */
export function zoneOfT(t?: number): Zone | undefined {
  if (t === undefined || Number.isNaN(t)) return undefined;
  if (t >= -1) return 'green';
  if (t > -2.5) return 'yellow';
  return 'red';
}

export const ZONE_LABEL: Record<Zone, string> = {
  green: '正常',
  yellow: '骨量减少',
  red: '骨质疏松范围',
};

export const METRIC_INFO: Record<MilestoneMetric, { name: string; unit: string; hint: string }> = {
  spineBmdPct: { name: '腰椎 BMD 提升', unit: '%', hint: '规律抗阻+冲击训练一年，腰椎 BMD 通常可提升约 1-3%' },
  hipBmdPct: { name: '髋部 BMD 提升', unit: '%', hint: '髋部通常比腰椎反应慢，一年约 0.5-2%' },
  muscleKg: { name: '肌肉量增加', unit: 'kg', hint: '新手第一年认真训练+吃够蛋白质，女性约 +1-3kg，男性约 +2-5kg' },
  fatPct: { name: '体脂率变化', unit: '个百分点', hint: '填负数表示下降，例如 -3' },
};

function sortByDate<T extends { date: string }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => a.date.localeCompare(b.date));
}

function metricValue(metric: MilestoneMetric, r: DexaRecord | BodyRecord): number | undefined {
  switch (metric) {
    case 'spineBmdPct':
      return (r as DexaRecord).spineBmd;
    case 'hipBmdPct':
      return (r as DexaRecord).hipBmd;
    case 'muscleKg':
      return (r as BodyRecord).muscleKg;
    case 'fatPct':
      return (r as BodyRecord).fatPct;
  }
}

export function metricSeries(state: AppState, memberId: string, metric: MilestoneMetric) {
  const src: (DexaRecord | BodyRecord)[] =
    metric === 'spineBmdPct' || metric === 'hipBmdPct' ? state.dexa : state.body;
  return sortByDate(src.filter((r) => r.memberId === memberId))
    .map((r) => ({ date: r.date, value: metricValue(metric, r) }))
    .filter((p): p is { date: string; value: number } => typeof p.value === 'number' && !Number.isNaN(p.value));
}

export interface MilestoneProgress {
  baseline?: { date: string; value: number };
  latest?: { date: string; value: number };
  change?: number;
  achieved: boolean;
  ratio: number;
}

export function milestoneProgress(state: AppState, m: Milestone): MilestoneProgress {
  const series = metricSeries(state, m.memberId, m.metric);
  if (series.length < 2) {
    return { baseline: series[0], latest: series[0], achieved: false, ratio: 0 };
  }
  const baseline = series[0];
  const latest = series[series.length - 1];
  const change =
    m.metric === 'spineBmdPct' || m.metric === 'hipBmdPct'
      ? ((latest.value - baseline.value) / baseline.value) * 100
      : latest.value - baseline.value;
  const achieved = m.target >= 0 ? change >= m.target : change <= m.target;
  const ratio = m.target === 0 ? (achieved ? 1 : 0) : Math.max(0, Math.min(1, change / m.target));
  return { baseline, latest, change, achieved, ratio };
}
