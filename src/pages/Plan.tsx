import { useMemo, useState } from 'react';
import { BONE_AVOID_LIST, EXERCISE_MAP } from '../data/exercises';
import { buildSessions, currentPhase, EQUIPMENT_NAMES, GOAL_NAMES, PATTERN_NAMES, PHASE_INFO, templatesFor } from '../lib/plan';
import { daysBetween, today, WEEKDAY_NAMES } from '../lib/date';
import { isTrainee, useMember, useStore } from '../store';
import { ExerciseDemo, ExerciseDetail } from '../components/ExerciseDemo';
import type { Phase } from '../types';

export function PlanPage() {
  const member = useMember();
  const { update } = useStore();
  const [detail, setDetail] = useState<string | null>(null);
  const t = today();
  const sessions = useMemo(() => (member ? buildSessions(member, t) : []), [member, t]);
  if (!member) return null;
  if (!isTrainee(member)) {
    return (
      <div className="page">
        <div className="card">
          <p>{member.name} is a supervisor only, so there’s no training plan. Change the role to “Trains + supervises” in Settings to get one.</p>
        </div>
      </div>
    );
  }
  const phase = currentPhase(member, t);
  const week = Math.floor(daysBetween(member.startDate, t) / 7) + 1;
  const fragile = member.cautions.spineFragile || member.cautions.hipFragile;
  const templates = templatesFor(member);

  return (
    <div className="page">
      <h1 className="page-title">{member.avatar} {member.name}’s plan</h1>
      <div className="card card-accent">
        <div className="muted small">Week {Math.max(1, week)}</div>
        <h2 className="m0">{PHASE_INFO[phase].name}</h2>
        <p className="small">{PHASE_INFO[phase].desc}</p>
        <div className="seg">
          {([1, 2, 3] as Phase[]).map((p) => (
            <button
              key={p}
              className={`seg-btn ${phase === p ? 'active' : ''}`}
              onClick={() =>
                update((s) => {
                  const m = s.members.find((x) => x.id === member.id)!;
                  m.phaseOverride = m.phaseOverride === p ? undefined : p;
                })
              }
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
          <span className="tag">{member.place === 'gym' ? '🏋️ Gym' : '🏠 Home'}</span>
          {member.place === 'home' &&
            (member.equipment.length ? member.equipment.map((e) => <span key={e} className="tag">{EQUIPMENT_NAMES[e]}</span>) : <span className="tag">Bodyweight</span>)}
        </div>
        <p className="small m0">
          Training days: {member.trainingDays.length ? [...member.trainingDays].sort().map((d) => WEEKDAY_NAMES[d]).join(', ') : 'not set'}. Workouts A and B alternate.
        </p>
      </div>

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

      {sessions.map((s, si) => (
        <div key={s.key} className="card">
          <h3 className="m0">{s.title}</h3>
          <div className="muted small">{s.focus}</div>
          {s.items.map((item) => {
            const ex = EXERCISE_MAP[item.exerciseId];
            const pattern = templates[si].slots[item.slot];
            return (
              <div key={item.slot} className="plan-item">
                <button className="ex-demo-btn" onClick={() => setDetail(ex.id)} aria-label="Exercise details">
                  <ExerciseDemo ex={ex} size="sm" />
                </button>
                <div className="ex-info">
                  <div className="muted small">{PATTERN_NAMES[pattern]}</div>
                  <b>{ex.name}</b>
                  <div className="ex-dose">
                    {item.sets} sets × {item.reps}
                  </div>
                  {item.candidates.length > 1 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        update((st) => {
                          const m = st.members.find((x) => x.id === member.id)!;
                          const i = item.candidates.indexOf(ex.id);
                          m.swaps[`${s.key}-${item.slot}`] = item.candidates[(i + 1) % item.candidates.length];
                        })
                      }
                    >
                      🔄 Swap ({item.candidates.length} options)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {Object.keys(member.swaps).length > 0 && (
        <button
          className="btn btn-ghost"
          onClick={() => update((s) => void (s.members.find((x) => x.id === member.id)!.swaps = {}))}
        >
          Reset to recommended exercises
        </button>
      )}
      <p className="muted small">
        Based on ACSM and International Osteoporosis Foundation guidance (2–3 sessions a week of progressive resistance, impact and balance
        training) and the LIFTMOR trial (8 months of high-intensity resistance and impact training raised spine BMD by about 2.9%). This app does
        not replace advice from a doctor or physio.
      </p>
      {detail && <ExerciseDetail ex={EXERCISE_MAP[detail]} onClose={() => setDetail(null)} />}
    </div>
  );
}
