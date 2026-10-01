import { useState } from 'react';
import { EXERCISES } from '../data/exercises';
import { EQUIPMENT_NAMES, hasEquipment, isAvoided, PATTERN_NAMES } from '../lib/plan';
import { useMember } from '../store';
import { ExerciseDemo, ExerciseDetail } from '../components/ExerciseDemo';
import type { Exercise } from '../types';

const TAGS = ['全部', '骨密度', '增肌', '体态', '核心', '平衡', '体能'] as const;

export function LibraryPage() {
  const member = useMember();
  const [tag, setTag] = useState<(typeof TAGS)[number]>('全部');
  const [onlyMine, setOnlyMine] = useState(false);
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<Exercise | null>(null);

  const list = EXERCISES.filter(
    (e) =>
      (tag === '全部' || e.tags.includes(tag)) &&
      (!q || e.name.includes(q) || e.en.toLowerCase().includes(q.toLowerCase())) &&
      (!onlyMine || !member || (hasEquipment(e, member) && !isAvoided(e, member))),
  );

  return (
    <div className="page">
      <h1 className="page-title">📚 动作库</h1>
      <input className="search" placeholder="搜索动作…" value={q} onChange={(e) => setQ(e.target.value)} />
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
          只看 {member.name} 现在能做的（器械 + 身体情况）
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
                {PATTERN_NAMES[e.pattern]} · {e.equip.length ? e.equip.map((x) => EQUIPMENT_NAMES[x]).join('+') : '徒手'}
              </span>
              {avoided && <span className="small bad">⚠️ 当前身体情况不建议</span>}
            </button>
          );
        })}
      </div>
      <p className="muted small">
        示意图来自开源动作库 free-exercise-db（公共领域）。没有图的动作可以点开后看 B 站/YouTube 视频，也可以把你们觉得最好的 Keep/B 站视频链接设置进去。
      </p>
      {detail && <ExerciseDetail ex={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
