import { EXERCISE_MAP } from '../data/exercises';
import type { AppState, Member, Phase, PlannedExercise, Session } from '../types';
import { addDays, mondayOf } from './date';
import { countsAsDone } from './escrow';

/**
 * Training-load guardrails:
 * - In phase 1 a workout's hard training (everything except walking/cardio) is capped at 60 minutes,
 *   both in the plan (sets are trimmed to fit) and live (the workout stops at 60 minutes).
 * - Every week the app reviews the previous week and says whether it was too much.
 */
export const HARD_MINUTES_CAP: Record<Phase, number> = { 1: 60, 2: 75, 3: 90 };

const SEC_PER_REP = 3;
const SETUP_SEC = 45;

/** Seconds of work in one set, read from the dose text ("10-12 reps each side", "30 s", "30 m", "10 steps") */
function workSeconds(item: PlannedExercise): number {
  const nums = item.reps.match(/\d+/g)?.map(Number) ?? [10];
  const top = Math.max(...nums.slice(0, 2));
  const sides = /each side|each leg/.test(item.reps) ? 2 : 1;
  if (/\bmin\b/.test(item.reps)) return top * 60;
  if (/\bs\b/.test(item.reps)) return top * sides * (/4 directions/.test(item.reps) ? 4 : 1);
  if (/\bm\b/.test(item.reps)) return top;
  if (/per letter/.test(item.reps)) return top * 3 * SEC_PER_REP;
  return top * SEC_PER_REP * sides;
}

export function isCardio(item: PlannedExercise): boolean {
  return EXERCISE_MAP[item.exerciseId]?.pattern === 'conditioning';
}

/** Estimated minutes of hard training (walking/cardio excluded) */
export function hardMinutes(items: PlannedExercise[]): number {
  const sec = items
    .filter((i) => !isCardio(i))
    .reduce((s, i) => s + SETUP_SEC + i.sets * workSeconds(i) + Math.max(0, i.sets - 1) * i.restSec, 0);
  return Math.round(sec / 60);
}

/** Trim sets (biggest first, never below 1) until the session fits under the cap */
export function fitToCap(session: Session, cap: number): Session {
  const items = session.items.map((i) => ({ ...i }));
  while (hardMinutes(items) > cap) {
    const candidates = items.filter((i) => !isCardio(i) && i.sets > 1);
    if (!candidates.length) break;
    const biggest = candidates.reduce((a, b) => (b.sets * (workSeconds(b) + b.restSec) > a.sets * (workSeconds(a) + a.restSec) ? b : a));
    biggest.sets -= 1;
  }
  return { ...session, items };
}

export type Verdict = 'too-much' | 'about-right' | 'too-little' | 'no-data';

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  sessions: number;
  required: number;
  avgRpe?: number;
  maxRpe?: number;
  longestMin?: number;
  painNotes: string[];
  verdict: Verdict;
  reasons: string[];
  advice: string;
}

const PAIN = /pain|hurt|injur|sharp|swell|dizz|疼|痛|伤/i;

/** Review the last finished week (Mon–Sun) for one person */
export function weeklyReview(state: AppState, m: Member, todayStr: string, phase: Phase): WeeklyReview {
  const weekStart = addDays(mondayOf(todayStr), -7);
  const weekEnd = addDays(weekStart, 6);
  const logs = state.logs.filter((l) => l.memberId === m.id && l.date >= weekStart && l.date <= weekEnd && l.status !== 'rejected');
  const pool = state.pools.find((p) => p.traineeId === m.id && p.month === weekStart.slice(0, 7));
  const required = pool?.requiredPerWeek ?? m.trainingDays.length;
  const sessions = new Set(logs.filter((l) => countsAsDone({ ...l, status: 'approved' }, state.settings)).map((l) => l.date)).size;
  const rpes = logs.map((l) => l.rpe).filter((r): r is number => typeof r === 'number');
  const avgRpe = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : undefined;
  const maxRpe = rpes.length ? Math.max(...rpes) : undefined;
  const durations = logs.map((l) => l.tracker?.minutes ?? l.durationMin).filter((d): d is number => typeof d === 'number');
  const longestMin = durations.length ? Math.max(...durations) : undefined;
  const painNotes = logs.map((l) => l.note ?? '').filter((n) => PAIN.test(n));
  const cap = HARD_MINUTES_CAP[phase];

  const tooMuch: string[] = [];
  if (avgRpe !== undefined && avgRpe >= 8.5) tooMuch.push(`average effort was ${avgRpe}/10`);
  if (maxRpe !== undefined && maxRpe >= (phase === 1 ? 9 : 10)) tooMuch.push(`one session hit ${maxRpe}/10 effort`);
  if (longestMin !== undefined && longestMin > cap) tooMuch.push(`a session lasted ${longestMin} min (limit ${cap})`);
  if (painNotes.length) tooMuch.push(`notes mention pain: “${painNotes[0].slice(0, 60)}”`);
  if (sessions > required + 2) tooMuch.push(`${sessions} sessions, well above the ${required} planned`);

  const tooLittle: string[] = [];
  if (sessions < required) tooLittle.push(`${sessions} of ${required} sessions done`);
  if (avgRpe !== undefined && avgRpe <= 4) tooLittle.push(`average effort was only ${avgRpe}/10`);

  let verdict: Verdict;
  let advice: string;
  if (!logs.length) {
    verdict = 'no-data';
    advice = 'No workouts last week. Start gently this week; don’t try to make up for missed sessions.';
  } else if (tooMuch.length) {
    verdict = 'too-much';
    advice = 'Take a lighter week: one set fewer on every exercise and stop well before exhaustion. If pain persists, check with a doctor or physio.';
  } else if (tooLittle.length) {
    verdict = 'too-little';
    advice = avgRpe !== undefined && avgRpe <= 4 ? 'It felt easy: add a little weight or a few reps this week.' : 'Aim to hit every planned session this week; shorter is fine.';
  } else {
    verdict = 'about-right';
    advice = 'Good load. Keep the plan as it is and add a little weight only when the last reps feel easy.';
  }
  return { weekStart, weekEnd, sessions, required, avgRpe, maxRpe, longestMin, painNotes, verdict, reasons: verdict === 'too-much' ? tooMuch : tooLittle, advice };
}
