import type { AppState, Member } from '../types';
import { addDays, mondayOf } from './date';

/**
 * The short routine to do on (almost) every day, outside the main workouts:
 * - Straight (ROS): back extensors, shoulder blades, chin tuck, wall posture; "almost daily".
 * - Steady (ROS / Too Fit to Fracture): balance practice on most days.
 * - Strong impact (ROS): about 50 impacts per leg on most days.
 */
export type Pillar = 'Straight' | 'Steady' | 'Strong';

export interface DailyItem {
  exerciseId: string;
  dose: string;
  pillar: Pillar;
}

export const WEEKLY_WALK_GOAL = 150;

export function dailyRoutine(m: Member): DailyItem[] {
  const bone = m.goals.includes('bone') || m.cautions.spineFragile || m.cautions.hipFragile;
  const straight = bone || m.goals.includes('posture') || m.cautions.neckShoulderPain;
  const items: DailyItem[] = [];
  if (straight) {
    items.push(
      { exerciseId: 'chin_tuck', dose: '10 × 5 s hold', pillar: 'Straight' },
      { exerciseId: 'scap_squeeze', dose: '10 × 5 s hold', pillar: 'Straight' },
      { exerciseId: 'wall_angel', dose: '10 slow reps', pillar: 'Straight' },
      { exerciseId: 'prone_extension', dose: '8 reps, 3 s hold', pillar: 'Straight' },
      { exerciseId: 'wall_stand', dose: '1 min', pillar: 'Straight' },
    );
  }
  if (bone) {
    items.push(
      { exerciseId: 'tandem_stance', dose: '3 × 30 s, swap feet', pillar: 'Steady' },
      { exerciseId: 'single_leg_stand', dose: '3 × 30 s each leg', pillar: 'Steady' },
      { exerciseId: 'heel_toe_walk', dose: '2 × 10 steps', pillar: 'Steady' },
      { exerciseId: 'heel_drop', dose: '50 drops (5 × 10)', pillar: 'Strong' },
    );
  }
  return items;
}

export function dailyKey(memberId: string, date: string): string {
  return `${memberId}|${date}`;
}

/**
 * A day's routine is complete when every move is ticked. On a workout day, moves that were
 * already part of that workout count too (the routine is folded into the workout's warm-up).
 */
export function dailyComplete(state: AppState, m: Member, date: string): boolean {
  const items = dailyRoutine(m);
  if (!items.length) return false;
  const ticked = new Set(state.daily[dailyKey(m.id, date)] ?? []);
  const inWorkout = new Set(
    state.logs.filter((l) => l.memberId === m.id && l.date === date && l.status !== 'rejected').flatMap((l) => l.exercises.map((e) => e.exerciseId)),
  );
  return items.every((i) => ticked.has(i.exerciseId) || inWorkout.has(i.exerciseId));
}

/** Days in a row (ending today, or yesterday if today isn't finished yet) with the whole routine done */
export function dailyStreak(state: AppState, m: Member, todayStr: string): number {
  if (!dailyRoutine(m).length) return 0;
  const complete = (d: string) => dailyComplete(state, m, d);
  let d = complete(todayStr) ? todayStr : addDays(todayStr, -1);
  let n = 0;
  while (complete(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function weekWalkMinutes(state: AppState, memberId: string, todayStr: string): number {
  const mon = mondayOf(todayStr);
  const sun = addDays(mon, 6);
  return state.walks
    .filter((w) => w.memberId === memberId && w.date >= mon && w.date <= sun)
    .reduce((s, w) => s + w.minutes, 0);
}
