import { EXERCISES, EXERCISE_MAP } from '../data/exercises';
import type { Equipment, Exercise, Goal, Member, Pattern, Phase, PlannedExercise, Session } from '../types';
import { daysBetween } from './date';

export const ALL_EQUIPMENT: Equipment[] = [
  'dumbbell',
  'band',
  'barbell',
  'bench',
  'pullupbar',
  'cable',
  'machine',
  'jumprope',
];

export const EQUIPMENT_NAMES: Record<Equipment, string> = {
  dumbbell: '哑铃',
  band: '弹力带',
  barbell: '杠铃+深蹲架',
  bench: '卧推凳',
  pullupbar: '单杠',
  cable: '龙门架/绳索',
  machine: '器械（腿举、罗马椅等）',
  jumprope: '跳绳',
};

export const GOAL_NAMES: Record<Goal, string> = {
  bone: '提升骨密度',
  muscle: '全身增肌',
  posture: '肩颈背改善',
  fitness: '体能/免疫力',
};

export const PATTERN_NAMES: Record<Pattern, string> = {
  squat: '深蹲',
  hinge: '髋铰链',
  lunge: '单腿/弓步',
  push_h: '水平推',
  push_v: '垂直推',
  pull_h: '水平拉',
  pull_v: '垂直拉',
  impact: '冲击训练',
  back_ext: '背伸肌',
  core: '核心',
  carry: '负重行走',
  balance: '平衡',
  neck: '颈部',
  scap: '肩胛稳定',
  tspine: '胸椎活动',
  conditioning: '有氧体能',
};

export const PHASE_INFO: Record<Phase, { name: string; desc: string }> = {
  1: { name: '第一阶段 · 适应期', desc: '第 1-4 周：学动作、轻重量，建立习惯' },
  2: { name: '第二阶段 · 渐进加载', desc: '第 5-12 周：逐步加重，每周比上周多一点' },
  3: { name: '第三阶段 · 强化期', desc: '第 13 周起：大重量低次数 + 冲击训练（骨量低者需医生许可）' },
};

export function availableEquipment(m: Member): Set<Equipment> {
  return new Set(m.place === 'gym' ? ALL_EQUIPMENT : m.equipment);
}

export function currentPhase(m: Member, todayStr: string): Phase {
  if (m.phaseOverride) return m.phaseOverride;
  const week = Math.floor(daysBetween(m.startDate, todayStr) / 7) + 1;
  if (week <= 4) return 1;
  if (week <= 12) return 2;
  return 3;
}

/** 骨量低且没有医生许可时，大重量（tier 3）和高冲击（impact 3）不开放 */
function tierCap(m: Member, phase: Phase): number {
  const fragile = m.cautions.spineFragile || m.cautions.hipFragile;
  let cap: number = phase;
  if (m.level === 'beginner' && phase === 3) cap = 2;
  if (fragile && !m.cautions.cleared) cap = Math.min(cap, 2);
  return cap;
}

export function isAvoided(ex: Exercise, m: Member): boolean {
  return (ex.avoidIf ?? []).some((c) => m.cautions[c]);
}

export function hasEquipment(ex: Exercise, m: Member): boolean {
  const eq = availableEquipment(m);
  return ex.equip.every((e) => eq.has(e));
}

/** 某个动作模式下，此人能做的全部动作（从易到难） */
export function candidatesFor(pattern: Pattern, m: Member): Exercise[] {
  return EXERCISES.filter((e) => e.pattern === pattern && hasEquipment(e, m) && !isAvoided(e, m));
}

function pick(pattern: Pattern, m: Member, phase: Phase, exclude: Set<string>): Exercise | undefined {
  const cap = tierCap(m, phase);
  const list = candidatesFor(pattern, m).filter((e) => !exclude.has(e.id));
  const allowed = list.filter((e) => e.tier <= cap);
  return allowed[allowed.length - 1] ?? list[0];
}

type Template = { key: string; title: string; focus: string; slots: Pattern[] };

function primaryGoal(goals: Goal[]): Goal {
  for (const g of ['bone', 'muscle', 'posture', 'fitness'] as Goal[]) if (goals.includes(g)) return g;
  return 'fitness';
}

