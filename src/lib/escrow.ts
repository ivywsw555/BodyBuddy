import type { AppState, Leave, Pool, Settings, WorkoutLog } from '../types';
import { addDays, daysBetween, mondayOf, monthDays, monthOf, weekday } from './date';

/**
 * Deposit pool rules (everything is derived from workout logs, so the books can't drift):
 * - One pool per month. A month covers every Monday-to-Sunday week whose Monday falls in it.
 *   If the pool starts in the first days of a month, the week containing the start date counts too (from the start date).
 * - Each week needs requiredPerWeek valid workouts (several on one day count once). No backfilling.
 * - Each supervisor-approved leave day lowers that week's requirement by 1.
 * - When a week ends (after Sunday), each missed workout costs penaltyPerMiss, and 100% of it goes to the supervisor.
 * - Refunds: weekly = after each week, refund that week's share (deposit / weeks - penalty);
 *            monthly = refund the remaining balance once the last week is settled.
 * - Total penalties never exceed the deposit.
 */

export function countsAsDone(log: WorkoutLog, settings: Settings): boolean {
  if (log.completion < settings.minCompletion) return false;
  if (log.status === 'approved') return true;
  return log.status === 'pending' && !settings.requireApproval;
}

export function doneDates(logs: WorkoutLog[], memberId: string, settings: Settings): Set<string> {
  return new Set(
    logs.filter((l) => l.memberId === memberId && countsAsDone(l, settings)).map((l) => l.date),
  );
}

export function pendingDates(logs: WorkoutLog[], memberId: string, settings: Settings): Set<string> {
  const done = doneDates(logs, memberId, settings);
  return new Set(
    logs
      .filter(
        (l) =>
          l.memberId === memberId &&
          l.status === 'pending' &&
          l.completion >= settings.minCompletion &&
          !done.has(l.date),
      )
      .map((l) => l.date),
  );
}

export function leaveDates(leaves: Leave[], memberId: string): Set<string> {
  return new Set(
    leaves.filter((l) => l.memberId === memberId && l.status === 'approved').map((l) => l.date),
  );
}

export interface WeekResult {
  start: string;
  end: string;
  /** First day the pool applies to in this week (the first week may be partial) */
  effectiveStart: string;
  required: number;
  done: number;
  pending: number;
  leaves: number;
  settled: boolean;
  missed: number;
  penalty: number;
  refund: number;
  /** Pool balance after this week is settled */
  balanceAfter: number;
}

export interface PoolResult {
  pool: Pool;
  weeks: WeekResult[];
  totalPenalty: number;
  totalRefund: number;
  balance: number;
  closed: boolean;
}

export function poolWeeks(pool: Pool): { start: string; end: string; effectiveStart: string }[] {
  const mondays = monthDays(pool.month).filter((d) => weekday(d) === 1);
  // A pool starting in the first days of the month also covers the week its start date falls in
  const lead = mondayOf(pool.startDate);
  if (monthOf(pool.startDate) === pool.month && lead < `${pool.month}-01`) mondays.unshift(lead);
  return mondays
    .map((start) => ({ start, end: addDays(start, 6) }))
    .filter((w) => w.end >= pool.startDate)
    .map((w) => ({ ...w, effectiveStart: w.start > pool.startDate ? w.start : pool.startDate }));
}

function countIn(dates: Set<string>, from: string, to: string): number {
  let n = 0;
  for (const d of dates) if (d >= from && d <= to) n++;
  return n;
}

export function computePool(
  pool: Pool,
  state: Pick<AppState, 'logs' | 'leaves' | 'settings'>,
  todayStr: string,
): PoolResult {
  const done = doneDates(state.logs, pool.traineeId, state.settings);
  const pending = pendingDates(state.logs, pool.traineeId, state.settings);
  const leave = leaveDates(state.leaves, pool.traineeId);
  const raw = poolWeeks(pool);
  const portion = raw.length ? pool.deposit / raw.length : 0;

  let balance = pool.deposit;
  let totalPenalty = 0;
  let totalRefund = 0;
  const weeks: WeekResult[] = raw.map((w, i) => {
    const available = daysBetween(w.effectiveStart, w.end) + 1;
    const leaves = countIn(leave, w.effectiveStart, w.end);
    const required = Math.max(0, Math.min(pool.requiredPerWeek, available) - leaves);
    const doneN = countIn(done, w.effectiveStart, w.end);
    const settled = todayStr > w.end;
    const missed = settled ? Math.max(0, required - doneN) : 0;
    const penalty = round2(Math.min(missed * pool.penaltyPerMiss, balance));
    balance = round2(balance - penalty);
    let refund = 0;
    if (settled) {
      const isLast = i === raw.length - 1;
      if (isLast) refund = balance;
      else if (pool.refundMode === 'weekly') refund = round2(Math.min(Math.max(portion - penalty, 0), balance));
      balance = round2(balance - refund);
    }
    totalPenalty = round2(totalPenalty + penalty);
    totalRefund = round2(totalRefund + refund);
    return {
      ...w,
      required,
      done: doneN,
      pending: countIn(pending, w.effectiveStart, w.end),
      leaves,
      settled,
      missed,
      penalty,
      refund,
      balanceAfter: balance,
    };
  });

  return {
    pool,
    weeks,
    totalPenalty,
    totalRefund,
    balance,
    closed: weeks.length > 0 && weeks.every((w) => w.settled),
  };
}

/** Supervisor wallet: all penalties earned minus redeemed wishes */
export function supervisorWallet(state: AppState, supervisorId: string, todayStr: string) {
  const earned = round2(
    state.pools
      .filter((p) => p.supervisorId === supervisorId)
      .reduce((s, p) => s + computePool(p, state, todayStr).totalPenalty, 0),
  );
  const spent = round2(
    state.wishes
      .filter((w) => w.ownerId === supervisorId && w.redeemedAt)
      .reduce((s, w) => s + w.price, 0),
  );
  return { earned, spent, available: round2(earned - spent) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
