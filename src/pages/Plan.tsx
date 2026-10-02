import { useMemo, useState } from 'react';
import { BONE_AVOID_LIST, EXERCISE_MAP, EXERCISES } from '../data/exercises';
import {
  buildSessions,
  canEditPlan,
  currentPhase,
  dose,
  EQUIPMENT_NAMES,
  EXTRA_SLOT,
  GOAL_NAMES,
  hasEquipment,
  isAvoided,
  PATTERN_NAMES,
  PHASE_INFO,
} from '../lib/plan';
import { daysBetween, fmtDate, today, WEEKDAY_NAMES } from '../lib/date';
import { HARD_MINUTES_CAP } from '../lib/load';
import { isTrainee, memberName, useMember, useStore } from '../store';
import { ExerciseDemo, ExerciseDetail } from '../components/ExerciseDemo';
import type { Member, Phase, PlannedExercise, Session } from '../types';

export function PlanPage() {
  const viewer = useMember();
  const { state, update } = useStore();
  const [detail, setDetail] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const t = today();
  // Plans this person can open: their own (if they train) plus everyone they supervise
  const options = state.members.filter((m) => isTrainee(m) && (m.id === viewer?.id || m.supervisorId === viewer?.id));
  const member = options.find((m) => m.id === pickedId) ?? options[0];
  const sessions = useMemo(() => (member ? buildSessions(member, t) : []), [member, t]);
  if (!viewer) return null;
  if (!member) {
    return (
      <div className="page">
        <div className="card">
          <p>{viewer.name} is a supervisor only and isn’t supervising anyone yet. Set a supervisor for someone in Settings to manage their plan here.</p>
        </div>
      </div>
    );
  }
  const phase = currentPhase(member, t);
  const week = Math.floor(daysBetween(member.startDate, t) / 7) + 1;
  const fragile = member.cautions.spineFragile || member.cautions.hipFragile;
  const editable = canEditPlan(viewer, member);
  const asSupervisor = editable && member.supervisorId === viewer.id;
  const hasChanges =
    Object.keys(member.swaps).length > 0 ||
    Object.keys(member.planEdits ?? {}).length > 0 ||
    Object.values(member.planExtras ?? {}).some((x) => x.length > 0);

  /** Change the shown member's plan and record who changed it */
  const edit = (fn: (m: Member) => void) =>
    update((s) => {
      const m = s.members.find((x) => x.id === member.id)!;
      fn(m);
      m.planEditedBy = viewer.id;
      m.planEditedAt = new Date().toISOString();
    });

  return (
    <div className="page">
      <h1 className="page-title">{member.avatar} {member.name}’s plan</h1>
      {options.length > 1 && (
        <div className="chips">
          {options.map((m) => (
            <button key={m.id} className={`chip ${m.id === member.id ? 'active' : ''}`} onClick={() => setPickedId(m.id)}>
              {m.avatar} {m.id === viewer.id ? 'My plan' : `${m.name}’s plan`}
            </button>
          ))}
        </div>
      )}
      <PlanOwnerCard member={member} viewer={viewer} editable={editable} asSupervisor={asSupervisor} onNote={(note) => edit((m) => void (m.planNote = note || undefined))} />
      <div className="card card-accent">
        <div className="muted small">Week {Math.max(1, week)}</div>
        <h2 className="m0">{PHASE_INFO[phase].name}</h2>
        <p className="small">{PHASE_INFO[phase].desc}</p>
        <div className="seg">
          {([1, 2, 3] as Phase[]).map((p) => (
            <button
              key={p}
              className={`seg-btn ${phase === p ? 'active' : ''}`}
              disabled={!editable}
              onClick={() => edit((m) => void (m.phaseOverride = m.phaseOverride === p ? undefined : p))}
            >
              Phase {p}
            </button>
          ))}
        </div>
        <p className="muted small m0">
          {member.phaseOverride ? 'Phase locked manually. Tap it again to go back to automatic.' : 'Phases advance automatically from the start date, or tap one to lock it.'}
        </p>
        <div className="tags">
          {member.goals.map((g) => (
            <span key={g} className="tag">{GOAL_NAMES[g]}</span>
          ))}
          <span className="tag">{{ gym: '🏋️ Gym', home: '🏠 Home', both: '🔁 Home or gym' }[member.place]}</span>
          {member.place !== 'gym' &&
            (member.equipment.length ? member.equipment.map((e) => <span key={e} className="tag">{EQUIPMENT_NAMES[e]}</span>) : <span className="tag">Bodyweight</span>)}
        </div>
        {editable ? (
          <>
            <div className="small">Training days (workouts A and B alternate):</div>
            <div className="chips">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <button
                  key={d}
                  className={`chip ${member.trainingDays.includes(d) ? 'active' : ''}`}
                  onClick={() =>
                    edit((m) => {
                      m.trainingDays = m.trainingDays.includes(d) ? m.trainingDays.filter((x) => x !== d) : [...m.trainingDays, d];
                    })
                  }
                >
                  {WEEKDAY_NAMES[d]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="small m0">
            Training days: {member.trainingDays.length ? [...member.trainingDays].sort().map((d) => WEEKDAY_NAMES[d]).join(', ') : 'not set'}. Workouts A and B alternate.
          </p>
        )}
      </div>

      {(fragile || member.goals.includes('bone')) && (
        <div className="card">
          <h3 className="m0">📘 Guidelines this plan follows</h3>
          <ul className="small">
            <li>
              <b>Strong</b>: progressive resistance 2–3× a week, building to 3 sets of up to 8 reps as heavy as good form allows; impact
              (heel drops → small hops) aiming for about 50 impacts per leg on most days.
            </li>
            <li>
              <b>Steady</b>: balance practice (tandem stance, single-leg stand, heel-to-toe walk) on most days, in the daily routine on Today.
            </li>
            <li>
              <b>Straight</b>: back-extensor and posture work almost every day; no repeated or loaded bending and twisting of the spine.
            </li>
            <li>
              <b>Core</b>: dead bug and bird dog style only (spine stays still), never crunches.
            </li>
            <li>
              <b>Walking</b>: 150 minutes a week of weight-bearing cardio (brisk walking, stairs, Nordic walking).
            </li>
            <li>
              <b>Limits</b>: phase 1 workouts stay under {HARD_MINUTES_CAP[1]} minutes of hard training (walking excluded), and Today reviews each
              week’s load and suggests a lighter week if it was too much.
            </li>
          </ul>
          <p className="small guide-links m0">
            Follow-along videos: ROS{' '}
            <a href="https://theros.org.uk/blog/new-exercise-for-bone-health-films-muscle-strengthening/" target="_blank" rel="noreferrer">
              muscle-strengthening films, Stage {phase}
            </a>{' '}
            (Stage matches your phase). Sources:{' '}
            <a href="https://theros.org.uk/forms/documents/strong-steady-and-straight" target="_blank" rel="noreferrer">
              ROS Strong, Steady and Straight
            </a>{' '}
            ·{' '}
            <a href="https://osteoporosis.ca/too-fit-to-fracture/" target="_blank" rel="noreferrer">
              Osteoporosis Canada Too Fit to Fracture
            </a>
          </p>
        </div>
      )}

      {fragile && (
        <div className="card card-warn">
          <h3 className="m0">🦴 Training rules for low bone density</h3>
          <ul className="small">
            <li>Check with a doctor or physio that resistance and impact training are OK. If there’s any fracture history, see a doctor first.</li>
            <li>Impact work starts with heel drops and builds up to small hops. {member.cautions.cleared ? 'Cleared by a doctor, so jump squats unlock in phase 3.' : 'Heavy lifts and high-impact moves stay out until “Cleared by a doctor” is ticked in Settings.'}</li>
            <li>Keep the spine neutral in every move, and do back-extensor work every session.</li>
            <li>These are never put in the plan:</li>
          </ul>
          <ul className="avoid">
            {BONE_AVOID_LIST.map((a) => (
              <li key={a.name}>
                <b>✕ {a.name}</b> <span className="muted">— {a.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sessions.map((s) => (
        <SessionCard key={s.key} session={s} member={member} phase={phase} editable={editable} edit={edit} onDetail={setDetail} />
      ))}
      {editable && hasChanges && (
        <button
          className="btn btn-ghost"
          onClick={() =>
            edit((m) => {
              m.swaps = {};
              m.planEdits = {};
              m.planExtras = {};
            })
          }
        >
          Reset to the recommended plan
        </button>
      )}
      <p className="muted small">
        Based on the ROS “Strong, Steady and Straight” consensus, Osteoporosis Canada’s “Too Fit to Fracture” and the LIFTMOR trial (8 months of high-intensity resistance and impact training raised spine BMD by about 2.9%). This app does
        not replace advice from a doctor or physio.
      </p>
      {detail && <ExerciseDetail ex={EXERCISE_MAP[detail]} onClose={() => setDetail(null)} />}
    </div>
  );
}

function PlanOwnerCard({
  member,
  viewer,
  editable,
  asSupervisor,
  onNote,
}: {
  member: Member;
  viewer: Member;
  editable: boolean;
  asSupervisor: boolean;
  onNote: (note: string) => void;
}) {
  const { state } = useStore();
  const [note, setNote] = useState(member.planNote ?? '');
  const [noteFor, setNoteFor] = useState(member.id);
  if (noteFor !== member.id) {
    setNoteFor(member.id);
    setNote(member.planNote ?? '');
  }
  const lastEdit =
    member.planEditedBy && member.planEditedAt ? `Last changed by ${memberName(state, member.planEditedBy)} on ${fmtDate(member.planEditedAt.slice(0, 10))}.` : '';
  if (asSupervisor) {
    return (
      <div className="card card-accent">
        <b>✏️ You’re managing {member.name}’s plan as supervisor.</b>
        <p className="small m0">
          Swap exercises, change sets and reps, add or remove moves, or set the phase and training days. Unsafe moves for {member.name}’s
          condition can’t be added, and the {HARD_MINUTES_CAP[1]}-minute phase 1 limit still applies. {lastEdit}
        </p>
        <label className="small">
          Note for {member.name} (shown on Plan and Today)
          <textarea rows={2} value={note} placeholder="e.g. Go lighter on squats this week, knee felt off" onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (member.planNote ?? '') && onNote(note.trim())} />
        </label>
      </div>
    );
  }
  if (!editable) {
    return (
      <div className="card">
        <b>🔒 {memberName(state, member.supervisorId)} manages this plan.</b>
        <p className="small m0">Ask your supervisor to switch to their profile and change it on this page. {lastEdit}</p>
        {member.planNote && <p className="m0">💬 “{member.planNote}”</p>}
      </div>
    );
  }
  return viewer.id === member.id && !member.supervisorId ? (
    <p className="muted small">No supervisor is set, so you can change this plan yourself. Once a supervisor is set in Settings, only they can change it.</p>
  ) : null;
}

function SessionCard({
  session: s,
  member,
  phase,
  editable,
  edit,
  onDetail,
}: {
  session: Session;
  member: Member;
  phase: Phase;
  editable: boolean;
  edit: (fn: (m: Member) => void) => void;
  onDetail: (id: string) => void;
}) {
  const [adding, setAdding] = useState('');
  const key = (slot: number) => `${s.key}-${slot}`;
  // Moves the supervisor removed, so they can be restored
  const removed = Object.entries(member.planEdits ?? {})
    .filter(([k, e]) => e.removed && k.startsWith(`${s.key}-`))
    .map(([k]) => Number(k.slice(s.key.length + 1)));
  const original = removed.length
    ? buildSessions({ ...member, planEdits: {} }, today()).find((x) => x.key === s.key)?.items ?? []
    : [];
  const inSession = new Set(s.items.map((i) => i.exerciseId));
  const addable = EXERCISES.filter((e) => !inSession.has(e.id) && hasEquipment(e, member) && !isAvoided(e, member));

  const setSets = (item: PlannedExercise, sets: number) =>
    edit((m) => {
      if (item.extra) {
        const x = m.planExtras?.[s.key]?.[item.slot - EXTRA_SLOT];
        if (x) x.sets = sets;
      } else {
        m.planEdits = { ...m.planEdits, [key(item.slot)]: { ...m.planEdits?.[key(item.slot)], sets } };
      }
    });
  const setReps = (item: PlannedExercise, reps: string) =>
    edit((m) => {
      if (item.extra) {
        const x = m.planExtras?.[s.key]?.[item.slot - EXTRA_SLOT];
        if (x) x.reps = reps;
      } else {
        m.planEdits = { ...m.planEdits, [key(item.slot)]: { ...m.planEdits?.[key(item.slot)], reps } };
      }
    });
  const remove = (item: PlannedExercise) =>
    edit((m) => {
      if (item.extra) m.planExtras![s.key].splice(item.slot - EXTRA_SLOT, 1);
      else m.planEdits = { ...m.planEdits, [key(item.slot)]: { removed: true } };
    });

  return (
    <div className="card">
      <h3 className="m0">{s.title}</h3>
      <div className="muted small">{s.focus}</div>
      {s.items.map((item) => {
        const ex = EXERCISE_MAP[item.exerciseId];
        const wanted = item.extra ? member.planExtras?.[s.key]?.[item.slot - EXTRA_SLOT]?.sets : member.planEdits?.[key(item.slot)]?.sets;
        return (
          <div key={item.exerciseId} className="plan-item">
            <button className="ex-demo-btn" onClick={() => onDetail(ex.id)} aria-label="Exercise details">
              <ExerciseDemo ex={ex} size="sm" />
            </button>
            <div className="ex-info">
              <div className="muted small">
                {PATTERN_NAMES[ex.pattern]}
                {item.extra ? ' · added by supervisor' : item.edited ? ' · changed by supervisor' : ''}
              </div>
              <b>{ex.name}</b>
              {editable ? (
                <div className="plan-edit">
                  <span className="stepper">
                    <button className="btn btn-sm" disabled={item.sets <= 1} onClick={() => setSets(item, item.sets - 1)} aria-label="One set fewer">−</button>
                    <span>{item.sets} sets</span>
                    <button className="btn btn-sm" disabled={item.sets >= 8} onClick={() => setSets(item, item.sets + 1)} aria-label="One more set">+</button>
                  </span>
                  <span>×</span>
                  <input
                    key={item.reps}
                    className="reps-input"
                    defaultValue={item.reps}
                    aria-label="Reps or time"
                    onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== item.reps && setReps(item, e.target.value.trim())}
                  />
                </div>
              ) : (
                <div className="ex-dose">
                  {item.sets} sets × {item.reps}
                </div>
              )}
              {wanted !== undefined && wanted > item.sets && (
                <div className="muted small">Trimmed from {wanted} sets to stay under the {HARD_MINUTES_CAP[phase]}-minute limit.</div>
              )}
              {editable && (
                <div className="row-gap">
                  {!item.extra && item.candidates.length > 1 && (
                    <select
                      className="btn btn-sm"
                      value={ex.id}
                      aria-label="Swap exercise"
                      onChange={(e) => edit((m) => void (m.swaps[key(item.slot)] = e.target.value))}
                    >
                      {item.candidates.map((id) => (
                        <option key={id} value={id}>
                          🔄 {EXERCISE_MAP[id].name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => remove(item)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {editable && removed.length > 0 && (
        <div className="small muted">
          Removed:{' '}
          {removed.map((slot) => {
            const it = original.find((i) => i.slot === slot);
            return (
              <button
                key={slot}
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  edit((m) => {
                    const next = { ...m.planEdits };
                    delete next[key(slot)];
                    m.planEdits = next;
                  })
                }
              >
                ↩ {it ? EXERCISE_MAP[it.exerciseId].name : `exercise ${slot + 1}`}
              </button>
            );
          })}
        </div>
      )}
      {editable && (
        <div className="row-gap">
          <select className="search" value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add an exercise">
            <option value="">+ Add an exercise…</option>
            {addable.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({PATTERN_NAMES[e.pattern]})
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm btn-primary"
            disabled={!adding}
            onClick={() => {
              const ex = EXERCISE_MAP[adding];
              const d = dose(ex, member, phase);
              edit((m) => {
                m.planExtras = { ...m.planExtras, [s.key]: [...(m.planExtras?.[s.key] ?? []), { exerciseId: ex.id, sets: d.sets, reps: d.reps }] };
              });
              setAdding('');
            }}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
