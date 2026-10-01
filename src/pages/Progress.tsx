import { useState } from 'react';
import type { Member, MilestoneMetric } from '../types';
import { addDays, addMonths, fmtDate, fmtMonth, monthDays, monthOf, today, uid, weekday } from '../lib/date';
import { doneDates, leaveDates, pendingDates } from '../lib/escrow';
import { METRIC_INFO, metricSeries, milestoneProgress, ZONE_LABEL, zoneOfT } from '../lib/progress';
import { isTrainee, memberName, useMember, useStore } from '../store';
import { LineChart } from '../components/LineChart';
import { LogSummary } from './Today';

export function ProgressPage() {
  const member = useMember();
  if (!member) return null;
  if (!isTrainee(member)) {
    return (
      <div className="page">
        <div className="card">切换到训练者查看进度。</div>
      </div>
    );
  }
  const boneFocus = member.goals.includes('bone') || member.cautions.spineFragile || member.cautions.hipFragile;
  return (
    <div className="page">
      <h1 className="page-title">📈 {member.name} 的进度</h1>
      <CalendarCard member={member} />
      <Milestones member={member} />
      {boneFocus && <DexaCard member={member} />}
      <BodyCard member={member} />
      {!boneFocus && <DexaCard member={member} />}
      <History member={member} />
    </div>
  );
}

function CalendarCard({ member }: { member: Member }) {
  const { state } = useStore();
  const [month, setMonth] = useState(monthOf(today()));
  const done = doneDates(state.logs, member.id, state.settings);
  const pending = pendingDates(state.logs, member.id, state.settings);
  const leave = leaveDates(state.leaves, member.id);
  const days = monthDays(month);
  const lead = (weekday(days[0]) + 6) % 7;
  const t = today();
  const count = days.filter((d) => done.has(d)).length;

  // 连续达标周数
  let streak = 0;
  let wk = addDays(t, -((weekday(t) + 6) % 7) - 7);
  for (;;) {
    const ds = Array.from({ length: 7 }, (_, i) => addDays(wk, i));
    const n = ds.filter((d) => done.has(d)).length;
    const req = Math.max(0, member.trainingDays.length - ds.filter((d) => leave.has(d)).length);
    if (n >= req && n > 0) {
      streak++;
      wk = addDays(wk, -7);
    } else break;
  }

  return (
    <div className="card">
      <div className="row-between month-nav">
        <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
        <b>
          {fmtMonth(month)} · 练了 {count} 天
        </b>
        <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, 1))}>›</button>
      </div>
      <div className="cal">
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
          <div key={d} className="cal-h">{d}</div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`b${i}`} />
        ))}
        {days.map((d) => {
          const planned = member.trainingDays.includes(weekday(d));
          const cls = done.has(d) ? 'done' : pending.has(d) ? 'pending' : leave.has(d) ? 'leave' : planned && d < t && d >= member.startDate ? 'missed' : '';
          return (
            <div key={d} className={`cal-d ${cls} ${d === t ? 'is-today' : ''}`}>
              {Number(d.slice(8))}
            </div>
          );
        })}
      </div>
      <p className="small m0">
        🔥 连续达标 <b>{streak}</b> 周 {streak >= 4 ? '· 太棒了！' : ''}
      </p>
    </div>
  );
}

const PRESETS: Record<'bone' | 'muscle', { metric: MilestoneMetric; target: number; reward: number }[]> = {
  bone: [
    { metric: 'spineBmdPct', target: 1, reward: 500 },
    { metric: 'spineBmdPct', target: 2, reward: 1000 },
    { metric: 'spineBmdPct', target: 3, reward: 2000 },
    { metric: 'hipBmdPct', target: 1, reward: 500 },
  ],
  muscle: [
    { metric: 'muscleKg', target: 1, reward: 300 },
    { metric: 'muscleKg', target: 2, reward: 800 },
    { metric: 'muscleKg', target: 3, reward: 1500 },
  ],
};

