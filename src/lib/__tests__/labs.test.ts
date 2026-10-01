import { describe, expect, it } from 'vitest';
import { classifyLab } from '../progress';
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
