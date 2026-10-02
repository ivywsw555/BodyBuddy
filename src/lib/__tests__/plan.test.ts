import { describe, expect, it } from 'vitest';
import { buildSessions, currentPhase } from '../plan';
import { EXERCISE_MAP } from '../../data/exercises';
import { defaultState } from '../../store';
import type { Member } from '../../types';

const [ivy, hubby] = defaultState().members;

function ids(m: Member, t = m.startDate) {
  return buildSessions(m, t).flatMap((s) => s.items.map((i) => i.exerciseId));
}

describe('buildSessions', () => {
  it('low bone density: every workout starts with impact, no banned or heavy moves', () => {
    const later = '2027-06-01'; // phase 3
    const sessions = buildSessions(hubby, later);
    for (const s of sessions) {
      expect(s.items[0].exerciseId).toMatch(/heel_drop|pogo_jump|rope_jumping/);
    }
    const all = ids(hubby, later);
    expect(all).not.toContain('cat_cow');
    expect(all).not.toContain('jump_squat');
    expect(all).not.toContain('barbell_deadlift');
    expect(all.every((id) => EXERCISE_MAP[id].tier <= 2)).toBe(true);
  });

  it('doctor clearance unlocks heavy moves in phase 3', () => {
    const cleared = { ...hubby, place: 'gym' as const, level: 'intermediate' as const, cautions: { ...hubby.cautions, cleared: true } };
    const all = ids(cleared, '2027-06-01');
    expect(all).toContain('barbell_squat');
    expect(all).toContain('jump_squat');
  });

  it('home plans only use available equipment', () => {
    const home = { ...ivy, equipment: [] };
    const all = ids(home);
    expect(all.every((id) => EXERCISE_MAP[id].equip.length === 0)).toBe(true);
  });

  it('neck/shoulder aches: every workout has neck, shoulder-blade and cardio work', () => {
    for (const s of buildSessions(ivy, ivy.startDate)) {
      const patterns = s.items.map((i) => EXERCISE_MAP[i.exerciseId].pattern);
      expect(patterns).toContain('neck');
      expect(patterns).toContain('scap');
      expect(patterns).toContain('conditioning');
    }
  });

  it('manual swaps are applied', () => {
    const sessions = buildSessions(ivy, ivy.startDate);
    const item = sessions[0].items.find((i) => i.candidates.length > 1)!;
    const other = item.candidates.find((c) => c !== item.exerciseId)!;
    const swapped = { ...ivy, swaps: { [`A-${item.slot}`]: other } };
    expect(buildSessions(swapped, ivy.startDate)[0].items.find((i) => i.slot === item.slot)!.exerciseId).toBe(other);
  });

  it('phases advance by week', () => {
    const m = { ...ivy, startDate: '2026-01-05' };
    expect(currentPhase(m, '2026-01-20')).toBe(1);
    expect(currentPhase(m, '2026-02-10')).toBe(2);
    expect(currentPhase(m, '2026-04-10')).toBe(3);
  });
});

describe('ROS / Too Fit to Fracture rules', () => {
  it('core is dead bug in A and bird dog in B', () => {
    for (const m of [ivy, hubby]) {
      const [a, b] = buildSessions(m, m.startDate);
      expect(a.items.map((i) => i.exerciseId)).toContain('dead_bug');
      expect(b.items.map((i) => i.exerciseId)).toContain('bird_dog');
    }
  });

  it('phase 1 bone plan starts with sit-to-stand and ~50 heel drops', () => {
    const [a] = buildSessions(hubby, hubby.startDate);
    expect(a.items.map((i) => i.exerciseId)).toContain('chair_squat');
    const impact = a.items[0];
    expect(impact.exerciseId).toBe('heel_drop');
    expect(impact.sets * 10).toBe(50);
  });

  it('phase 3 without clearance uses 3 sets of up to 8, not 5x5', () => {
    const later = '2027-06-01';
    const [a] = buildSessions(hubby, later);
    const squat = a.items.find((i) => EXERCISE_MAP[i.exerciseId].pattern === 'squat')!;
    expect(squat.sets).toBe(3);
    expect(squat.reps).toMatch(/up to 8/);
  });
});
