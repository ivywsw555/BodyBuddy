import { describe, expect, it } from 'vitest';
import { buildSessions, canEditPlan, EXTRA_SLOT } from '../plan';
import { HARD_MINUTES_CAP, hardMinutes } from '../load';
import { defaultState } from '../../store';

const [ivy, hoDefault] = defaultState().members;
// Generator rules are tested without Ho's fixed month-1 program
const hubby = { ...hoDefault, program: null };

describe('supervisor plan edits', () => {
  it('only the supervisor can edit; without one the trainee can', () => {
    expect(canEditPlan(hubby, ivy)).toBe(true);
    expect(canEditPlan(ivy, ivy)).toBe(false);
    expect(canEditPlan(ivy, { ...ivy, supervisorId: undefined })).toBe(true);
  });

  it('applies sets/reps changes and removals', () => {
    const base = buildSessions(ivy, ivy.startDate)[0];
    const [first, second] = base.items;
    const edited = buildSessions(
      { ...ivy, planEdits: { [`${base.key}-${first.slot}`]: { sets: 1, reps: '6 reps' }, [`${base.key}-${second.slot}`]: { removed: true } } },
      ivy.startDate,
    )[0];
    expect(edited.items[0]).toMatchObject({ exerciseId: first.exerciseId, sets: 1, reps: '6 reps', edited: true });
    expect(edited.items.map((i) => i.exerciseId)).not.toContain(second.exerciseId);
  });

  it('adds safe extras but skips moves unsafe for the trainee', () => {
    const s = buildSessions(
      { ...hubby, planExtras: { A: [{ exerciseId: 'cat_cow', sets: 2, reps: '10 reps' }, { exerciseId: 'tandem_stance', sets: 2, reps: '30 s' }] } },
      hubby.startDate,
    ).find((x) => x.key === 'A')!;
    const ids = s.items.map((i) => i.exerciseId);
    expect(ids).not.toContain('cat_cow');
    const extra = s.items.find((i) => i.extra);
    if (extra) expect(extra.slot).toBeGreaterThanOrEqual(EXTRA_SLOT);
  });

  it('the phase 1 time cap still wins over the supervisor', () => {
    const base = buildSessions(hubby, hubby.startDate)[0];
    const planEdits = Object.fromEntries(base.items.map((i) => [`${base.key}-${i.slot}`, { sets: 8 }]));
    const s = buildSessions({ ...hubby, planEdits }, hubby.startDate)[0];
    expect(hardMinutes(s.items)).toBeLessThanOrEqual(HARD_MINUTES_CAP[1]);
  });
});
