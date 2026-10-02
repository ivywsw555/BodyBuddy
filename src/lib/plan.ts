import { EXERCISES, EXERCISE_MAP } from '../data/exercises';
import type { Equipment, Exercise, Goal, Member, Pattern, Phase, PlannedExercise, Session } from '../types';
import { daysBetween } from './date';
import { fitToCap, HARD_MINUTES_CAP } from './load';

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
  dumbbell: 'Dumbbells',
  band: 'Resistance band',
  barbell: 'Barbell + rack',
  bench: 'Bench',
  pullupbar: 'Pull-up bar',
  cable: 'Cable machine',
  machine: 'Machines (leg press, back extension…)',
  jumprope: 'Jump rope',
};

export const GOAL_NAMES: Record<Goal, string> = {
  bone: 'Bone density',
  muscle: 'Build muscle',
  posture: 'Neck, shoulder & back',
  fitness: 'Fitness & immunity',
};

export const PATTERN_NAMES: Record<Pattern, string> = {
  squat: 'Squat',
  hinge: 'Hinge',
  lunge: 'Single leg / lunge',
  push_h: 'Horizontal push',
  push_v: 'Vertical push',
  pull_h: 'Horizontal pull',
  pull_v: 'Vertical pull',
  impact: 'Impact',
  back_ext: 'Back extensors',
  core: 'Core',
  carry: 'Loaded carry',
  balance: 'Balance',
  neck: 'Neck',
  scap: 'Shoulder blades',
  tspine: 'Upper-back mobility',
  conditioning: 'Cardio',
};

