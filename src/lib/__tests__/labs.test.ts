import { describe, expect, it } from 'vitest';
import { classifyLab, milestoneProgress } from '../progress';
import { defaultState } from '../../store';
import type { LabRecord } from '../../types';

const rec = (test: string, value: number, unit: string): LabRecord => ({ id: 'x', memberId: 'm', date: '2026-10-01', test, value, unit });

describe('classifyLab', () => {
  it('grades vitamin D in ng/mL', () => {
    expect(classifyLab(rec('vitD', 15, 'ng/mL'))?.label).toBe('Deficient');
    expect(classifyLab(rec('vitD', 25, 'ng/mL'))?.label).toBe('Insufficient');
    expect(classifyLab(rec('vitD', 40, 'ng/mL'))?.label).toBe('Sufficient');
  });

  it('converts vitamin D from nmol/L', () => {
    expect(classifyLab(rec('vitD', 60, 'nmol/L'))?.label).toBe('Insufficient'); // 24 ng/mL
    expect(classifyLab(rec('vitD', 100, 'nmol/L'))?.label).toBe('Sufficient'); // 40 ng/mL
  });

  it('uses simple ranges for other tests and nothing for custom ones', () => {
    expect(classifyLab(rec('pth', 80, 'pg/mL'))?.label).toBe('High');
    expect(classifyLab(rec('calcium', 2.3, 'mmol/L'))?.label).toBe('Normal');
    expect(classifyLab(rec('Magnesium', 2, 'mg/dL'))).toBeUndefined();
  });
});

describe('T/Z-score goals', () => {
  const goal = (target: number) => ({ id: 'g', memberId: 'm_hubby', metric: 'spineScore' as const, target, reward: 200, startValue: -3, deadline: '2027-10-02', title: '' });
  const dexa = (date: string, spineT: number, spineZ: number) => ({ id: date, memberId: 'm_hubby', date, spineT, spineZ });

  it('uses the lower of T and Z, measured against the absolute target', () => {
    const state = { ...defaultState(), dexa: [dexa('2026-10-01', -3, -3), dexa('2027-09-20', -2.7, -2.9)] };
    expect(milestoneProgress(state, goal(-2.8)).achieved).toBe(false);
    const better = { ...state, dexa: [...state.dexa, dexa('2027-09-30', -2.6, -2.8)] };
    const p = milestoneProgress(better, goal(-2.8));
    expect(p.achieved).toBe(true);
    expect(p.ratio).toBe(1);
    const half = milestoneProgress(better, goal(-2.6));
    expect(half.achieved).toBe(false);
    expect(half.ratio).toBeCloseTo(0.5);
  });

  it('starts from the given -3 before any scan is entered', () => {
    const p = milestoneProgress({ ...defaultState(), dexa: [] }, goal(-2.5));
    expect(p.baseline?.value).toBe(-3);
    expect(p.achieved).toBe(false);
  });

  it('new installs come with Hubby’s two reward tiers', () => {
    const ms = defaultState().milestones;
    expect(ms.map((m) => [m.target, m.reward, m.prize])).toEqual([
      [-2.8, 200, undefined],
      [-2.5, 0, 'Nintendo Switch 2'],
    ]);
  });
});
