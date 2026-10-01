import type { AppState, Leave, Pool, Settings, WorkoutLog } from '../types';
import { addDays, daysBetween, mondayOf, monthDays, monthOf, weekday } from './date';

/**
 * 押金池规则（全部由训练记录推算，不单独存账，避免账目不一致）：
 * - 押金池按月建立，一个月包含「周一落在本月」的所有周（周一到周日），
 *   如果押金池在月初几天开始生效，开始日所在的那一周也算进来（从开始日算起）。
 * - 每周必须完成 requiredPerWeek 次有效训练（同一天多次只算 1 次），不可补卡。
 * - 监督人批准的请假日，每天抵扣 1 次要求。
 * - 一周结束（周日过完）后结算：缺 1 次扣 penaltyPerMiss，扣款 100% 归监督人。
 * - 返还方式：weekly = 每周结算后返还当周份额（押金/周数 - 当周罚款）；
 *            monthly = 最后一周结算后一次性返还余额。
 * - 罚款总额不会超过押金。
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
  /** 押金池生效后的第一天（第一周可能不完整） */
  effectiveStart: string;
  required: number;
  done: number;
  pending: number;
  leaves: number;
  settled: boolean;
  missed: number;
  penalty: number;
  refund: number;
  /** 本周结算后押金池余额 */
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
  // 月中（月初几天）开始的押金池：开始日所在、周一落在上个月的那一周也算进来，不让头几天白白空着
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

/** 监督人钱包：所有罚款收入 - 已兑现心愿 */
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
