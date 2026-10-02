export type Role = 'trainee' | 'supervisor' | 'both';
export type Goal = 'bone' | 'muscle' | 'posture' | 'fitness';
/** 'both' = home and gym: only moves that work with the home equipment, so the same workout runs anywhere */
export type Place = 'gym' | 'home' | 'both';
export type Equipment =
  | 'dumbbell'
  | 'band'
  | 'barbell'
  | 'bench'
  | 'pullupbar'
  | 'cable'
  | 'machine'
  | 'jumprope';
export type Level = 'beginner' | 'intermediate';
export type Phase = 1 | 2 | 3;

export type Pattern =
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'push_h'
  | 'push_v'
  | 'pull_h'
  | 'pull_v'
  | 'impact'
  | 'back_ext'
  | 'core'
  | 'carry'
  | 'balance'
  | 'neck'
  | 'scap'
  | 'tspine'
  | 'conditioning';

export interface Cautions {
  /** Low spinal bone density (DEXA yellow/red): no loaded flexion or twisting, impact builds up gradually */
  spineFragile: boolean;
  /** Low hip bone density */
  hipFragile: boolean;
  /** Frequent neck, shoulder or upper-back aches */
  neckShoulderPain: boolean;
  /** Knee discomfort: fewer jumps */
  kneeIssue: boolean;
  /** Cleared by a doctor/physio for heavy lifting and high-impact work */
  cleared: boolean;
}

export interface Member {
  id: string;
  name: string;
  avatar: string;
  role: Role;
  goals: Goal[];
  place: Place;
  equipment: Equipment[];
  /** 0 = Sunday ... 6 = Saturday */
  trainingDays: number[];
  level: Level;
  cautions: Cautions;
  /** Plan start date, used to work out the phase */
  startDate: string;
  phaseOverride?: Phase;
  /** Member who supervises this person */
  supervisorId?: string;
  /** Manual exercise swaps in the plan: key = `${session}-${slotIndex}` */
  swaps: Record<string, string>;
  /** Lighter sessions (one set fewer) through this date, after a weekly review said it was too much */
  lightenUntil?: string;
  /** Supervisor's changes to planned exercises: key = `${session}-${slotIndex}` */
  planEdits?: Record<string, PlanEdit>;
  /** Exercises the supervisor added, per session key */
  planExtras?: Record<string, PlanExtra[]>;
  /** Note from the supervisor shown on Plan and Today */
  planNote?: string;
  planEditedBy?: string;
  planEditedAt?: string;
}

export interface PlanEdit {
  sets?: number;
  reps?: string;
  removed?: boolean;
}

export interface PlanExtra {
  exerciseId: string;
  sets: number;
  reps: string;
}

export interface Exercise {
  id: string;
  name: string;
  /** Chinese name, used for Bilibili video search */
  zh: string;
  pattern: Pattern;
  /** Equipment needed (all of it); empty = bodyweight */
  equip: Equipment[];
  /** Progression tier 1-3; higher is harder within a pattern */
  tier: Phase;
  muscles: string;
  tags: ('Bone' | 'Muscle' | 'Posture' | 'Fitness' | 'Core' | 'Balance')[];
  unit: 'reps' | 'sec' | 'meters';
  cues: string[];
  mistakes: string[];
  avoidIf?: (keyof Cautions)[];
  /** Impact level for bone-loading work */
  impact?: 1 | 2 | 3;
  /** free-exercise-db image id (public domain) */
  img?: string;
  /** YouTube search query override */
  videoQuery?: string;
}

export interface PlannedExercise {
  exerciseId: string;
  slot: number;
  sets: number;
  reps: string;
  restSec: number;
  note?: string;
  candidates: string[];
  /** Changed or added by the supervisor */
  edited?: boolean;
  extra?: boolean;
}

export interface Session {
  key: string;
  title: string;
  focus: string;
  items: PlannedExercise[];
}

export type LogStatus = 'pending' | 'approved' | 'rejected';