export function templatesFor(m: Member): Template[] {
  const primary = primaryGoal(m.goals);
  let base: Template[];
  switch (primary) {
    case 'bone':
      base = [
        { key: 'A', title: '训练 A · 骨骼加载（下蹲+推举）', focus: '冲击 + 轴向负荷 + 背伸肌', slots: ['impact', 'squat', 'push_v', 'pull_h', 'back_ext', 'core', 'balance'] },
        { key: 'B', title: '训练 B · 骨骼加载（硬拉+负重）', focus: '冲击 + 髋部负荷 + 负重行走', slots: ['impact', 'hinge', 'lunge', 'push_h', 'pull_v', 'carry', 'core'] },
      ];
      break;
    case 'muscle':
      base = [
        { key: 'A', title: '训练 A · 全身（深蹲日）', focus: '下肢 + 胸背', slots: ['squat', 'push_h', 'pull_h', 'lunge', 'core'] },
        { key: 'B', title: '训练 B · 全身（硬拉日）', focus: '后链 + 肩背', slots: ['hinge', 'push_v', 'pull_v', 'balance', 'core'] },
      ];
      break;
    case 'posture':
      base = [
        { key: 'A', title: '训练 A · 肩颈修复', focus: '颈深屈肌 + 肩胛稳定', slots: ['neck', 'tspine', 'scap', 'scap', 'pull_h', 'core'] },
        { key: 'B', title: '训练 B · 背部强化', focus: '背伸肌 + 肩袖', slots: ['neck', 'tspine', 'scap', 'pull_v', 'back_ext', 'core'] },
      ];
      break;
    default:
      base = [
        { key: 'A', title: '训练 A · 体能循环', focus: '全身 + 心肺', slots: ['squat', 'push_h', 'pull_h', 'conditioning', 'core'] },
        { key: 'B', title: '训练 B · 体能循环', focus: '全身 + 心肺', slots: ['lunge', 'push_v', 'pull_v', 'conditioning', 'core'] },
      ];
  }
  return base.map((t) => {
    const slots = [...t.slots];
    if (primary !== 'bone' && m.goals.includes('bone')) {
      if (!slots.includes('impact')) slots.unshift('impact');
      if (!slots.includes('back_ext')) slots.push('back_ext');
    }
    if (primary !== 'posture' && (m.goals.includes('posture') || m.cautions.neckShoulderPain)) {
      // 肩颈问题：作为热身放在前面
      if (!slots.includes('neck')) slots.unshift('neck');
      if (!slots.includes('scap')) slots.splice(1, 0, 'scap');
    }
    if (primary !== 'fitness' && m.goals.includes('fitness') && !slots.includes('conditioning')) {
      slots.push('conditioning');
    }
    return { ...t, slots };
  });
}

const STRENGTH: Pattern[] = ['squat', 'hinge', 'lunge', 'push_h', 'push_v', 'pull_h', 'pull_v'];

export function dose(
  ex: Exercise,
  m: Member,
  phase: Phase,
): { sets: number; reps: string; restSec: number; note?: string } {
  const p = ex.pattern;
  const boneFirst = primaryGoal(m.goals) === 'bone';
  if (p === 'impact') {
    if (ex.unit === 'sec') return { sets: [3, 4, 5][phase - 1], reps: '30秒', restSec: 60 };
    return {
      sets: [3, 4, 5][phase - 1],
      reps: '10次',
      restSec: 60,
      note: '冲击训练放在最开始、精力最好的时候做',
    };
  }
  if (STRENGTH.includes(p)) {
    const perSide = p === 'lunge' || ex.id === 'db_row' ? '（每侧）' : '';
    if (boneFirst) {
      const s = [
        { sets: 2, reps: `10-12次${perSide}`, restSec: 90, note: 'RPE 6：做完还能再做 4 次，专心学动作' },
        { sets: 3, reps: `8次${perSide}`, restSec: 120, note: 'RPE 7-8：每周尝试加一点重量' },
        { sets: 5, reps: `5次${perSide}`, restSec: 180, note: '约 80-85% 最大重量，参考 LIFTMOR 研究方案' },
      ][phase - 1];
      return s;
    }
    return [
      { sets: 2, reps: `12-15次${perSide}`, restSec: 60, note: '轻重量熟悉动作' },
      { sets: 3, reps: `10-12次${perSide}`, restSec: 90, note: '最后 2 次要有点吃力' },
      { sets: 4, reps: `8-10次${perSide}`, restSec: 120, note: '逐步加重' },
    ][phase - 1];
  }
  if (p === 'carry') return { sets: [2, 3, 4][phase - 1], reps: '30米', restSec: 90 };
  if (p === 'conditioning') {
    if (ex.id === 'mountain_climbers') return { sets: [3, 4, 5][phase - 1], reps: '30秒', restSec: 30 };
    return { sets: 1, reps: ['15分钟', '20分钟', '25分钟'][phase - 1], restSec: 0 };
  }
  if (p === 'neck' || p === 'scap' || p === 'tspine') {
    if (ex.unit === 'sec') return { sets: 2, reps: '4个方向×10秒', restSec: 30 };
    return { sets: [2, 3, 3][phase - 1], reps: ex.id === 'prone_ytw' ? '每个字母5次' : '12-15次', restSec: 30 };
  }
  // core / back_ext / balance
  if (ex.unit === 'sec') return { sets: [2, 3, 3][phase - 1], reps: ['20秒', '30秒', '45秒'][phase - 1], restSec: 45 };
  return { sets: [2, 3, 3][phase - 1], reps: ['8次', '10次', '12次'][phase - 1], restSec: 45 };
}

export function buildSessions(m: Member, todayStr: string): Session[] {
  const phase = currentPhase(m, todayStr);
  return templatesFor(m).map((t) => {
    const used = new Set<string>();
    const items: PlannedExercise[] = [];
    t.slots.forEach((pattern, slot) => {
      const swapId = m.swaps[`${t.key}-${slot}`];
      const swapped = swapId ? EXERCISE_MAP[swapId] : undefined;
      const ex =
        swapped && swapped.pattern === pattern && hasEquipment(swapped, m) && !isAvoided(swapped, m)
          ? swapped
          : pick(pattern, m, phase, used);
      if (!ex) return;
      used.add(ex.id);
      items.push({
        exerciseId: ex.id,
        slot,
        ...dose(ex, m, phase),
        candidates: candidatesFor(pattern, m).map((e) => e.id),
      });
    });
    return { key: t.key, title: t.title, focus: t.focus, items };
  });
}

/** 下一次该练哪一套：按已完成训练次数轮换 A/B */
export function nextSession(sessions: Session[], completedCount: number): Session {
  return sessions[completedCount % sessions.length];
}
