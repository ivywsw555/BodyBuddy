import { useEffect, useMemo, useState } from 'react';
import type { Member, Session, TrackerStats, WorkoutLog } from '../types';
import { EXERCISE_MAP } from '../data/exercises';
import { buildSessions, currentPhase, nextSession, PHASE_INFO } from '../lib/plan';
import { fmtDate, today, uid } from '../lib/date';
import { compressImage } from '../lib/photo';
import { isSupervisor, isTrainee, memberName, useMember, useStore } from '../store';
import { ExerciseDemo, ExerciseDetail, VideoLinks } from '../components/ExerciseDemo';
import { WeekStrip } from '../components/WeekStrip';
import { DailyCard, WalkCard } from '../components/DailyRoutine';
import { HARD_MINUTES_CAP, hardMinutes, isCardio, weeklyReview } from '../lib/load';
import { addDays, mondayOf } from '../lib/date';
import { dailyKey, dailyRoutine, weekWalkMinutes, WEEKLY_WALK_GOAL } from '../lib/daily';

export function TodayPage() {
  const member = useMember();
  if (!member) return null;
  return (
    <div className="page">
      <h1 className="page-title">
        {member.avatar} Hi {member.name}, it’s {fmtDate(today())}
      </h1>
      {isSupervisor(member) && <ReviewQueue supervisor={member} />}
      {isTrainee(member) && (
        <>
          <WeeklyReviewCard member={member} />
          <WeekStrip member={member} />
          <DailyCard member={member} />
          <TodayWorkout member={member} />
          <WalkCard member={member} />
          <LeaveRequest member={member} />
        </>
      )}
    </div>
  );
}

const STATUS_TEXT: Record<WorkoutLog['status'], string> = {
  pending: '⏳ Waiting for supervisor',
  approved: '✅ Approved',
  rejected: '❌ Rejected',
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
        <h3>Today’s workout is checked in</h3>
        {todays.map((l) => (
          <LogSummary key={l.id} log={l} />
        ))}
        <button className="btn btn-ghost btn-sm" onClick={() => setForceNew(true)}>
          Train again (still counts as 1 day)
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
          <span className={`pill ${isPlannedDay ? 'pill-ok' : ''}`}>{isPlannedDay ? 'Training day' : 'Rest day'}</span>
        </div>
        <div className="seg">
          {sessions.map((s) => (
            <button
              key={s.key}
              className={`seg-btn ${s.key === session.key ? 'active' : ''}`}
              onClick={() => setChosenKey(s.key)}
            >
              Workout {s.key}
              {s.key === suggested.key ? ' (up next)' : ''}
            </button>
          ))}
        </div>
        <p className="small m0">
          ⏱ About {hardMinutes(session.items)} min of training{session.items.some(isCardio) ? ', plus the walk' : ''}.
          {phase === 1 ? ` Phase 1 limit: ${HARD_MINUTES_CAP[1]} min (walking doesn’t count).` : ''}
        </p>
        {member.planNote && (
          <p className="small m0">
            💬 From {memberName(state, member.supervisorId)}: “{member.planNote}”
          </p>
        )}
        <p className="small m0">Warm-up: 5 minutes of brisk walking or marching in place plus joint circles, until you’re slightly warm.</p>
      </div>
      <WorkoutRunner key={`${member.id}-${session.key}`} member={member} session={session} cap={HARD_MINUTES_CAP[phase]} onDone={() => setForceNew(false)} />
    </>
  );
}

interface Draft {
  sets: Record<string, number>;
  loads: Record<string, string>;
  /** When the first set was ticked (ms since epoch) */
  startedAt?: number;
}

