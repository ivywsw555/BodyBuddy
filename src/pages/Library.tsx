import { useState } from 'react';
import { EXERCISES } from '../data/exercises';
import { EQUIPMENT_NAMES, hasEquipment, isAvoided, PATTERN_NAMES } from '../lib/plan';
import { useMember } from '../store';
import { ExerciseDemo, ExerciseDetail } from '../components/ExerciseDemo';
import type { Exercise } from '../types';

const TAGS = ['All', 'Bone', 'Muscle', 'Posture', 'Core', 'Balance', 'Fitness'] as const;

export function LibraryPage() {
  const member = useMember();
  const [tag, setTag] = useState<(typeof TAGS)[number]>('All');
  const [onlyMine, setOnlyMine] = useState(false);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<Exercise | null>(null);

  const list = EXERCISES.filter(
    (e) =>
      (tag === 'All' || e.tags.includes(tag)) &&
      (!q || e.name.toLowerCase().includes(q.toLowerCase()) || e.zh.includes(q)) &&
      (!onlyMine || !member || (hasEquipment(e, member) && !isAvoided(e, member))),
  );

  return (
    <div className="page">
      <h1 className="page-title">📚 Exercise library</h1>
      <input className="search" placeholder="Search exercises…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips">
        {TAGS.map((t) => (
          <button key={t} className={`chip ${tag === t ? 'active' : ''}`} onClick={() => setTag(t)}>
            {t}
          </button>
        ))}
      </div>
      {member && (
        <label className="check small">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Only show what {member.name} can do now (equipment + body condition)
        </label>
      )}
      <div className="lib-grid">
        {list.map((e) => {
          const avoided = member ? isAvoided(e, member) : false;
          return (
            <button key={e.id} className={`lib-item ${avoided ? 'avoided' : ''}`} onClick={() => setDetail(e)}>
              <ExerciseDemo ex={e} size="sm" />
              <b>{e.name}</b>
              <span className="muted small">
                {PATTERN_NAMES[e.pattern]} · {e.equip.length ? e.equip.map((x) => EQUIPMENT_NAMES[x]).join(' + ') : 'Bodyweight'}
              </span>
              {avoided && <span className="small bad">⚠️ Not advised for current condition</span>}
            </button>
          );
        })}
      </div>
      <p className="muted small">
        Demo images come from the open-source free-exercise-db (public domain). For moves without a picture, open them to find YouTube or Bilibili videos, or save the best Keep/Bilibili link you find.
      </p>
      {detail && <ExerciseDetail ex={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
