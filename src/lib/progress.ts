import type { AppState, BodyRecord, DexaRecord, LabRecord, Milestone, MilestoneMetric } from '../types';

export type Zone = 'green' | 'yellow' | 'red';

/** WHO: T ≥ -1 normal; -1 to -2.5 osteopenia; ≤ -2.5 osteoporosis */
export function zoneOfT(t?: number): Zone | undefined {
  if (t === undefined || Number.isNaN(t)) return undefined;
  if (t >= -1) return 'green';
  if (t > -2.5) return 'yellow';
  return 'red';
}

export const ZONE_LABEL: Record<Zone, string> = {
  green: 'Normal',
  yellow: 'Osteopenia',
  red: 'Osteoporosis range',
};

export const METRIC_INFO: Record<MilestoneMetric, { name: string; unit: string; hint: string }> = {
  spineBmdPct: { name: 'Spine BMD gain', unit: '%', hint: 'A year of regular resistance + impact training typically raises spine BMD by about 1–3%' },
  hipBmdPct: { name: 'Hip BMD gain', unit: '%', hint: 'The hip usually responds more slowly than the spine, about 0.5–2% a year' },
  spineScore: {
    name: 'Spine T- and Z-score',
    unit: '',
    hint: 'Absolute target: the lower of the spine T-score and Z-score must reach it (e.g. -2.5). -2.5 is the edge of the osteoporosis range; for men under 50 the Z-score is the one doctors go by.',
  },
  hipScore: { name: 'Hip T- and Z-score', unit: '', hint: 'Absolute target: the lower of the hip T-score and Z-score must reach it.' },
  muscleKg: { name: 'Muscle gain', unit: 'kg', hint: 'In a beginner’s first year with enough protein: roughly +1–3 kg for women, +2–5 kg for men' },
  fatPct: { name: 'Body fat change', unit: ' pts', hint: 'Use a negative number for a decrease, e.g. -3' },
};

function sortByDate<T extends { date: string }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => a.date.localeCompare(b.date));
}

export const isScoreMetric = (m: MilestoneMetric) => m === 'spineScore' || m === 'hipScore';
const isDexaMetric = (m: MilestoneMetric) => m === 'spineBmdPct' || m === 'hipBmdPct' || isScoreMetric(m);

/** Lower of T and Z (both have to reach the goal); whichever exists if only one was entered */
function lowerScore(t?: number, z?: number): number | undefined {
  const vals = [t, z].filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  return vals.length ? Math.min(...vals) : undefined;
}

function metricValue(metric: MilestoneMetric, r: DexaRecord | BodyRecord): number | undefined {
  switch (metric) {
    case 'spineScore':
      return lowerScore((r as DexaRecord).spineT, (r as DexaRecord).spineZ);
    case 'hipScore':
      return lowerScore((r as DexaRecord).hipT, (r as DexaRecord).hipZ);
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
  const src: (DexaRecord | BodyRecord)[] = isDexaMetric(metric) ? state.dexa : state.body;
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
  if (isScoreMetric(m.metric)) {
    // Absolute goal: the latest scan has to reach the target score
    const baseline = m.startValue !== undefined ? { date: '', value: m.startValue } : series[0];
    const latest = series[series.length - 1];
    if (!latest || !baseline) return { baseline, latest, achieved: false, ratio: 0 };
    const achieved = latest.value >= m.target - 1e-9;
    const span = m.target - baseline.value;
    const ratio = achieved ? 1 : span <= 0 ? 0 : Math.max(0, Math.min(1, (latest.value - baseline.value) / span));
    return { baseline, latest, change: latest.value - baseline.value, achieved, ratio };
  }
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

// ───── Lab results (vitamin D3 etc.) ─────

export interface LabTestDef {
  key: string;
  name: string;
  units: string[];
  about: string;
  /** Classify a value given in units[0]; other units are converted first */
  classify?: (value: number) => { label: string; zone: Zone };
  /** Convert a value in `unit` to units[0] */
  toBase?: (value: number, unit: string) => number;
}

function range(lo: number, hi: number) {
  return (v: number) =>
    v < lo ? { label: 'Low', zone: 'yellow' as Zone } : v > hi ? { label: 'High', zone: 'yellow' as Zone } : { label: 'Normal', zone: 'green' as Zone };
}

/** Typical adult reference ranges; labs differ, so the report's own range wins */
export const LAB_TESTS: LabTestDef[] = [
  {
    key: 'vitD',
    name: 'Vitamin D, 25(OH)D (D3)',
    units: ['ng/mL', 'nmol/L'],
    about: 'Needed to absorb calcium. Under 20 ng/mL is deficient, 20–29 insufficient, 30–100 sufficient (1 ng/mL = 2.5 nmol/L).',
    toBase: (v, unit) => (unit === 'nmol/L' ? v / 2.5 : v),
    classify: (v) =>
      v < 20
        ? { label: 'Deficient', zone: 'red' }
        : v < 30
          ? { label: 'Insufficient', zone: 'yellow' }
          : v <= 100
            ? { label: 'Sufficient', zone: 'green' }
            : { label: 'High', zone: 'yellow' },
  },
  {
    key: 'calcium',
    name: 'Serum calcium',
    units: ['mg/dL', 'mmol/L'],
    about: 'Typical range 8.5–10.5 mg/dL (2.12–2.62 mmol/L).',
    toBase: (v, unit) => (unit === 'mmol/L' ? v * 4.008 : v),
    classify: range(8.5, 10.5),
  },
  {
    key: 'pth',
    name: 'Parathyroid hormone (PTH)',
    units: ['pg/mL'],
    about: 'Typical range 15–65 pg/mL. High PTH with low vitamin D can pull calcium out of bone.',
    classify: range(15, 65),
  },
  {
    key: 'phosphate',
    name: 'Phosphate',
    units: ['mg/dL'],
    about: 'Typical range 2.5–4.5 mg/dL.',
    classify: range(2.5, 4.5),
  },
  {
    key: 'alp',
    name: 'Alkaline phosphatase (ALP)',
    units: ['U/L'],
    about: 'Bone-turnover marker. Typical range 44–147 U/L.',
    classify: range(44, 147),
  },
  {
    key: 'testosterone',
    name: 'Total testosterone (men)',
    units: ['ng/dL', 'nmol/L'],
    about: 'Low testosterone is a common cause of low bone density in young men. Typical range 300–1000 ng/dL (10.4–34.7 nmol/L).',
    toBase: (v, unit) => (unit === 'nmol/L' ? v * 28.84 : v),
    classify: range(300, 1000),
  },
  {
    key: 'tsh',
    name: 'TSH (thyroid)',
    units: ['mIU/L'],
    about: 'Typical range 0.4–4.0 mIU/L. An overactive thyroid speeds up bone loss.',
    classify: range(0.4, 4.0),
  },
];

export const LAB_MAP: Record<string, LabTestDef> = Object.fromEntries(LAB_TESTS.map((t) => [t.key, t]));

export function labName(test: string): string {
  return LAB_MAP[test]?.name ?? test;
}

export function classifyLab(r: LabRecord): { label: string; zone: Zone } | undefined {
  const def = LAB_MAP[r.test];
  if (!def?.classify) return undefined;
  return def.classify(def.toBase ? def.toBase(r.value, r.unit) : r.value);
}