export const PHASE_INFO: Record<Phase, { name: string; desc: string }> = {
  1: { name: 'Phase 1 · Foundation', desc: 'Weeks 1–4: learn the moves with light weights and build the habit' },
  2: { name: 'Phase 2 · Progressive loading', desc: 'Weeks 5–12: add a little weight each week' },
  3: { name: 'Phase 3 · Strength', desc: 'Week 13 on: heavy, low-rep lifting plus impact work (low bone density needs doctor clearance)' },
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

/** With low bone density and no doctor clearance, heavy (tier 3) and high-impact moves stay locked */
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

/** Every exercise this person can do for a pattern (easiest to hardest) */
export function candidatesFor(pattern: Pattern, m: Member): Exercise[] {
  return EXERCISES.filter((e) => e.pattern === pattern && hasEquipment(e, m) && !isAvoided(e, m));
}

function pick(pattern: Pattern, m: Member, phase: Phase, exclude: Set<string>, prefer?: string): Exercise | undefined {
  const cap = tierCap(m, phase);
  const list = candidatesFor(pattern, m).filter((e) => !exclude.has(e.id));
  const preferred = prefer && list.find((e) => e.id === prefer);
  if (preferred) return preferred;
  const allowed = list.filter((e) => e.tier <= cap);
  return allowed[allowed.length - 1] ?? list[0];
}

/** A slot is a movement pattern, optionally with a preferred exercise (e.g. dead bug vs bird dog for core) */
type Slot = Pattern | { pattern: Pattern; prefer: string };
type Template = { key: string; title: string; focus: string; slots: Slot[] };

const slotPattern = (s: Slot): Pattern => (typeof s === 'string' ? s : s.pattern);

/** Core work is always anti-movement, dead-bug style in A and bird-dog style in B (no crunches) */
const CORE_A: Slot = { pattern: 'core', prefer: 'dead_bug' };
const CORE_B: Slot = { pattern: 'core', prefer: 'bird_dog' };

function primaryGoal(goals: Goal[]): Goal {
  for (const g of ['bone', 'muscle', 'posture', 'fitness'] as Goal[]) if (goals.includes(g)) return g;
  return 'fitness';
}

export { slotPattern };

export function templatesFor(m: Member): Template[] {
  // Bone plans follow the ROS "Strong, Steady and Straight" consensus and Osteoporosis Canada "Too Fit to Fracture"
  const primary = primaryGoal(m.goals);
  let base: Template[];
  switch (primary) {
    case 'bone':
      base = [
        {
          key: 'A',
          title: 'Workout A · Strong (squat + press)',
          focus: 'Impact + hip/spine loading + back extensors (ROS Strong & Straight)',
          slots: ['impact', 'squat', 'push_v', 'pull_h', 'back_ext', CORE_A, 'balance'],
        },
        {
          key: 'B',
          title: 'Workout B · Strong (hinge + step-up)',
          focus: 'Impact + hip loading + loaded carry (ROS Strong & Steady)',
          slots: ['impact', 'hinge', 'lunge', 'push_h', 'pull_v', 'carry', CORE_B],
        },
      ];
      break;
    case 'muscle':
      base = [
        { key: 'A', title: 'Workout A · Full body (squat day)', focus: 'Legs + chest and back', slots: ['squat', 'push_h', 'pull_h', 'lunge', CORE_A] },
        { key: 'B', title: 'Workout B · Full body (hinge day)', focus: 'Posterior chain + shoulders and back', slots: ['hinge', 'push_v', 'pull_v', 'balance', CORE_B] },
      ];
      break;
    case 'posture':
      base = [
        { key: 'A', title: 'Workout A · Neck & shoulder rehab', focus: 'Deep neck flexors + shoulder-blade control', slots: ['neck', 'tspine', 'scap', 'scap', 'pull_h', CORE_A] },
        { key: 'B', title: 'Workout B · Back strength', focus: 'Back extensors + rotator cuff', slots: ['neck', 'tspine', 'scap', 'pull_v', 'back_ext', CORE_B] },
      ];
      break;
    default:
      base = [
        { key: 'A', title: 'Workout A · Fitness circuit', focus: 'Full body + cardio', slots: ['squat', 'push_h', 'pull_h', 'conditioning', CORE_A] },
        { key: 'B', title: 'Workout B · Fitness circuit', focus: 'Full body + cardio', slots: ['lunge', 'push_v', 'pull_v', 'conditioning', CORE_B] },
      ];
  }
  return base.map((t) => {
    const slots = [...t.slots];
    const has = (p: Pattern) => slots.some((s) => slotPattern(s) === p);
    if (primary !== 'bone' && m.goals.includes('bone')) {
      if (!has('impact')) slots.unshift('impact');
      if (!has('back_ext')) slots.push('back_ext');
    }
    if (primary !== 'posture' && (m.goals.includes('posture') || m.cautions.neckShoulderPain)) {
      // neck/shoulder issues: put these first as a warm-up
      if (!has('neck')) slots.unshift('neck');
      if (!has('scap')) slots.splice(1, 0, 'scap');
    }
    if (primary !== 'fitness' && m.goals.includes('fitness') && !has('conditioning')) {
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
    if (ex.unit === 'sec') return { sets: [3, 4, 5][phase - 1], reps: '30 s', restSec: 60 };
    return {
      sets: 5,
      reps: '10 reps',
      restSec: 45,
      note: 'Do impact work first, while you’re fresh. ROS aims for about 50 impacts per leg on most days',
    };
  }
  if (STRENGTH.includes(p)) {
    const perSide = p === 'lunge' || ex.id === 'db_row' ? ' each side' : '';
    if (boneFirst) {
      // ROS Strong: learn the move, then 3 sets of up to 8 reps as heavy as good form allows
      if (phase === 1) return { sets: 2, reps: `10-12 reps${perSide}`, restSec: 90, note: 'ROS Stage 1: learn the move; you could do 3–4 more reps' };
      if (phase === 2) return { sets: 3, reps: `8-10 reps${perSide}`, restSec: 120, note: 'ROS Stage 2: the last rep should be hard; add weight when it isn’t' };
      if (m.cautions.cleared) return { sets: 5, reps: `5 reps${perSide}`, restSec: 180, note: 'About 80-85% of max, following the LIFTMOR study protocol' };
      return { sets: 3, reps: `up to 8 reps${perSide}`, restSec: 150, note: 'ROS Stage 3: as heavy as good form allows' };
    }
    return [
      { sets: 2, reps: `12-15 reps${perSide}`, restSec: 60, note: 'Light weight while you learn the move' },
      { sets: 3, reps: `10-12 reps${perSide}`, restSec: 90, note: 'The last 2 reps should feel hard' },
      { sets: 4, reps: `8-10 reps${perSide}`, restSec: 120, note: 'Keep adding weight gradually' },
    ][phase - 1];
  }
  if (p === 'carry') return { sets: [2, 3, 4][phase - 1], reps: '30 m', restSec: 90 };
  if (p === 'conditioning') {
    if (ex.id === 'mountain_climbers') return { sets: [3, 4, 5][phase - 1], reps: '30 s', restSec: 30 };
    return { sets: 1, reps: ['15 min', '20 min', '25 min'][phase - 1], restSec: 0 };
  }
  if (p === 'neck' || p === 'scap' || p === 'tspine') {
    if (ex.unit === 'sec') return { sets: 2, reps: '4 directions × 10 s', restSec: 30 };
    return { sets: [2, 3, 3][phase - 1], reps: ex.id === 'prone_ytw' ? '5 per letter' : '12-15 reps', restSec: 30 };
  }
  if (ex.id === 'heel_toe_walk') return { sets: [2, 3, 3][phase - 1], reps: '10 steps', restSec: 30 };
  // core / back_ext / balance
  if (ex.unit === 'sec') return { sets: [2, 3, 3][phase - 1], reps: ['20 s', '30 s', '45 s'][phase - 1], restSec: 45 };
  return { sets: [2, 3, 3][phase - 1], reps: ['8 reps', '10 reps', '12 reps'][phase - 1], restSec: 45 };
}

export function buildSessions(m: Member, todayStr: string): Session[] {
  const phase = currentPhase(m, todayStr);
  const lighter = !!m.lightenUntil && todayStr <= m.lightenUntil;
  return templatesFor(m).map((t) => {
    const used = new Set<string>();
    const items: PlannedExercise[] = [];
    t.slots.forEach((spec, slot) => {
      const pattern = slotPattern(spec);
      const swapId = m.swaps[`${t.key}-${slot}`];
      const swapped = swapId ? EXERCISE_MAP[swapId] : undefined;
      const ex =
        swapped && swapped.pattern === pattern && hasEquipment(swapped, m) && !isAvoided(swapped, m)
          ? swapped
          : pick(pattern, m, phase, used, typeof spec === 'string' ? undefined : spec.prefer);
      if (!ex) return;
      used.add(ex.id);
      const d = dose(ex, m, phase);
      if (lighter && ex.pattern !== 'conditioning') {
        d.sets = Math.max(1, d.sets - 1);
        d.note = `Lighter week: one set fewer. ${d.note ?? ''}`.trim();
      }
      items.push({
        exerciseId: ex.id,
        slot,
        ...d,
        candidates: candidatesFor(pattern, m).map((e) => e.id),
      });
    });
    return fitToCap({ key: t.key, title: t.title, focus: t.focus, items }, HARD_MINUTES_CAP[phase]);
  });
}

/** Which workout is next: rotate A/B by completed sessions */
export function nextSession(sessions: Session[], completedCount: number): Session {
  return sessions[completedCount % sessions.length];
}