/** Numbers copied from the Fitbit app's record of this workout */
export interface TrackerStats {
  minutes?: number;
  avgHr?: number;
  zoneMinutes?: number;
  calories?: number;
}

export interface LoggedExercise {
  exerciseId: string;
  setsPlanned: number;
  setsDone: number;
  load?: string;
}

export interface WorkoutLog {
  id: string;
  memberId: string;
  /** Workout date YYYY-MM-DD; always the day it was logged (no backfilling) */
  date: string;
  createdAt: string;
  sessionKey: string;
  title: string;
  exercises: LoggedExercise[];
  completion: number;
  rpe?: number;
  note?: string;
  photo?: string;
  tracker?: TrackerStats;
  /** Minutes from the first ticked set to check-in */
  durationMin?: number;
  /** Stopped by the time limit; counts as a full session */
  timeCapped?: boolean;
  status: LogStatus;
  reviewNote?: string;
  reviewedBy?: string;
}

export interface Leave {
  id: string;
  memberId: string;
  date: string;
  reason: string;
  status: LogStatus;
}

export type RefundMode = 'weekly' | 'monthly';

export interface Pool {
  id: string;
  traineeId: string;
  supervisorId: string;
  /** YYYY-MM */
  month: string;
  deposit: number;
  penaltyPerMiss: number;
  requiredPerWeek: number;
  refundMode: RefundMode;
  /** Date the pool takes effect; weeks ending before it are ignored */
  startDate: string;
  createdAt: string;
}

export interface WishItem {
  id: string;
  ownerId: string;
  title: string;
  price: number;
  redeemedAt?: string;
}

export interface DexaRecord {
  id: string;
  memberId: string;
  date: string;
  spineBmd?: number;
  spineT?: number;
  spineZ?: number;
  hipBmd?: number;
  hipT?: number;
  hipZ?: number;
  note?: string;
}

export interface BodyRecord {
  id: string;
  memberId: string;
  date: string;
  weight?: number;
  muscleKg?: number;
  fatPct?: number;
  note?: string;
}

/** *Score metrics are absolute targets: the lower of the T-score and Z-score must reach the target */
export type MilestoneMetric = 'spineBmdPct' | 'hipBmdPct' | 'spineScore' | 'hipScore' | 'muscleKg' | 'fatPct';

export interface Milestone {
  id: string;
  memberId: string;
  metric: MilestoneMetric;
  /** Target change: % for BMD, kg for muscle, percentage points for body fat (negative = decrease) */
  target: number;
  reward: number;
  deadline: string;
  title: string;
  /** Non-cash reward (e.g. "Nintendo Switch 2"); shown instead of the amount */
  prize?: string;
  /** Starting value for score goals when no DEXA has been entered yet */
  startValue?: number;
  paidAt?: string;
}

export interface LabRecord {
  id: string;
  memberId: string;
  date: string;
  /** Key from LAB_TESTS, or a free-text test name */
  test: string;
  value: number;
  unit: string;
  note?: string;
}

export interface WalkLog {
  id: string;
  memberId: string;
  date: string;
  minutes: number;
}

export interface Settings {
  currency: string;
  /** Check-ins only count once the supervisor approves them */
  requireApproval: boolean;
  /** Share of planned sets needed for a workout to count */
  minCompletion: number;
}

export interface AppState {
  version: 1;
  members: Member[];
  activeMemberId: string;
  logs: WorkoutLog[];
  leaves: Leave[];
  pools: Pool[];
  wishes: WishItem[];
  dexa: DexaRecord[];
  body: BodyRecord[];
  milestones: Milestone[];
  labs: LabRecord[];
  /** Daily Straight & Steady routine: key `${memberId}|${date}` → exercise ids done */
  daily: Record<string, string[]>;
  walks: WalkLog[];
  /** Weekly load review answers: key `${memberId}|${weekStart}` */
  reviews: Record<string, 'lighten' | 'keep' | 'harder'>;
  customVideos: Record<string, string>;
  settings: Settings;
}
