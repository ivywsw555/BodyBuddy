import { useState } from 'react';
import type { Pool, RefundMode } from '../types';
import { computePool, supervisorWallet } from '../lib/escrow';
import { addMonths, fmtDate, fmtMonth, monthDays, monthOf, today, uid, weekday } from '../lib/date';
import { isSupervisor, isTrainee, memberName, useStore } from '../store';

export function PoolPage() {
  const { state } = useStore();
  const [month, setMonth] = useState(monthOf(today()));
  const t = today();
  const pools = state.pools.filter((p) => p.month === month);
  const trainees = state.members.filter(isTrainee);
  const missing = trainees.filter((m) => !pools.some((p) => p.traineeId === m.id));

  return (
    <div className="page">
      <h1 className="page-title">💰 Deposit pool</h1>
      <div className="card small">
        <b>How it works: </b>pay a deposit at the start of the month → hit the required sessions every week → each miss costs a fixed amount
        (no make-ups) → 100% of penalties go to the supervisor → the rest is refunded weekly or at month end. The app only keeps the books;
        you move the money yourselves.
      </div>
      <div className="row-between month-nav">
        <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))}>‹ Prev</button>
        <b>{fmtMonth(month)}</b>
        <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, 1))}>Next ›</button>
      </div>
      {pools.map((p) => (
        <PoolCard key={p.id} pool={p} todayStr={t} />
      ))}
      {missing.map((m) => (
        <NewPool key={m.id} traineeId={m.id} month={month} />
      ))}
      {state.members.filter(isSupervisor).map((m) => (
        <Wallet key={m.id} supervisorId={m.id} />
      ))}
    </div>
  );
}

