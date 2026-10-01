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
          <p>{member.name} 目前是纯监督者，没有训练计划。可以在「设置」里把角色改成「训练+监督」。</p>
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
      <h1 className="page-title">{member.avatar} {member.name} 的训练计划</h1>
      <div className="card card-accent">
        <div className="muted small">第 {Math.max(1, week)} 周</div>
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
              阶段{p}
            </button>
          ))}
        </div>
        <p className="muted small m0">
          {member.phaseOverride ? '已手动锁定阶段，再点一次恢复自动。' : '阶段按开始日期自动推进，也可以手动锁定。'}
        </p>
        <div className="tags">
          {member.goals.map((g) => (
            <span key={g} className="tag">{GOAL_NAMES[g]}</span>
          ))}
          <span className="tag">{member.place === 'gym' ? '🏋️ 健身房' : '🏠 在家'}</span>
          {member.place === 'home' &&
            (member.equipment.length ? member.equipment.map((e) => <span key={e} className="tag">{EQUIPMENT_NAMES[e]}</span>) : <span className="tag">徒手</span>)}
        </div>
        <p className="small m0">
          每周训练日：{member.trainingDays.length ? [...member.trainingDays].sort().map((d) => WEEKDAY_NAMES[d]).join('、') : '未设置'}，A/B 两套轮换。
        </p>
      </div>

      {fragile && (
        <div className="card card-warn">
          <h3 className="m0">🦴 骨量低训练原则</h3>
          <ul className="small">
            <li>先找医生/康复师确认可以进行抗阻和冲击训练；有骨折史请先就医。</li>
            <li>冲击训练从「踮脚落跟」开始，逐步到小跳。{member.cautions.cleared ? '已获许可，第三阶段开放深蹲跳。' : '未在设置中勾选「已获医生许可」前，不安排大重量和高冲击动作。'}</li>
            <li>所有动作保持脊柱中立，背伸肌训练每次都要做。</li>
            <li>以下动作不会出现在计划里：</li>
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
                <button className="ex-demo-btn" onClick={() => setDetail(ex.id)} aria-label="查看动作详情">
                  <ExerciseDemo ex={ex} size="sm" />
                </button>
                <div className="ex-info">
                  <div className="muted small">{PATTERN_NAMES[pattern]}</div>
                  <b>{ex.name}</b>
                  <div className="ex-dose">
                    {item.sets} 组 × {item.reps}
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
                      🔄 换一个（{item.candidates.length} 选 1）
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
          恢复推荐动作
        </button>
      )}
      <p className="muted small">
        计划依据：ACSM/国际骨质疏松基金会建议（每周 2-3 次渐进抗阻 + 冲击 + 平衡训练），以及 LIFTMOR 研究（高强度抗阻与冲击训练 8 个月腰椎 BMD
        约 +2.9%）。本应用不能替代医生和康复师的意见。
      </p>
      {detail && <ExerciseDetail ex={EXERCISE_MAP[detail]} onClose={() => setDetail(null)} />}
    </div>
  );
}
