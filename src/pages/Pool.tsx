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
      <h1 className="page-title">💰 押金池</h1>
      <div className="card small">
        <b>规则：</b>月初预交押金 → 每周必须完成规定次数 → 缺 1 次扣固定金额（不可补卡）→ 扣款 100% 归监督人支配 → 剩余押金按设置每周或月末返还。
        这里只记账，实际转账请你们自己完成。
      </div>
      <div className="row-between month-nav">
        <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))}>‹ 上月</button>
        <b>{fmtMonth(month)}</b>
        <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, 1))}>下月 ›</button>
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
        <h3 className="m0">{memberName(state, pool.traineeId)} 的押金</h3>
        <span className={`pill ${r.closed ? 'pill-ok' : ''}`}>{r.closed ? '本月已结清' : '进行中'}</span>
      </div>
      <div className="stats">
        <Stat label="押金" value={`${c}${pool.deposit}`} />
        <Stat label="已扣（给监督人）" value={`${c}${r.totalPenalty}`} tone="bad" />
        <Stat label="已返还" value={`${c}${r.totalRefund}`} tone="ok" />
        <Stat label="池内余额" value={`${c}${r.balance}`} />
      </div>
      <p className="muted small">
        监督人 {memberName(state, pool.supervisorId)} · 每周 {pool.requiredPerWeek} 次 · 缺 1 次扣 {c}
        {pool.penaltyPerMiss} · {pool.refundMode === 'weekly' ? '每周返还' : '月末一次返还'} · {fmtDate(pool.startDate)} 生效
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>周</th>
            <th>完成/要求</th>
            <th>扣款</th>
            <th>返还</th>
          </tr>
        </thead>
        <tbody>
          {r.weeks.map((w) => (
            <tr key={w.start} className={w.settled ? '' : 'muted'}>
              <td>
                {w.effectiveStart.slice(5).replace('-', '/')}–{w.end.slice(5).replace('-', '/')}
                {w.leaves ? <span className="small"> (假{w.leaves})</span> : null}
              </td>
              <td>
                {w.done}/{w.required}
                {w.pending ? <span className="small"> +{w.pending}⏳</span> : null}
              </td>
              <td className={w.penalty ? 'bad' : ''}>{w.settled ? (w.penalty ? `-${c}${w.penalty}` : '0') : '未结算'}</td>
              <td className={w.refund ? 'ok' : ''}>{w.settled ? (w.refund ? `${c}${w.refund}` : '—') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">每周日 24 点后自动结算。待确认（⏳）的打卡需要监督人确认后才算数。</p>
      {!started && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (confirm('删除这个押金池？')) update((s) => void (s.pools = s.pools.filter((p) => p.id !== pool.id)));
          }}
        >
          删除（生效前可删）
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
  // 上个月有押金池时从本月第一个周一开始，避免同一周被两个月重复计算
  const hasPrev = state.pools.some((p) => p.traineeId === traineeId && p.month === addMonths(month, -1));
  const firstMonday = monthDays(month).find((d) => weekday(d) === 1)!;
  const base = hasPrev ? firstMonday : `${month}-01`;
  const startDate = month === monthOf(t) && t > base ? t : base;
  const c = state.settings.currency;
  if (isPast || !supervisors.length) return null;

  return (
    <div className="card card-dashed">
      <h3 className="m0">为 {memberName(state, traineeId)} 开 {fmtMonth(month)} 押金池</h3>
      <div className="form grid2">
        <label>
          押金（{c}）
          <input type="number" min={0} value={deposit} onChange={(e) => setDeposit(Number(e.target.value))} />
        </label>
        <label>
          缺 1 次扣（{c}）
          <input type="number" min={0} value={penalty} onChange={(e) => setPenalty(Number(e.target.value))} />
        </label>
        <label>
          每周必练次数
          <input type="number" min={1} max={7} value={required} onChange={(e) => setRequired(Number(e.target.value))} />
        </label>
        <label>
          返还方式
          <select value={mode} onChange={(e) => setMode(e.target.value as RefundMode)}>
            <option value="weekly">每周返还</option>
            <option value="monthly">月末一次返还</option>
          </select>
        </label>
        <label>
          监督人（罚金归谁）
          <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
            {supervisors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.avatar} {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">从 {fmtDate(startDate)} 开始生效。建议押金是「痛感适中」的金额，例如 300-500。</p>
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
        确认已转入押金 {c}
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
      <h3 className="m0">🧧 {memberName(state, supervisorId)} 的红包钱包</h3>
      <div className="stats">
        <Stat label="罚金收入" value={`${c}${w.earned}`} />
        <Stat label="已兑现" value={`${c}${w.spent}`} />
        <Stat label="可支配" value={`${c}${w.available}`} tone="ok" />
      </div>
      <p className="muted small">不练就是在给监督人发红包。罚金可以用来兑现下面的心愿单，或者决定周末去哪吃。</p>
      <h4>心愿单</h4>
      {wishes.map((x) => (
        <div key={x.id} className="row-between wish">
          <span className={x.redeemedAt ? 'muted strike' : ''}>
            {x.title} · {c}
            {x.price}
          </span>
          {x.redeemedAt ? (
            <span className="small muted">已兑现 {x.redeemedAt.slice(5)}</span>
          ) : (
            <span className="row">
              <button
                className="btn btn-primary btn-sm"
                disabled={w.available < x.price}
                onClick={() => update((s) => void (s.wishes.find((y) => y.id === x.id)!.redeemedAt = today()))}
              >
                兑现
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => update((s) => void (s.wishes = s.wishes.filter((y) => y.id !== x.id)))}>
                ✕
              </button>
            </span>
          )}
        </div>
      ))}
      <div className="row">
        <input placeholder="想要的东西" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="number" className="w80" placeholder="价格" value={price || ''} onChange={(e) => setPrice(Number(e.target.value))} />
        <button
          className="btn btn-sm"
          disabled={!title.trim() || price <= 0}
          onClick={() => {
            update((s) => void s.wishes.push({ id: uid(), ownerId: supervisorId, title: title.trim(), price }));
            setTitle('');
            setPrice(0);
          }}
        >
          添加
        </button>
      </div>
    </div>
  );
}
