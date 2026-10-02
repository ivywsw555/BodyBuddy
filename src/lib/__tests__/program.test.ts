import { describe, expect, it } from 'vitest';
import { activeProgram, buildSessions } from '../plan';
import { dailyRoutine } from '../daily';
import { addDays } from '../date';
import { defaultState } from '../../store';

const ho = defaultState().members[1];
const start = ho.startDate;

describe('Ho’s month-1 program', () => {
  it('replaces the generated plan with Day 1/2/3 for 4 weeks', () => {
    const s = buildSessions(ho, start);
    expect(s.map((x) => x.key)).toEqual(['1', '2', '3']);
    expect(s[0].items.map((i) => i.exerciseId)).toEqual(['bird_dog', 'bench_squat', 'glute_bridge', 'clamshell']);
    expect(s[1].items.map((i) => [i.exerciseId, i.sets, i.reps])).toEqual([
      ['chest_supported_row', 3, '10-12 reps'],
      ['db_bench_press', 3, '10-12 reps'],
      ['prone_w_raise', 2, '12 reps'],
    ]);
    expect(dailyRoutine(ho, start).map((d) => d.exerciseId)).toEqual(['door_pec_stretch', 'wall_angel', 'dead_bug', 'heel_drop']);
  });

  it('ends after 28 days and the generated plan takes over', () => {
    expect(activeProgram(ho, addDays(start, 27))).toBeDefined();
    expect(activeProgram(ho, addDays(start, 28))).toBeUndefined();
    expect(buildSessions(ho, addDays(start, 28)).map((x) => x.key)).toEqual(['A', 'B']);
  });

  it('supervisor edits and the lighter week still apply', () => {
    const edited = buildSessions({ ...ho, planEdits: { '1-1': { sets: 2 } }, lightenUntil: addDays(start, 6) }, start)[0];
    expect(edited.items[1].sets).toBe(1);
  });
});
