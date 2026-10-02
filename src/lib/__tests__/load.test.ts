import { describe, expect, it } from 'vitest';
import { fitToCap, hardMinutes, weeklyReview } from '../load';
import { buildSessions } from '../plan';
import { dailyComplete, dailyKey, dailyRoutine } from '../daily';
import { defaultState } from '../../store';
import type { Session, WorkoutLog } from '../../types';

const state = defaultState();
const [ivy, hoDefault] = state.members;
const hubby = { ...hoDefault, program: null };

describe('time cap', () => {
  it('every generated session fits its phase cap', () => {
    for (const m of [ivy, hubby]) {
      for (const day of [m.startDate, '2027-06-01']) {
        for (const s of buildSessions(m, day)) expect(hardMinutes(s.items)).toBeLessThanOrEqual(day === m.startDate ? 60 : 90);
      }
    }
  });

  it('trims sets until a long session fits, ignoring the walk', () => {
    const big: Session = {
      key: 'A',
      title: 'x',
      focus: 'x',
      items: [
        ...Array.from({ length: 10 }, (_, i) => ({ exerciseId: 'goblet_squat', slot: i, sets: 5, reps: '12 reps', restSec: 180, candidates: [] })),
        { exerciseId: 'brisk_walk', slot: 10, sets: 1, reps: '45 min', restSec: 0, candidates: [] },
      ],
    };
    expect(hardMinutes(big.items)).toBeGreaterThan(60);
    const fitted = fitToCap(big, 60);
    expect(hardMinutes(fitted.items)).toBeLessThanOrEqual(60);
    expect(fitted.items.at(-1)!.reps).toBe('45 min');
  });

  it('lighter week removes one set', () => {
    const normal = buildSessions(hubby, hubby.startDate)[0].items[1].sets;
    const light = buildSessions({ ...hubby, lightenUntil: '2099-01-01' }, hubby.startDate)[0].items[1].sets;
    expect(light).toBe(Math.max(1, normal - 1));
  });
});

function log(date: string, rpe: number, note?: string, minutes?: number): WorkoutLog {
  return { id: date, memberId: hubby.id, date, createdAt: date, sessionKey: 'A', title: 'A', exercises: [], completion: 1, rpe, note, durationMin: minutes, status: 'approved' };
}

describe('weeklyReview', () => {
  const m = { ...hubby, startDate: '2026-09-01' };
  const today = '2026-10-07'; // reviews Sep 28 – Oct 4

  it('flags high effort, pain and over-long sessions', () => {
    const s = { ...state, logs: [log('2026-09-28', 9, 'lower back pain'), log('2026-09-30', 8, undefined, 75)] };
    const r = weeklyReview(s, m, today, 1);
    expect(r.verdict).toBe('too-much');
    expect(r.reasons.join(' ')).toMatch(/pain/);
    expect(r.reasons.join(' ')).toMatch(/75 min/);
  });

  it('says about right for a normal week', () => {
    const s = { ...state, logs: ['2026-09-28', '2026-09-30', '2026-10-02', '2026-10-03'].map((d) => log(d, 7)) };
    expect(weeklyReview(s, m, today, 1).verdict).toBe('about-right');
  });

  it('says too little when sessions were missed', () => {
    const s = { ...state, logs: [log('2026-09-28', 7)] };
    expect(weeklyReview(s, m, today, 1).verdict).toBe('too-little');
  });
});

describe('dailyRoutine', () => {
  it('bone: Straight + Steady + impact; posture only: Straight', () => {
    const pillars = (x: typeof ivy) => new Set(dailyRoutine(x).map((i) => i.pillar));
    expect([...pillars(hubby)].sort()).toEqual(['Steady', 'Straight', 'Strong']);
    expect([...pillars(ivy)]).toEqual(['Straight']);
  });
});

describe('dailyComplete', () => {
  it('counts moves already done in that day’s workout', () => {
    const s = defaultState();
    const [ivy] = s.members;
    const ids = dailyRoutine(ivy).map((i) => i.exerciseId);
    const d = '2026-10-05';
    s.daily[dailyKey(ivy.id, d)] = ids.slice(1);
    expect(dailyComplete(s, ivy, d)).toBe(false);
    s.logs.push({ id: 'l', memberId: ivy.id, date: d, createdAt: d, sessionKey: 'A', title: 'A', completion: 1, status: 'pending', exercises: [{ exerciseId: ids[0], setsPlanned: 2, setsDone: 2 }] });
    expect(dailyComplete(s, ivy, d)).toBe(true);
  });
});
