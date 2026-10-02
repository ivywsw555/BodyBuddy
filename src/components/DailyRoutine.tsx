import { useState } from 'react';
import type { Member } from '../types';
import { EXERCISE_MAP } from '../data/exercises';
import { dailyKey, dailyRoutine, dailyStreak, WEEKLY_WALK_GOAL, weekWalkMinutes, type Pillar } from '../lib/daily';
import { today, uid } from '../lib/date';
import { useStore } from '../store';
import { ExerciseDetail } from './ExerciseDemo';

const PILLAR_CLASS: Record<Pillar, string> = { Straight: 'pillar-straight', Steady: 'pillar-steady', Strong: 'pillar-strong' };

/** 5–10 minutes most days: ROS "Straight" posture work, "Steady" balance and daily impact */
export function DailyCard({ member, mode = 'rest', skip }: { member: Member; mode?: 'rest' | 'warmup' | 'leftover'; skip?: string[] }) {
  const { state, update } = useStore();
  const [detail, setDetail] = useState<string | null>(null);
  // In warm-up mode, moves that are already in today's workout aren't repeated
  const items = dailyRoutine(member).filter((i) => !skip?.includes(i.exerciseId));
  if (!items.length) return null;
  const t = today();
  const key = dailyKey(member.id, t);
  const done = new Set(state.daily[key] ?? []);
  const streak = dailyStreak(state, member, t);
  const doneN = items.filter((i) => done.has(i.exerciseId)).length;
  const pillars = [...new Set(items.map((i) => i.pillar))];

  function toggle(id: string) {
    update((s) => {
      const cur = new Set(s.daily[key] ?? []);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      s.daily[key] = [...cur];
    });
  }

  return (
    <div className="card">
      <div className="row-between">
        <h3 className="m0">{mode === 'warmup' ? '🔥 Warm-up: your daily moves' : mode === 'leftover' ? '☀️ Daily moves left' : `☀️ Daily 10 min · ${pillars.join(' & ')}`}</h3>
        <span className={`pill ${doneN >= items.length ? 'pill-ok' : ''}`}>
          {doneN}/{items.length}
        </span>
      </div>
      <p className="muted small m0">
        {
          {
            warmup: 'Start with 5 minutes of brisk walking or marching in place, then these. They count as today’s daily routine. ',
            leftover: 'These weren’t in today’s workout. Fit them in any time today to keep the streak. ',
            rest: 'Rest day: just these 10 minutes today. ',
          }[mode]
        }
        {streak > 0 ? `🔥 ${streak}-day streak.` : 'Finish all of them to start a streak.'}
      </p>
      <ul className="daily">
        {items.map((it) => {
          const ex = EXERCISE_MAP[it.exerciseId];
          return (
            <li key={it.exerciseId} className={done.has(it.exerciseId) ? 'is-done' : ''}>
              <button className={`daily-check ${done.has(it.exerciseId) ? 'checked' : ''}`} onClick={() => toggle(it.exerciseId)} aria-label={`Mark ${ex.name} done`}>
                {done.has(it.exerciseId) ? '✓' : ''}
              </button>
              <button className="daily-name" onClick={() => setDetail(ex.id)}>
                <b>{ex.name}</b>
                <span className="muted small"> · {it.dose}</span>
              </button>
              <span className={`pillar ${PILLAR_CLASS[it.pillar]}`}>{it.pillar}</span>
            </li>
          );
        })}
      </ul>
      {detail && <ExerciseDetail ex={EXERCISE_MAP[detail]} onClose={() => setDetail(null)} />}
    </div>
  );
}

/** Weight-bearing cardio toward 150 minutes a week (brisk walking, stairs, Nordic walking) */
export function WalkCard({ member }: { member: Member }) {
  const { state, update } = useStore();
  const t = today();
  const minutes = weekWalkMinutes(state, member.id, t);
  const todays = state.walks.filter((w) => w.memberId === member.id && w.date === t);
  const add = (n: number) => update((s) => void s.walks.push({ id: uid(), memberId: member.id, date: t, minutes: n }));

  return (
    <div className="card">
      <div className="row-between">
        <h3 className="m0">🚶 Walking this week</h3>
        <span className={`pill ${minutes >= WEEKLY_WALK_GOAL ? 'pill-ok' : ''}`}>
          {minutes}/{WEEKLY_WALK_GOAL} min
        </span>
      </div>
      <div className="progress">
        <div style={{ width: `${Math.min(1, minutes / WEEKLY_WALK_GOAL) * 100}%` }} />
      </div>
      <p className="muted small m0">Brisk walking, stairs or Nordic walking, counting the walk in your workout. Aim for 150 minutes a week.</p>
      <div className="row wrap">
        {[10, 20, 30].map((n) => (
          <button key={n} className="btn btn-sm" onClick={() => add(n)}>
            +{n} min
          </button>
        ))}
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            const n = Number(prompt('Minutes walked today'));
            if (Number.isFinite(n) && n > 0) add(Math.round(n));
          }}
        >
          Other…
        </button>
        {todays.length > 0 && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              const last = todays[todays.length - 1];
              update((s) => void (s.walks = s.walks.filter((w) => w.id !== last.id)));
            }}
          >
            Undo last
          </button>
        )}
      </div>
    </div>
  );
}
