export type Role = 'trainee' | 'supervisor' | 'both';
export type Goal = 'bone' | 'muscle' | 'posture' | 'fitness';
export type Place = 'gym' | 'home';
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
  /** 脊柱骨量低（DEXA 黄/红区）：避免负重屈曲、扭转，冲击训练循序渐进 */
  spineFragile: boolean;
  /** 髋部骨量低 */
  hipFragile: boolean;
  /** 肩颈背部酸痛 */
  neckShoulderPain: boolean;
  /** 膝盖不适：减少跳跃 */
  kneeIssue: boolean;
  /** 已获医生/康复师许可进行大重量和高冲击训练 */
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
  /** 0 = 周日 ... 6 = 周六 */
  trainingDays: number[];
  level: Level;
  cautions: Cautions;
  /** 训练计划开始日期，用于计算阶段 */
  startDate: string;
  phaseOverride?: Phase;
  /** 负责监督这个人的成员 */
  supervisorId?: string;
  /** 在计划中手动替换的动作: key = `${session}-${slotIndex}` */
  swaps: Record<string, string>;
}

export interface Exercise {
  id: string;
  name: string;
  en: string;
  pattern: Pattern;
  /** 需要的器械（全部需要）；空数组 = 徒手 */
  equip: Equipment[];
  /** 进阶等级 1-3，同一模式下越大越难 */
  tier: Phase;
  muscles: string;
  tags: ('骨密度' | '增肌' | '体态' | '体能' | '核心' | '平衡')[];
  unit: 'reps' | 'sec' | 'meters';
  cues: string[];
  mistakes: string[];
  avoidIf?: (keyof Cautions)[];
  /** 冲击等级，供骨密度冲击训练使用 */
  impact?: 1 | 2 | 3;
  /** free-exercise-db 图片 id（公共领域） */
  img?: string;
  /** 搜索视频用的关键词 */
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
}

export interface Session {
  key: string;
  title: string;
  focus: string;
  items: PlannedExercise[];
}

export type LogStatus = 'pending' | 'approved' | 'rejected';

export interface LoggedExercise {
  exerciseId: string;
  setsPlanned: number;
  setsDone: number;
  load?: string;
}

export interface WorkoutLog {
  id: string;
  memberId: string;
  /** 训练日期 YYYY-MM-DD，只能是记录当天，不可补卡 */
  date: string;
  createdAt: string;
  sessionKey: string;
  title: string;
  exercises: LoggedExercise[];
  completion: number;
  rpe?: number;
  note?: string;
  photo?: string;
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
  /** 押金池生效日期，之前结束的周不计算 */
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

export type MilestoneMetric = 'spineBmdPct' | 'hipBmdPct' | 'muscleKg' | 'fatPct';

export interface Milestone {
  id: string;
  memberId: string;
  metric: MilestoneMetric;
  /** 目标变化量：BMD 为百分比，肌肉为 kg，体脂为百分点（负数表示下降） */
  target: number;
  reward: number;
  deadline: string;
  title: string;
  paidAt?: string;
}

export interface Settings {
  currency: string;
  /** 训练记录需要监督人确认才算数 */
  requireApproval: boolean;
  /** 一次训练完成多少比例的组数才算有效 */
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
  customVideos: Record<string, string>;
  settings: Settings;
}
