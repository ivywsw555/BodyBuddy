import { useEffect, useMemo, useState } from 'react';
import type { Member, Session, WorkoutLog } from '../types';
import { EXERCISE_MAP } from '../data/exercises';
import { buildSessions, currentPhase, nextSession, PHASE_INFO } from '../lib/plan';
import { fmtDate, today, uid } from '../lib/date';
import { compressImage } from '../lib/photo';
import { isSupervisor, isTrainee, memberName, useMember, useStore } from '../store';
import { ExerciseDemo, ExerciseDetail, VideoLinks } from '../components/ExerciseDemo';
import { WeekStrip } from '../components/WeekStrip';

export function TodayPage() {
  const member = useMember();
  if (!member) return null;
  return (
    <div className="page">
      <h1 className="page-title">
        {member.avatar} {member.name}，今天是 {fmtDate(today())}
      </h1>
      {isSupervisor(member) && <ReviewQueue supervisor={member} />}
      {isTrainee(member) && (
        <>
          <WeekStrip member={member} />
          <TodayWorkout member={member} />
          <LeaveRequest member={member} />
        </>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<WorkoutLog['status'], string> = {
  pending: '⏳ 等待监督人确认',
  approved: '✅ 监督人已确认',
  rejected: '❌ 监督人驳回',
};

function TodayWorkout({ member }: { member: Member }) {
  const { state } = useStore();
  const t = today();
  const sessions = useMemo(() => buildSessions(member, t), [member, t]);
  const todays = state.logs.filter((l) => l.memberId === member.id && l.date === t);
  const completedCount = state.logs.filter((l) => l.memberId === member.id && l.status !== 'rejected').length;
  const [forceNew, setForceNew] = useState(false);
  const [chosenKey, setChosenKey] = useState<string | null>(null);
  const suggested = nextSession(sessions, completedCount - todays.length);
  const session = sessions.find((s) => s.key === chosenKey) ?? suggested;
  const phase = currentPhase(member, t);
  const isPlannedDay = member.trainingDays.includes(new Date().getDay());

  if (todays.length && !forceNew) {
    return (
      <div className="card">
        <h3>今日训练已打卡</h3>
        {todays.map((l) => (
          <LogSummary key={l.id} log={l} />
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setForceNew(true)}>
          再练一次（同一天只算 1 次）
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="card card-accent">
        <div className="row-between">
          <div>
            <div className="muted small">{PHASE_INFO[phase].name}</div>
            <h2 className="m0">{session.title}</h2>
            <div className="muted small">{session.focus}</div>
          </div>
          <span className={`pill ${isPlannedDay ? 'pill-ok' : ''}`}>{isPlannedDay ? '今天是训练日' : '今天是休息日'}</span>
        </div>
        <div className="seg">
          {sessions.map((s) => (
            <button
              key={s.key}
              className={`seg-btn ${s.key === session.key ? 'active' : ''}`}
              onClick={() => setChosenKey(s.key)}
            >
              训练 {s.key}
              {s.key === suggested.key ? '（轮到）' : ''}
            </button>
          ))}
        </div>
        <p className="small m0">热身：快走或原地踏步 5 分钟 + 关节环绕，身体微微出汗再开始。</p>
      </div>
      <WorkoutRunner key={`${member.id}-${session.key}`} member={member} session={session} onDone={() => setForceNew(false)} />
    </>
  );
}

interface Draft {
  sets: Record<string, number>;
  loads: Record<string, string>;
}

function WorkoutRunner({ member, session, onDone }: { member: Member; session: Session; onDone: () => void }) {
  const { state, update } = useStore();
  const t = today();
  const draftKey = `bodybuddy.draft.${member.id}.${t}.${session.key}`;
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      return JSON.parse(localStorage.getItem(draftKey) ?? '') as Draft;
    } catch {
      return { sets: {}, loads: {} };
    }
  });
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [detail, setDetail] = useState<string | null>(null);
  const [rpe, setRpe] = useState(7);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // 草稿保存失败不影响训练
    }
  }, [draft, draftKey]);

  useEffect(() => {
    if (!rest) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= rest.until) {
        setRest(null);
        if ('vibrate' in navigator) navigator.vibrate?.(300);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [rest]);

  const totalPlanned = session.items.reduce((s, i) => s + i.sets, 0);
  const totalDone = session.items.reduce((s, i) => s + Math.min(draft.sets[i.exerciseId] ?? 0, i.sets), 0);
  const completion = totalPlanned ? totalDone / totalPlanned : 0;

  function toggleSet(id: string, idx: number, restSec: number) {
    const cur = draft.sets[id] ?? 0;
    const next = idx < cur ? idx : idx + 1;
    setDraft({ ...draft, sets: { ...draft.sets, [id]: next } });
    if (next > cur && restSec > 0) setRest({ until: Date.now() + restSec * 1000, total: restSec });
  }

  function finish() {
    const log: WorkoutLog = {
      id: uid(),
      memberId: member.id,
      date: t,
      createdAt: new Date().toISOString(),
      sessionKey: session.key,
      title: session.title,
      exercises: session.items.map((i) => ({
        exerciseId: i.exerciseId,
        setsPlanned: i.sets,
        setsDone: Math.min(draft.sets[i.exerciseId] ?? 0, i.sets),
        load: draft.loads[i.exerciseId] || undefined,
      })),
      completion,
      rpe,
      note: note.trim() || undefined,
      photo,
      status: state.settings.requireApproval && member.supervisorId ? 'pending' : 'approved',
    };
    update((s) => {
      s.logs.push(log);
    });
    localStorage.removeItem(draftKey);
    onDone();
  }

  const lastLoads = useMemo(() => {
    const map: Record<string, string> = {};
    for (const l of state.logs.filter((x) => x.memberId === member.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      for (const e of l.exercises) if (e.load) map[e.exerciseId] = e.load;
    }
    return map;
  }, [state.logs, member.id]);

  return (
    <>
      {session.items.map((item, n) => {
        const ex = EXERCISE_MAP[item.exerciseId];
        const done = draft.sets[item.exerciseId] ?? 0;
        return (
          <div key={item.exerciseId} className={`card ex-card ${done >= item.sets ? 'ex-done' : ''}`}>
            <div className="ex-row">
              <button className="ex-demo-btn" onClick={() => setDetail(ex.id)} aria-label="查看动作详情">
                <ExerciseDemo ex={ex} size="sm" />
              </button>
              <div className="ex-info">
                <div className="muted small">第 {n + 1} 个动作</div>
                <h3 className="m0">
                  {ex.name}
                </h3>
                <div className="ex-dose">
                  {item.sets} 组 × {item.reps}
                  {item.restSec ? ` · 休息 ${item.restSec}秒` : ''}
                </div>
                {item.note && <div className="muted small">{item.note}</div>}
              </div>
            </div>
            <ul className="cues cues-compact">
              {ex.cues.slice(0, 3).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="sets">
              {Array.from({ length: item.sets }, (_, i) => (
                <button
                  key={i}
                  className={`set-btn ${i < done ? 'checked' : ''}`}
                  onClick={() => toggleSet(item.exerciseId, i, item.restSec)}
                >
                  {i < done ? '✓' : `第${i + 1}组`}
                </button>
              ))}
              {ex.equip.length > 0 && (
                <input
                  className="load-input"
                  placeholder={lastLoads[ex.id] ? `上次 ${lastLoads[ex.id]}` : '重量 如 8kg'}
                  value={draft.loads[ex.id] ?? ''}
                  onChange={(e) => setDraft({ ...draft, loads: { ...draft.loads, [ex.id]: e.target.value } })}
                />
              )}
            </div>
            <VideoLinks ex={ex} />
          </div>
        );
      })}

      {rest && (
        <div className="rest-timer" onClick={() => setRest(null)}>
          <div className="rest-ring" style={{ ['--p' as string]: `${Math.max(0, (rest.until - now) / (rest.total * 1000)) * 100}%` }}>
            {Math.max(0, Math.ceil((rest.until - now) / 1000))}
          </div>
          <div>
            <b>组间休息</b>
            <div className="small">点击跳过</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row-between">
          <h3 className="m0">完成度 {Math.round(completion * 100)}%</h3>
          <span className="muted small">≥{Math.round(state.settings.minCompletion * 100)}% 才算有效打卡</span>
        </div>
        <div className="progress">
          <div style={{ width: `${completion * 100}%` }} />
        </div>
        {!finishing ? (
          <button className="btn btn-primary btn-block" disabled={totalDone === 0} onClick={() => setFinishing(true)}>
            完成训练，去打卡
          </button>
        ) : (
          <div className="form">
            <label>
              主观疲劳度 RPE：<b>{rpe}</b>（1 很轻松 · 10 力竭）
              <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
            </label>
            <label>
              备注（哪里酸痛、哪个动作不会做…）
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </label>
            <label>
              打卡照片（可选，给监督人看的证据）
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhoto(await compressImage(f));
                }}
              />
            </label>
            {photo && <img className="proof" src={photo} alt="打卡照片" />}
            {completion < state.settings.minCompletion && (
              <p className="warn">完成度不足 {Math.round(state.settings.minCompletion * 100)}%，这次打卡不会计入本周次数。</p>
            )}
            <button className="btn btn-primary btn-block" onClick={finish}>
              提交打卡{member.supervisorId && state.settings.requireApproval ? `（交给 ${memberName(state, member.supervisorId)} 确认）` : ''}
            </button>
          </div>
        )}
      </div>
      {detail && <ExerciseDetail ex={EXERCISE_MAP[detail]} onClose={() => setDetail(null)} />}
    </>
  );
}

export function LogSummary({ log, showMember }: { log: WorkoutLog; showMember?: boolean }) {
  const { state } = useStore();
  return (
    <div className="log">
      <div className="row-between">
        <b>
          {showMember ? `${memberName(state, log.memberId)} · ` : ''}
          {log.title}
        </b>
        <span className={`pill pill-${log.status}`}>{STATUS_TEXT[log.status]}</span>
      </div>
      <div className="muted small">
        {fmtDate(log.date)} {new Date(log.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} · 完成度{' '}
        {Math.round(log.completion * 100)}%{log.rpe ? ` · RPE ${log.rpe}` : ''}
      </div>
      <ul className="log-ex">
        {log.exercises.map((e) => (
          <li key={e.exerciseId} className={e.setsDone < e.setsPlanned ? 'short' : ''}>
            {EXERCISE_MAP[e.exerciseId]?.name ?? e.exerciseId} {e.setsDone}/{e.setsPlanned} 组{e.load ? ` · ${e.load}` : ''}
          </li>
        ))}
      </ul>
      {log.note && <p className="small">💬 {log.note}</p>}
      {log.photo && <img className="proof" src={log.photo} alt="打卡照片" />}
      {log.reviewNote && <p className="small">监督人：{log.reviewNote}</p>}
    </div>
  );
}

function ReviewQueue({ supervisor }: { supervisor: Member }) {
  const { state, update } = useStore();
  const mine = new Set(state.members.filter((m) => m.supervisorId === supervisor.id).map((m) => m.id));
  if (!mine.size) return null;
  const pendingLogs = state.logs.filter((l) => mine.has(l.memberId) && l.status === 'pending');
  const pendingLeaves = state.leaves.filter((l) => mine.has(l.memberId) && l.status === 'pending');

  const lastTrained = [...mine].map((id) => {
    const dates = state.logs.filter((l) => l.memberId === id && l.status !== 'rejected').map((l) => l.date).sort();
    return { id, last: dates[dates.length - 1] };
  });

  function review(id: string, status: 'approved' | 'rejected') {
    const reviewNote = status === 'rejected' ? prompt('驳回原因（对方会看到）') ?? undefined : undefined;
    update((s) => {
      const l = s.logs.find((x) => x.id === id);
      if (l) {
        l.status = status;
        l.reviewNote = reviewNote;
        l.reviewedBy = supervisor.id;
      }
    });
  }

  return (
    <div className="card card-super">
      <h3 className="m0">👀 监督面板</h3>
      {lastTrained.map(({ id, last }) => (
        <p key={id} className="small m0">
          {memberName(state, id)}：最近一次训练 {last ? fmtDate(last) : '还没有'}
        </p>
      ))}
      {pendingLogs.length === 0 && pendingLeaves.length === 0 && <p className="muted small">没有需要确认的打卡。</p>}
      {pendingLogs.map((l) => (
        <div key={l.id} className="review">
          <LogSummary log={l} showMember />
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={() => review(l.id, 'approved')}>
              ✓ 确认有效
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => review(l.id, 'rejected')}>
              ✕ 驳回
            </button>
          </div>
        </div>
      ))}
      {pendingLeaves.map((l) => (
        <div key={l.id} className="review">
          <b>{memberName(state, l.memberId)} 申请请假</b>
          <div className="small">
            {fmtDate(l.date)} · {l.reason}
          </div>
          <div className="row">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => update((s) => void (s.leaves.find((x) => x.id === l.id)!.status = 'approved'))}
            >
              批准（本周少练 1 次）
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => update((s) => void (s.leaves.find((x) => x.id === l.id)!.status = 'rejected'))}
            >
              不批准
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function LeaveRequest({ member }: { member: Member }) {
  const { state, update } = useStore();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState('');
  const mine = state.leaves.filter((l) => l.memberId === member.id && l.date >= today());
  return (
    <div className="card">
      <div className="row-between">
        <h3 className="m0">请假</h3>
        <button className="btn btn-sm" onClick={() => setOpen(!open)}>
          {open ? '收起' : '申请请假'}
        </button>
      </div>
      <p className="muted small">生病、出差等特殊情况，需要监督人批准；批准后那一周的要求次数减 1。</p>
      {open && (
        <div className="form">
          <label>
            日期
            <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            原因
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="例如：发烧 38°C" />
          </label>
          <button
            className="btn btn-primary"
            disabled={!reason.trim()}
            onClick={() => {
              update((s) => {
                s.leaves.push({
                  id: uid(),
                  memberId: member.id,
                  date,
                  reason: reason.trim(),
                  status: member.supervisorId ? 'pending' : 'approved',
                });
              });
              setReason('');
              setOpen(false);
            }}
          >
            提交
          </button>
        </div>
      )}
      {mine.map((l) => (
        <div key={l.id} className="small">
          {fmtDate(l.date)} · {l.reason} · {l.status === 'approved' ? '已批准' : l.status === 'pending' ? '待批准' : '未批准'}
        </div>
      ))}
    </div>
  );
}
