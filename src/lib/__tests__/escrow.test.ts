import { describe, expect, it } from 'vitest';
import { computePool, supervisorWallet } from '../escrow';
import { defaultState } from '../../store';
import type { AppState, Pool, WorkoutLog } from '../../types';

// 2026 年 10 月：周一分别是 5、12、19、26 号，共 4 周（最后一周到 11/1）
const pool: Pool = {
  id: 'p1',
  traineeId: 'm_hubby',
  supervisorId: 'm_ivy',
  month: '2026-10',
  deposit: 400,
  penaltyPerMiss: 20,
  requiredPerWeek: 3,
  refundMode: 'weekly',
  startDate: '2026-10-05',
  createdAt: '2026-10-01T00:00:00Z',
};

function log(date: string, status: WorkoutLog['status'] = 'approved', completion = 1): WorkoutLog {
  return {
    id: date + status + completion,
    memberId: 'm_hubby',
    date,
    createdAt: `${date}T10:00:00Z`,
    sessionKey: 'A',
    title: 'A',
    exercises: [],
    completion,
    status,
  };
}

function state(logs: WorkoutLog[], extra: Partial<AppState> = {}): AppState {
  return { ...defaultState(), logs, pools: [pool], ...extra };
}

describe('computePool', () => {
  it('月初开始时把开始日所在的那一周也算进来，从生效日开始计', () => {
    const r = computePool({ ...pool, startDate: '2026-10-01' }, state([]), '2026-10-01');
    expect(r.weeks.map((w) => w.start)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(r.weeks[0].effectiveStart).toBe('2026-10-01');
    expect(r.weeks[0].required).toBe(3);
  });

  it('从第一个周一开始时正好 4 周', () => {
    const r = computePool(pool, state([]), '2026-10-01');
    expect(r.weeks.map((w) => w.start)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(r.weeks.every((w) => !w.settled)).toBe(true);
    expect(r.balance).toBe(400);
  });

  it('缺练按次扣款，每周返还剩余份额', () => {
    const s = state([log('2026-10-05'), log('2026-10-07')]); // 第一周只练 2 次
    const r = computePool(pool, s, '2026-10-12');
    const w1 = r.weeks[0];
    expect(w1.settled).toBe(true);
    expect(w1.missed).toBe(1);
    expect(w1.penalty).toBe(20);
    expect(w1.refund).toBe(80); // 400/4 - 20
    expect(r.balance).toBe(300);
  });

  it('同一天练两次只算一次；待确认和完成度不足的不算', () => {
    const s = state([log('2026-10-05'), log('2026-10-05'), log('2026-10-06', 'pending'), log('2026-10-07', 'approved', 0.5)]);
    const r = computePool(pool, s, '2026-10-12');
    expect(r.weeks[0].done).toBe(1);
    expect(r.weeks[0].pending).toBe(1);
    expect(r.weeks[0].penalty).toBe(40);
  });

  it('不需要确认时待确认的也算', () => {
    const s = state([log('2026-10-05', 'pending'), log('2026-10-06', 'pending'), log('2026-10-07', 'pending')]);
    s.settings.requireApproval = false;
    expect(computePool(pool, s, '2026-10-12').weeks[0].penalty).toBe(0);
  });

  it('批准的请假减少当周要求', () => {
    const s = state([log('2026-10-05'), log('2026-10-07')], {
      leaves: [{ id: 'l', memberId: 'm_hubby', date: '2026-10-09', reason: '发烧', status: 'approved' }],
    });
    const r = computePool(pool, s, '2026-10-12');
    expect(r.weeks[0].required).toBe(2);
    expect(r.weeks[0].penalty).toBe(0);
  });

  it('月末全部结算：罚款 + 返还 = 押金', () => {
    const r = computePool(pool, state([]), '2026-11-02');
    expect(r.closed).toBe(true);
    expect(r.totalPenalty).toBe(240); // 4 周 × 3 次 × 20
    expect(r.totalPenalty + r.totalRefund).toBe(400);
    expect(r.balance).toBe(0);
  });

  it('罚款不会超过押金', () => {
    const big = { ...pool, penaltyPerMiss: 100, refundMode: 'monthly' as const };
    const r = computePool(big, state([]), '2026-11-02');
    expect(r.totalPenalty).toBe(400);
    expect(r.totalRefund).toBe(0);
  });

  it('月末返还模式只在最后一周返还', () => {
    const monthly = { ...pool, refundMode: 'monthly' as const };
    const r1 = computePool(monthly, state([]), '2026-10-13');
    expect(r1.totalRefund).toBe(0);
    expect(r1.balance).toBe(340);
  });

  it('月中开池：第一周按剩余天数计算要求', () => {
    const mid = { ...pool, startDate: '2026-10-24' }; // 周六开始，第 3 周只剩 2 天
    const r = computePool(mid, state([]), '2026-10-26');
    expect(r.weeks[0].start).toBe('2026-10-19');
    expect(r.weeks[0].required).toBe(2);
  });

  it('罚款进入监督人钱包', () => {
    const s = state([]);
    s.wishes = [{ id: 'w', ownerId: 'm_ivy', title: '火锅', price: 100, redeemedAt: '2026-11-03' }];
    const w = supervisorWallet(s, 'm_ivy', '2026-11-02');
    expect(w.earned).toBe(240);
    expect(w.available).toBe(140);
  });
});