function Milestones({ member }: { member: Member }) {
  const { state, update } = useStore();
  const c = state.settings.currency;
  const list = state.milestones.filter((m) => m.memberId === member.id);
  const [metric, setMetric] = useState<MilestoneMetric>(member.goals.includes('bone') ? 'spineBmdPct' : 'muscleKg');
  const [target, setTarget] = useState(2);
  const [reward, setReward] = useState(1000);
  const deadline = `${Number(today().slice(0, 4)) + 1}${today().slice(4)}`;

  function add(metric: MilestoneMetric, target: number, reward: number) {
    update((s) => {
      s.milestones.push({
        id: uid(),
        memberId: member.id,
        metric,
        target,
        reward,
        deadline,
        title: `${METRIC_INFO[metric].name} ${target > 0 ? '+' : ''}${target}${METRIC_INFO[metric].unit}`,
      });
    });
  }

  return (
    <div className="card">
      <h3 className="m0">🏆 阶段目标与奖金</h3>
      <p className="muted small">以第一次记录为基线、最新记录为结果自动计算。DEXA 建议每 12 个月复查一次（同一台机器更准）。</p>
      {list.map((m) => {
        const p = milestoneProgress(state, m);
        return (
          <div key={m.id} className="milestone">
            <div className="row-between">
              <b>{m.title}</b>
              <span className="pill">{c}{m.reward}</span>
            </div>
            <div className="progress">
              <div style={{ width: `${p.ratio * 100}%` }} className={p.achieved ? 'ok-bg' : ''} />
            </div>
            <div className="small muted">
              {p.change === undefined
                ? '需要至少两次测量记录'
                : `目前 ${p.change > 0 ? '+' : ''}${p.change.toFixed(m.metric.endsWith('Pct') ? 2 : 1)}${METRIC_INFO[m.metric].unit}（${p.baseline?.date} → ${p.latest?.date}）`}
              {' · '}截止 {m.deadline}
            </div>
            <div className="row">
              {m.paidAt ? (
                <span className="small ok">🎉 奖金已于 {m.paidAt} 发放</span>
              ) : p.achieved ? (
                <button className="btn btn-primary btn-sm" onClick={() => update((s) => void (s.milestones.find((x) => x.id === m.id)!.paidAt = today()))}>
                  🎉 达成！标记奖金已发放
                </button>
              ) : null}
              <button className="btn btn-ghost btn-sm" onClick={() => update((s) => void (s.milestones = s.milestones.filter((x) => x.id !== m.id)))}>
                删除
              </button>
            </div>
          </div>
        );
      })}
      {list.length === 0 && (
        <div className="row wrap">
          {member.goals.includes('bone') && (
            <button className="btn btn-sm" onClick={() => PRESETS.bone.forEach((p) => add(p.metric, p.target, p.reward))}>
              ＋ 一键添加骨密度阶梯奖金
            </button>
          )}
          <button className="btn btn-sm" onClick={() => PRESETS.muscle.forEach((p) => add(p.metric, p.target, p.reward))}>
            ＋ 一键添加增肌阶梯奖金
          </button>
        </div>
      )}
      <details>
        <summary className="small">自定义目标</summary>
        <div className="form grid2">
          <label>
            指标
            <select value={metric} onChange={(e) => setMetric(e.target.value as MilestoneMetric)}>
              {(Object.keys(METRIC_INFO) as MilestoneMetric[]).map((k) => (
                <option key={k} value={k}>
                  {METRIC_INFO[k].name}
                </option>
              ))}
            </select>
          </label>
          <label>
            目标（{METRIC_INFO[metric].unit}）
            <input type="number" step="0.1" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
          </label>
          <label>
            奖金（{c}）
            <input type="number" value={reward} onChange={(e) => setReward(Number(e.target.value))} />
          </label>
        </div>
        <p className="muted small">{METRIC_INFO[metric].hint}</p>
        <button className="btn btn-sm" onClick={() => add(metric, target, reward)}>添加目标</button>
      </details>
    </div>
  );
}

