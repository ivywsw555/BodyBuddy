import { useState } from 'react';
import type { Member, MilestoneMetric } from '../types';
import { addDays, addMonths, fmtDate, fmtMonth, monthDays, monthOf, today, uid, weekday } from '../lib/date';
import { doneDates, leaveDates, pendingDates } from '../lib/escrow';
import { classifyLab, LAB_MAP, LAB_TESTS, labName, METRIC_INFO, metricSeries, milestoneProgress, ZONE_LABEL, zoneOfT } from '../lib/progress';
import { isTrainee, memberName, useMember, useStore } from '../store';
import { LineChart } from '../components/LineChart';
import { LogSummary } from './Today';

export function ProgressPage() {
  const member = useMember();
  if (!member) return null;
  if (!isTrainee(member)) {
    return (
      <div className="page">
        <div className="card">Switch to someone who trains to see progress.</div>
      </div>
    );
  }
  const boneFocus = member.goals.includes('bone') || member.cautions.spineFragile || member.cautions.hipFragile;
  return (
    <div className="page">
      <h1 className="page-title">📈 {member.name}’s progress</h1>
      <CalendarCard member={member} />
      <Milestones member={member} />
      {boneFocus && <DexaCard member={member} />}
      {boneFocus && <LabsCard member={member} />}
      <BodyCard member={member} />
      {!boneFocus && <DexaCard member={member} />}
      {!boneFocus && <LabsCard member={member} />}
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

  // consecutive weeks with the goal met
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
          {fmtMonth(month)} · {count} days trained
        </b>
        <button className="btn btn-sm" onClick={() => setMonth(addMonths(month, 1))}>›</button>
      </div>
      <div className="cal">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} className="cal-h">{d}</div>
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
        🔥 <b>{streak}</b>-week streak {streak >= 4 ? '· amazing!' : ''}
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
      <h3 className="m0">🏆 Milestones & rewards</h3>
      <p className="muted small">Progress is measured from the first entry to the latest one. Repeat DEXA every 12 months, ideally on the same machine.</p>
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
                ? 'Needs at least two measurements'
                : `So far ${p.change > 0 ? '+' : ''}${p.change.toFixed(m.metric.endsWith('Pct') ? 2 : 1)}${METRIC_INFO[m.metric].unit} (${p.baseline?.date} → ${p.latest?.date})`}
              {' · '}due {m.deadline}
            </div>
            <div className="row">
              {m.paidAt ? (
                <span className="small ok">🎉 Reward paid on {m.paidAt}</span>
              ) : p.achieved ? (
                <button className="btn btn-primary btn-sm" onClick={() => update((s) => void (s.milestones.find((x) => x.id === m.id)!.paidAt = today()))}>
                  🎉 Achieved! Mark reward as paid
                </button>
              ) : null}
              <button className="btn btn-ghost btn-sm" onClick={() => update((s) => void (s.milestones = s.milestones.filter((x) => x.id !== m.id)))}>
                Delete
              </button>
            </div>
          </div>
        );
      })}
      {list.length === 0 && (
        <div className="row wrap">
          {member.goals.includes('bone') && (
            <button className="btn btn-sm" onClick={() => PRESETS.bone.forEach((p) => add(p.metric, p.target, p.reward))}>
              + Add bone-density reward tiers
            </button>
          )}
          <button className="btn btn-sm" onClick={() => PRESETS.muscle.forEach((p) => add(p.metric, p.target, p.reward))}>
            + Add muscle-gain reward tiers
          </button>
        </div>
      )}
      <details>
        <summary className="small">Custom milestone</summary>
        <div className="form grid2">
          <label>
            Metric
            <select value={metric} onChange={(e) => setMetric(e.target.value as MilestoneMetric)}>
              {(Object.keys(METRIC_INFO) as MilestoneMetric[]).map((k) => (
                <option key={k} value={k}>
                  {METRIC_INFO[k].name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target ({METRIC_INFO[metric].unit.trim()})
            <input type="number" step="0.1" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
          </label>
          <label>
            Reward ({c})
            <input type="number" value={reward} onChange={(e) => setReward(Number(e.target.value))} />
          </label>
        </div>
        <p className="muted small">{METRIC_INFO[metric].hint}</p>
        <button className="btn btn-sm" onClick={() => add(metric, target, reward)}>Add milestone</button>
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
      <h3 className="m0">🦴 Bone density (DEXA)</h3>
      <p className="muted small">
        Enter BMD (g/cm²) and T/Z scores from the report. Under 50, doctors usually go by the Z-score (≤ -2.0 means below expected for age); colors here follow the T-score.
      </p>
      {records.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Spine</th>
              <th>Hip</th>
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
        <summary className="small">+ Add a DEXA result</summary>
        <div className="form grid3">
          <label>
            Scan date
            <input type="date" value={f.date} onChange={set('date')} />
          </label>
          <label>
            Spine BMD
            <input inputMode="decimal" value={f.spineBmd} onChange={set('spineBmd')} placeholder="e.g. 0.912" />
          </label>
          <label>
            Spine T-score
            <input inputMode="decimal" value={f.spineT} onChange={set('spineT')} placeholder="e.g. -2.6" />
          </label>
          <label>
            Spine Z-score
            <input inputMode="decimal" value={f.spineZ} onChange={set('spineZ')} />
          </label>
          <label>
            Hip BMD
            <input inputMode="decimal" value={f.hipBmd} onChange={set('hipBmd')} />
          </label>
          <label>
            Hip T-score
            <input inputMode="decimal" value={f.hipT} onChange={set('hipT')} />
          </label>
          <label>
            Hip Z-score
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
          Save
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
      <h3 className="m0">💪 Body composition (InBody / smart scale)</h3>
      {records.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Weight</th>
              <th>Muscle</th>
              <th>Body fat</th>
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
        <summary className="small">+ Add a measurement</summary>
        <div className="form grid2">
          <label>
            Date
            <input type="date" value={f.date} onChange={set('date')} />
          </label>
          <label>
            Weight kg
            <input inputMode="decimal" value={f.weight} onChange={set('weight')} />
          </label>
          <label>
            Skeletal muscle kg
            <input inputMode="decimal" value={f.muscleKg} onChange={set('muscleKg')} />
          </label>
          <label>
            Body fat %
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
          Save
        </button>
      </details>
      <p className="muted small">Measure once a month at the same time (morning, before eating).</p>
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
      <h3 className="m0">Workout history</h3>
      {logs.length === 0 && <p className="muted small">No workouts yet. Head to Today to start the first one!</p>}
      {logs.map((l) => (
        <LogSummary key={l.id} log={l} />
      ))}
      {member.supervisorId && <p className="muted small">Supervisor: {memberName(state, member.supervisorId)}</p>}
      <p className="muted small">Last workout: {logs[0] ? fmtDate(logs[0].date) : '—'}</p>
    </div>
  );
}

function LabsCard({ member }: { member: Member }) {
  const { state, update } = useStore();
  const records = state.labs.filter((r) => r.memberId === member.id).sort((a, b) => a.date.localeCompare(b.date));
  const tests = [...new Set(records.map((r) => r.test))];
  const [test, setTest] = useState(LAB_TESTS[0].key);
  const [custom, setCustom] = useState('');
  const [f, setF] = useState({ date: today(), value: '', unit: LAB_TESTS[0].units[0], note: '' });
  const def = LAB_MAP[test];

  function pickTest(key: string) {
    setTest(key);
    setF({ ...f, unit: LAB_MAP[key]?.units[0] ?? '' });
  }

  const testName = test === 'other' ? custom.trim() : test;
  const value = num(f.value);

  return (
    <div className="card">
      <h3 className="m0">🧪 Lab results</h3>
      <p className="muted small">
        Record vitamin D3 and other bone-related blood tests from each yearly check-up. Ranges shown are typical adult ranges; the range printed
        on your own report wins.
      </p>
      {tests.length === 0 && <p className="muted small">No lab results yet.</p>}
      {tests.map((t) => {
        const rows = records.filter((r) => r.test === t);
        const latest = rows[rows.length - 1];
        const status = classifyLab(latest);
        const d = LAB_MAP[t];
        const points = rows.map((r) => ({ date: r.date, value: Math.round((d?.toBase ? d.toBase(r.value, r.unit) : r.value) * 10) / 10 }));
        return (
          <div key={t} className="lab">
            <div className="row-between">
              <b>{labName(t)}</b>
              <span>
                {latest.value} {latest.unit} {status && <span className={`zone zone-${status.zone}`}>{status.label}</span>}
              </span>
            </div>
            {rows.length > 1 && <LineChart points={points} unit="" />}
            <ul className="lab-rows">
              {[...rows].reverse().map((r) => {
                const st = classifyLab(r);
                return (
                  <li key={r.id} className="row-between">
                    <span className="small">
                      {r.date} · {r.value} {r.unit}
                      {st ? ` · ${st.label}` : ''}
                      {r.note ? ` · ${r.note}` : ''}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => update((s) => void (s.labs = s.labs.filter((x) => x.id !== r.id)))}>
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <details>
        <summary className="small">+ Add a lab result</summary>
        <div className="form grid2">
          <label>
            Test date
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
          <label>
            Test
            <select value={test} onChange={(e) => pickTest(e.target.value)}>
              {LAB_TESTS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
              <option value="other">Other…</option>
            </select>
          </label>
          {test === 'other' && (
            <label>
              Test name
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Magnesium" />
            </label>
          )}
          <label>
            Result
            <input inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="e.g. 24" />
          </label>
          <label>
            Unit
            {def && def.units.length > 1 ? (
              <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
                {def.units.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            ) : (
              <input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} readOnly={!!def} />
            )}
          </label>
          <label>
            Note
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. taking 2000 IU D3 daily" />
          </label>
        </div>
        {def && <p className="muted small">{def.about}</p>}
        <button
          className="btn btn-primary btn-sm"
          disabled={value === undefined || !testName}
          onClick={() => {
            update(
              (s) =>
                void s.labs.push({
                  id: uid(),
                  memberId: member.id,
                  date: f.date,
                  test: testName,
                  value: value!,
                  unit: f.unit.trim(),
                  note: f.note.trim() || undefined,
                }),
            );
            setF({ ...f, value: '', note: '' });
          }}
        >
          Save
        </button>
      </details>
      <p className="muted small">Retest once a year, ideally at the same lab, so results are comparable.</p>
    </div>
  );
}
