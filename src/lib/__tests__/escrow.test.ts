import { describe, expect, it } from 'vitest';
import { computePool, supervisorWallet } from '../escrow';
import { defaultState } from '../../store';
import type { AppState, Pool, WorkoutLog } from '../../types';

// October 2026: Mondays are the 5th, 12th, 19th and 26th, so 4 weeks (the last ends Nov 1)
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
  it('a pool starting early in the month includes the partial week of its start date', () => {
    const r = computePool({ ...pool, startDate: '2026-10-01' }, state([]), '2026-10-01');
    expect(r.weeks.map((w) => w.start)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(r.weeks[0].effectiveStart).toBe('2026-10-01');
    expect(r.weeks[0].required).toBe(3);
  });

  it('starting on the first Monday gives exactly 4 weeks', () => {
    const r = computePool(pool, state([]), '2026-10-01');
    expect(r.weeks.map((w) => w.start)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(r.weeks.every((w) => !w.settled)).toBe(true);
    expect(r.balance).toBe(400);
  });

  it('each miss is penalised and the rest of the weekly share is refunded', () => {
    const s = state([log('2026-10-05'), log('2026-10-07')]); // only 2 sessions in week 1
    const r = computePool(pool, s, '2026-10-12');
    const w1 = r.weeks[0];
    expect(w1.settled).toBe(true);
    expect(w1.missed).toBe(1);
    expect(w1.penalty).toBe(20);
    expect(w1.refund).toBe(80); // 400/4 - 20
    expect(r.balance).toBe(300);
  });

  it('two workouts on one day count once; pending and incomplete ones do not count', () => {
    const s = state([log('2026-10-05'), log('2026-10-05'), log('2026-10-06', 'pending'), log('2026-10-07', 'approved', 0.5)]);
    const r = computePool(pool, s, '2026-10-12');
    expect(r.weeks[0].done).toBe(1);
    expect(r.weeks[0].pending).toBe(1);
    expect(r.weeks[0].penalty).toBe(40);
  });

  it('pending check-ins count when approval is not required', () => {
    const s = state([log('2026-10-05', 'pending'), log('2026-10-06', 'pending'), log('2026-10-07', 'pending')]);
    s.settings.requireApproval = false;
    expect(computePool(pool, s, '2026-10-12').weeks[0].penalty).toBe(0);
  });

  it('approved leave lowers that week’s requirement', () => {
    const s = state([log('2026-10-05'), log('2026-10-07')], {
      leaves: [{ id: 'l', memberId: 'm_hubby', date: '2026-10-09', reason: 'fever', status: 'approved' }],
    });
    const r = computePool(pool, s, '2026-10-12');
    expect(r.weeks[0].required).toBe(2);
    expect(r.weeks[0].penalty).toBe(0);
  });

  it('after the month settles, penalties + refunds = deposit', () => {
    const r = computePool(pool, state([]), '2026-11-02');
    expect(r.closed).toBe(true);
    expect(r.totalPenalty).toBe(240); // 4 weeks × 3 misses × 20
    expect(r.totalPenalty + r.totalRefund).toBe(400);
    expect(r.balance).toBe(0);
  });

  it('penalties never exceed the deposit', () => {
    const big = { ...pool, penaltyPerMiss: 100, refundMode: 'monthly' as const };
    const r = computePool(big, state([]), '2026-11-02');
    expect(r.totalPenalty).toBe(400);
    expect(r.totalRefund).toBe(0);
  });

  it('monthly refund mode only refunds after the last week', () => {
    const monthly = { ...pool, refundMode: 'monthly' as const };
    const r1 = computePool(monthly, state([]), '2026-10-13');
    expect(r1.totalRefund).toBe(0);
    expect(r1.balance).toBe(340);
  });

  it('mid-month pool: first week requirement is capped by days left', () => {
    const mid = { ...pool, startDate: '2026-10-24' }; // starts on a Saturday, so week 3 has only 2 days left
    const r = computePool(mid, state([]), '2026-10-26');
    expect(r.weeks[0].start).toBe('2026-10-19');
    expect(r.weeks[0].required).toBe(2);
  });

  it('penalties go into the supervisor wallet', () => {
    const s = state([]);
    s.wishes = [{ id: 'w', ownerId: 'm_ivy', title: 'Hotpot', price: 100, redeemedAt: '2026-11-03' }];
    const w = supervisorWallet(s, 'm_ivy', '2026-11-02');
    expect(w.earned).toBe(240);
    expect(w.available).toBe(140);
  });
});