function num(v: string): number | undefined {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

function ZoneTag({ t }: { t?: number }) {
  const z = zoneOfT(t);
  if (!z) return null;
  return <span className={`zone zone-${z}`}>{ZONE_LABEL[z]}</span>;
}

function DexaCard({ member }: { member: Member }) {
  const { state, update } = useStore();
  const records = state.dexa.filter((r) => r.memberId === member.id).sort((a, b) => a.date.localeCompare(b.date));
  const [f, setF] = useState({ date: today(), spineBmd: '', spineT: '', spineZ: '', hipBmd: '', hipT: '', hipZ: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="card">
      <h3 className="m0">🦴 骨密度（DEXA）</h3>
      <p className="muted small">
        按报告填写 BMD（g/cm²）和 T 值/Z 值。50 岁以下一般看 Z 值（≤ -2.0 为「低于同龄预期」），颜色按 T 值标注。
      </p>
      {records.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>日期</th>
              <th>腰椎</th>
              <th>髋部</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>
                  {r.spineBmd ?? '—'} <span className="small">T{r.spineT ?? '?'} Z{r.spineZ ?? '?'}</span> <ZoneTag t={r.spineT} />
                </td>
                <td>
                  {r.hipBmd ?? '—'} <span className="small">T{r.hipT ?? '?'} Z{r.hipZ ?? '?'}</span> <ZoneTag t={r.hipT} />
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => update((s) => void (s.dexa = s.dexa.filter((x) => x.id !== r.id)))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <LineChart points={metricSeries(state, member.id, 'spineBmdPct')} unit="" />
      <details>
        <summary className="small">＋ 录入一次 DEXA 结果</summary>
        <div className="form grid3">
          <label>
            检查日期
            <input type="date" value={f.date} onChange={set('date')} />
          </label>
          <label>
            腰椎 BMD
            <input inputMode="decimal" value={f.spineBmd} onChange={set('spineBmd')} placeholder="如 0.912" />
          </label>
          <label>
            腰椎 T 值
            <input inputMode="decimal" value={f.spineT} onChange={set('spineT')} placeholder="如 -2.6" />
          </label>
          <label>
            腰椎 Z 值
            <input inputMode="decimal" value={f.spineZ} onChange={set('spineZ')} />
          </label>
          <label>
            髋部 BMD
            <input inputMode="decimal" value={f.hipBmd} onChange={set('hipBmd')} />
          </label>
          <label>
            髋部 T 值
            <input inputMode="decimal" value={f.hipT} onChange={set('hipT')} />
          </label>
          <label>
            髋部 Z 值
            <input inputMode="decimal" value={f.hipZ} onChange={set('hipZ')} />
          </label>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            update((s) =>
              void s.dexa.push({
                id: uid(),
                memberId: member.id,
                date: f.date,
                spineBmd: num(f.spineBmd),
                spineT: num(f.spineT),
                spineZ: num(f.spineZ),
                hipBmd: num(f.hipBmd),
                hipT: num(f.hipT),
                hipZ: num(f.hipZ),
              }),
            );
            setF({ ...f, spineBmd: '', spineT: '', spineZ: '', hipBmd: '', hipT: '', hipZ: '' });
          }}
        >
          保存
        </button>
      </details>
    </div>
  );
}

function BodyCard({ member }: { member: Member }) {
  const { state, update } = useStore();
  const records = state.body.filter((r) => r.memberId === member.id).sort((a, b) => a.date.localeCompare(b.date));
  const [f, setF] = useState({ date: today(), weight: '', muscleKg: '', fatPct: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="card">
      <h3 className="m0">💪 体成分（InBody / 体脂秤）</h3>
      {records.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>日期</th>
              <th>体重</th>
              <th>骨骼肌</th>
              <th>体脂率</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>{r.weight ?? '—'}</td>
                <td>{r.muscleKg ?? '—'}</td>
                <td>{r.fatPct ?? '—'}</td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => update((s) => void (s.body = s.body.filter((x) => x.id !== r.id)))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <LineChart points={metricSeries(state, member.id, 'muscleKg')} unit="kg" />
      <details>
        <summary className="small">＋ 录入一次体成分</summary>
        <div className="form grid2">
          <label>
            日期
            <input type="date" value={f.date} onChange={set('date')} />
          </label>
          <label>
            体重 kg
            <input inputMode="decimal" value={f.weight} onChange={set('weight')} />
          </label>
          <label>
            骨骼肌 kg
            <input inputMode="decimal" value={f.muscleKg} onChange={set('muscleKg')} />
          </label>
          <label>
            体脂率 %
            <input inputMode="decimal" value={f.fatPct} onChange={set('fatPct')} />
          </label>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            update((s) =>
              void s.body.push({ id: uid(), memberId: member.id, date: f.date, weight: num(f.weight), muscleKg: num(f.muscleKg), fatPct: num(f.fatPct) }),
            );
            setF({ ...f, weight: '', muscleKg: '', fatPct: '' });
          }}
        >
          保存
        </button>
      </details>
      <p className="muted small">建议每月同一时间（早上空腹）测一次。</p>
    </div>
  );
}

function History({ member }: { member: Member }) {
  const { state } = useStore();
  const logs = state.logs
    .filter((l) => l.memberId === member.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 15);
  return (
    <div className="card">
      <h3 className="m0">训练记录</h3>
      {logs.length === 0 && <p className="muted small">还没有训练记录。去「今天」开始第一次训练吧！</p>}
      {logs.map((l) => (
        <LogSummary key={l.id} log={l} />
      ))}
      {member.supervisorId && <p className="muted small">监督人：{memberName(state, member.supervisorId)}</p>}
      <p className="muted small">最近一次：{logs[0] ? fmtDate(logs[0].date) : '—'}</p>
    </div>
  );
}