function WorkoutRunner({ member, session, cap, onDone }: { member: Member; session: Session; cap: number; onDone: () => void }) {
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
  const [tracker, setTracker] = useState<Record<keyof TrackerStats, string>>({ minutes: '', avgHr: '', zoneMinutes: '', calories: '' });
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // a failed draft save does not block the workout
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
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  const elapsedMin = draft.startedAt ? Math.floor((Math.max(clock, now) - draft.startedAt) / 60000) : 0;
  const overCap = elapsedMin >= cap;

  function toggleSet(id: string, idx: number, restSec: number) {
    const cur = draft.sets[id] ?? 0;
    const next = idx < cur ? idx : idx + 1;
    setDraft({ ...draft, sets: { ...draft.sets, [id]: next }, startedAt: draft.startedAt ?? Date.now() });
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
      tracker: trackerStats(tracker),
      durationMin: elapsedMin || undefined,
      timeCapped: overCap && completion < state.settings.minCompletion ? true : undefined,
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
              <button className="ex-demo-btn" onClick={() => setDetail(ex.id)} aria-label="Exercise details">
                <ExerciseDemo ex={ex} size="sm" />
              </button>
              <div className="ex-info">
                <div className="muted small">Exercise {n + 1}</div>
                <h3 className="m0">
                  {ex.name}
                </h3>
                <div className="ex-dose">
                  {item.sets} sets × {item.reps}
                  {item.restSec ? ` · rest ${item.restSec}s` : ''}
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
                  disabled={overCap && i >= done && !isCardio(item)}
                  onClick={() => toggleSet(item.exerciseId, i, item.restSec)}
                >
                  {i < done ? '✓' : `Set ${i + 1}`}
                </button>
              ))}
              {ex.equip.length > 0 && (
                <input
                  className="load-input"
                  placeholder={lastLoads[ex.id] ? `Last: ${lastLoads[ex.id]}` : 'Weight, e.g. 8kg'}
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
            <b>Rest</b>
            <div className="small">Tap to skip</div>
          </div>
        </div>
      )}

      {overCap && (
        <div className="card card-warn">
          <b>⏱ {cap}-minute limit reached.</b> Stop the strength work here and check in; this counts as a full session. Walking is still fine.
        </div>
      )}
      <div className="card">
        <div className="row-between">
          <h3 className="m0">
            {Math.round(completion * 100)}% complete{draft.startedAt ? ` · ${elapsedMin} min` : ''}
          </h3>
          <span className="muted small">≥{Math.round(state.settings.minCompletion * 100)}% needed to count</span>
        </div>
        <div className="progress">
          <div style={{ width: `${completion * 100}%` }} />
        </div>
        {!finishing ? (
          <button className="btn btn-primary btn-block" disabled={totalDone === 0} onClick={() => setFinishing(true)}>
            Finish workout and check in
          </button>
        ) : (
          <div className="form">
            <label>
              Effort (RPE): <b>{rpe}</b> (1 very easy · 10 all-out)
              <input type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
            </label>
            <label>
              Notes (anything sore, any move you weren’t sure about…)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
            </label>
            <label>
              Check-in photo (optional proof for your supervisor)
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
            {photo && <img className="proof" src={photo} alt="Check-in photo" />}
            <fieldset className="tracker">
              <legend>⌚ From your Fitbit (optional)</legend>
              <p className="muted small m0">Open this workout in the Fitbit app and copy the numbers here.</p>
              <div className="form grid2">
                {TRACKER_FIELDS.map(([k, label]) => (
                  <label key={k}>
                    {label}
                    <input inputMode="numeric" value={tracker[k]} onChange={(e) => setTracker({ ...tracker, [k]: e.target.value })} />
                  </label>
                ))}
              </div>
            </fieldset>
            {Number(tracker.minutes) > cap && (
              <p className="warn">That’s longer than the {cap}-minute limit for this phase. Keep the next session shorter.</p>
            )}
            {completion < state.settings.minCompletion && !overCap && (
              <p className="warn">Less than {Math.round(state.settings.minCompletion * 100)}% done, so this check-in won’t count toward the week.</p>
            )}
            <button className="btn btn-primary btn-block" onClick={finish}>
              Check in{member.supervisorId && state.settings.requireApproval ? ` (sent to ${memberName(state, member.supervisorId)} to approve)` : ''}
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
        {fmtDate(log.date)} {new Date(log.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {Math.round(log.completion * 100)}% done{log.rpe ? ` · RPE ${log.rpe}` : ''}
      </div>
      <ul className="log-ex">
        {log.exercises.map((e) => (
          <li key={e.exerciseId} className={e.setsDone < e.setsPlanned ? 'short' : ''}>
            {EXERCISE_MAP[e.exerciseId]?.name ?? e.exerciseId} {e.setsDone}/{e.setsPlanned} sets{e.load ? ` · ${e.load}` : ''}
          </li>
        ))}
      </ul>
      {log.tracker && <p className="small">⌚ {fmtTracker(log.tracker)}</p>}
      {log.note && <p className="small">💬 {log.note}</p>}
      {log.photo && <img className="proof" src={log.photo} alt="Check-in photo" />}
      {log.reviewNote && <p className="small">Supervisor: {log.reviewNote}</p>}
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
    const reviewNote = status === 'rejected' ? prompt('Reason for rejecting (they will see this)') ?? undefined : undefined;
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
      <h3 className="m0">👀 Supervisor panel</h3>
      {lastTrained.map(({ id, last }) => {
        const m = state.members.find((x) => x.id === id)!;
        const routine = dailyRoutine(m).length;
        const doneToday = state.daily[dailyKey(id, today())]?.length ?? 0;
        return (
          <p key={id} className="small m0">
            {memberName(state, id)}: last workout {last ? fmtDate(last) : 'none yet'}
            {routine > 0 && ` · daily routine ${doneToday}/${routine}`}
            {` · walking ${weekWalkMinutes(state, id, today())}/${WEEKLY_WALK_GOAL} min`}
          </p>
        );
      })}
      {pendingLogs.length === 0 && pendingLeaves.length === 0 && <p className="muted small">Nothing to review.</p>}
      {pendingLogs.map((l) => (
        <div key={l.id} className="review">
          <LogSummary log={l} showMember />
          <div className="row">
            <button className="btn btn-primary btn-sm" onClick={() => review(l.id, 'approved')}>
              ✓ Approve
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => review(l.id, 'rejected')}>
              ✕ Reject
            </button>
          </div>
        </div>
      ))}
      {pendingLeaves.map((l) => (
        <div key={l.id} className="review">
          <b>{memberName(state, l.memberId)} asked for a day off</b>
          <div className="small">
            {fmtDate(l.date)} · {l.reason}
          </div>
          <div className="row">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => update((s) => void (s.leaves.find((x) => x.id === l.id)!.status = 'approved'))}
            >
              Approve (1 fewer this week)
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => update((s) => void (s.leaves.find((x) => x.id === l.id)!.status = 'rejected'))}
            >
              Decline
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
        <h3 className="m0">Day off</h3>
        <button className="btn btn-sm" onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Request a day off'}
        </button>
      </div>
      <p className="muted small">For illness, travel and the like. Your supervisor has to approve it; once approved, that week needs 1 fewer session.</p>
      {open && (
        <div className="form">
          <label>
            Date
            <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. fever 38°C" />
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
            Submit
          </button>
        </div>
      )}
      {mine.map((l) => (
        <div key={l.id} className="small">
          {fmtDate(l.date)} · {l.reason} · {l.status === 'approved' ? 'approved' : l.status === 'pending' ? 'pending' : 'declined'}
        </div>
      ))}
    </div>
  );
}

const TRACKER_FIELDS: [keyof TrackerStats, string][] = [
  ['minutes', 'Duration (min)'],
  ['avgHr', 'Avg heart rate (bpm)'],
  ['zoneMinutes', 'Active Zone Minutes'],
  ['calories', 'Calories'],
];

function trackerStats(raw: Record<keyof TrackerStats, string>): TrackerStats | undefined {
  const out: TrackerStats = {};
  for (const [k] of TRACKER_FIELDS) {
    const n = Number(raw[k]);
    if (raw[k].trim() && Number.isFinite(n) && n > 0) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

function fmtTracker(t: TrackerStats): string {
  return [
    t.minutes && `${t.minutes} min`,
    t.avgHr && `avg ${t.avgHr} bpm`,
    t.zoneMinutes && `${t.zoneMinutes} AZM`,
    t.calories && `${t.calories} kcal`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function WeeklyReviewCard({ member }: { member: Member }) {
  const { state, update } = useStore();
  const t = today();
  const phase = currentPhase(member, t);
  const r = weeklyReview(state, member, t, phase);
  const key = `${member.id}|${r.weekStart}`;
  const answer = state.reviews[key];
  // nothing to review before the plan started
  if (r.weekEnd < member.startDate) return null;
  const head: Record<typeof r.verdict, string> = {
    'too-much': '⚠️ Last week looks like too much',
    'about-right': '✅ Last week’s load looked about right',
    'too-little': '📉 Last week was on the light side',
    'no-data': '📭 No workouts logged last week',
  };
  if (answer) {
    return (
      <div className="card small">
        {head[r.verdict]} · {answer === 'lighten' ? 'this week is lighter (one set fewer).' : 'keeping the plan.'}{' '}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() =>
            update((s) => {
              delete s.reviews[key];
              if (answer === 'lighten') s.members.find((x) => x.id === member.id)!.lightenUntil = undefined;
            })
          }
        >
          Change
        </button>
      </div>
    );
  }
  return (
    <div className={`card ${r.verdict === 'too-much' ? 'card-warn' : ''}`}>
      <h3 className="m0">{head[r.verdict]}</h3>
      <p className="muted small m0">
        Weekly check, {r.weekStart.slice(5)} to {r.weekEnd.slice(5)}: {r.sessions}/{r.required} sessions
        {r.avgRpe !== undefined ? ` · avg effort ${r.avgRpe}/10` : ''}
        {r.longestMin !== undefined ? ` · longest ${r.longestMin} min` : ''}
      </p>
      {r.reasons.length > 0 && (
        <ul className="small">
          {r.reasons.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      <p className="small">{r.advice}</p>
      <div className="row wrap">
        <button
          className={`btn btn-sm ${r.verdict === 'too-much' ? 'btn-primary' : ''}`}
          onClick={() =>
            update((s) => {
              s.reviews[key] = 'lighten';
              const m = s.members.find((x) => x.id === member.id)!;
              m.lightenUntil = addDays(mondayOf(t), 6);
            })
          }
        >
          Make this week lighter
        </button>
        <button className={`btn btn-sm ${r.verdict === 'too-much' ? '' : 'btn-primary'}`} onClick={() => update((s) => void (s.reviews[key] = 'keep'))}>
          Keep the plan
        </button>
      </div>
    </div>
  );
}