function PoolCard({ pool, todayStr }: { pool: Pool; todayStr: string }) {
  const { state, update } = useStore();
  const r = computePool(pool, state, todayStr);
  const c = state.settings.currency;
  const started = todayStr >= pool.startDate;
  return (
    <div className="card">
      <div className="row-between">
        <h3 className="m0">{memberName(state, pool.traineeId)}’s deposit</h3>
        <span className={`pill ${r.closed ? 'pill-ok' : ''}`}>{r.closed ? 'Settled' : 'In progress'}</span>
      </div>
      <div className="stats">
        <Stat label="Deposit" value={`${c}${pool.deposit}`} />
        <Stat label="Penalties (to supervisor)" value={`${c}${r.totalPenalty}`} tone="bad" />
        <Stat label="Refunded" value={`${c}${r.totalRefund}`} tone="ok" />
        <Stat label="Still in pool" value={`${c}${r.balance}`} />
      </div>
      <p className="muted small">
        Supervisor {memberName(state, pool.supervisorId)} · {pool.requiredPerWeek}× a week · {c}
        {pool.penaltyPerMiss} per miss · {pool.refundMode === 'weekly' ? 'weekly refund' : 'refund at month end'} · starts {fmtDate(pool.startDate)}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Week</th>
            <th>Done/needed</th>
            <th>Penalty</th>
            <th>Refund</th>
          </tr>
        </thead>
        <tbody>
          {r.weeks.map((w) => (
            <tr key={w.start} className={w.settled ? '' : 'muted'}>
              <td>
                {w.effectiveStart.slice(5).replace('-', '/')}–{w.end.slice(5).replace('-', '/')}
                {w.leaves ? <span className="small"> (off {w.leaves})</span> : null}
              </td>
              <td>
                {w.done}/{w.required}
                {w.pending ? <span className="small"> +{w.pending}⏳</span> : null}
              </td>
              <td className={w.penalty ? 'bad' : ''}>{w.settled ? (w.penalty ? `-${c}${w.penalty}` : '0') : 'open'}</td>
              <td className={w.refund ? 'ok' : ''}>{w.settled ? (w.refund ? `${c}${w.refund}` : '—') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Each week settles automatically after Sunday midnight. Pending check-ins (⏳) only count once the supervisor approves them.</p>
      {!started && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (confirm('Delete this deposit pool?')) update((s) => void (s.pools = s.pools.filter((p) => p.id !== pool.id)));
          }}
        >
          Delete (only before it starts)
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="stat">
      <div className={`stat-v ${tone ?? ''}`}>{value}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}

function NewPool({ traineeId, month }: { traineeId: string; month: string }) {
  const { state, update } = useStore();
  const trainee = state.members.find((m) => m.id === traineeId)!;
  const supervisors = state.members.filter((m) => isSupervisor(m) && m.id !== traineeId);
  const [deposit, setDeposit] = useState(500);
  const [penalty, setPenalty] = useState(20);
  const [required, setRequired] = useState(Math.max(1, trainee.trainingDays.length || 3));
  const [mode, setMode] = useState<RefundMode>('weekly');
  const [supervisorId, setSupervisorId] = useState(trainee.supervisorId ?? supervisors[0]?.id ?? '');
  const t = today();
  const isPast = month < monthOf(t);
  // if last month had a pool, start at this month's first Monday so no week is counted twice
  const hasPrev = state.pools.some((p) => p.traineeId === traineeId && p.month === addMonths(month, -1));
  const firstMonday = monthDays(month).find((d) => weekday(d) === 1)!;
  const base = hasPrev ? firstMonday : `${month}-01`;
  const startDate = month === monthOf(t) && t > base ? t : base;
  const c = state.settings.currency;
  if (isPast || !supervisors.length) return null;

  return (
    <div className="card card-dashed">
      <h3 className="m0">Start {memberName(state, traineeId)}’s {fmtMonth(month)} pool</h3>
      <div className="form grid2">
        <label>
          Deposit ({c})
          <input type="number" min={0} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} />
        </label>
        <label>
          Penalty per miss ({c})
          <input type="number" min={0} value={penalty} onChange={(e) => setPenalty(Number(e.target.value))} />
        </label>
        <label>
          Required sessions / week
          <input type="number" min={1} max={7} value={required} onChange={(e) => setRequired(Number(e.target.value))} />
        </label>
        <label>
          Refund
          <select value={mode} onChange={(e) => setMode(e.target.value as RefundMode)}>
            <option value="weekly">Every week</option>
            <option value="monthly">At month end</option>
          </select>
        </label>
        <label>
          Supervisor (gets the penalties)
          <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
            {supervisors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.avatar} {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">Starts {fmtDate(startDate)}. Pick an amount that stings but doesn’t hurt, e.g. 300–500.</p>
      <button
        className="btn btn-primary btn-block"
        disabled={deposit <= 0 || !supervisorId}
        onClick={() =>
          update((s) => {
            s.pools.push({
              id: uid(),
              traineeId,
              supervisorId,
              month,
              deposit,
              penaltyPerMiss: penalty,
              requiredPerWeek: required,
              refundMode: mode,
              startDate,
              createdAt: new Date().toISOString(),
            });
          })
        }
      >
        Deposit paid: {c}
        {deposit}
      </button>
    </div>
  );
}

function Wallet({ supervisorId }: { supervisorId: string }) {
  const { state, update } = useStore();
  const w = supervisorWallet(state, supervisorId, today());
  const c = state.settings.currency;
  const wishes = state.wishes.filter((x) => x.ownerId === supervisorId);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState(0);
  if (!state.pools.some((p) => p.supervisorId === supervisorId) && !wishes.length) return null;
  return (
    <div className="card card-super">
      <h3 className="m0">🧧 {memberName(state, supervisorId)}’s wallet</h3>
      <div className="stats">
        <Stat label="Earned" value={`${c}${w.earned}`} />
        <Stat label="Spent" value={`${c}${w.spent}`} />
        <Stat label="Available" value={`${c}${w.available}`} tone="ok" />
      </div>
      <p className="muted small">Skipping a workout means paying your supervisor. Spend it on the wishlist below, or on picking where to eat this weekend.</p>
      <h4>Wishlist</h4>
      {wishes.map((x) => (
        <div key={x.id} className="row-between wish">
          <span className={x.redeemedAt ? 'muted strike' : ''}>
            {x.title} · {c}
            {x.price}
          </span>
          {x.redeemedAt ? (
            <span className="small muted">Redeemed {x.redeemedAt.slice(5)}</span>
          ) : (
            <span className="row">
              <button
                className="btn btn-primary btn-sm"
                disabled={w.available < x.price}
                onClick={() => update((s) => void (s.wishes.find((y) => y.id === x.id)!.redeemedAt = today()))}
              >
                Redeem
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => update((s) => void (s.wishes = s.wishes.filter((y) => y.id !== x.id)))}>
                ✕
              </button>
            </span>
          )}
        </div>
      ))}
      <div className="row">
        <input placeholder="Something you want" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="number" className="w80" placeholder="Price" value={price || ''} onChange={(e) => setPrice(Number(e.target.value))} />
        <button
          className="btn btn-sm"
          disabled={!title.trim() || price <= 0}
          onClick={() => {
            update((s) => void s.wishes.push({ id: uid(), ownerId: supervisorId, title: title.trim(), price }));
            setTitle('');
            setPrice(0);
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
