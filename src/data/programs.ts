import type { Program } from '../types';
import { addDays } from '../lib/date';

/**
 * Ivy's first-month program for Ho (2026-10-02): short daily habit moves morning and evening,
 * plus three bench / dumbbell / mat sessions a week. Spine stays neutral throughout; no bending forward.
 */
export function hoMonthOne(start: string): Program {
  return {
    name: 'Month 1 program from Ivy',
    until: addDays(start, 27),
    dailyNote: 'Morning and evening, 5–8 minutes each. Keep the spine neutral; no bending forward or compensating.',
    daily: [
      { exerciseId: 'door_pec_stretch', dose: '30 s each side' },
      { exerciseId: 'wall_angel', dose: '2 × 10' },
      { exerciseId: 'dead_bug', dose: '2 × 8 each side' },
      { exerciseId: 'heel_drop', dose: '15–20 reps, hands on a table' },
    ],
    sessions: [
      {
        key: '1',
        title: 'Day 1 · Legs and core',
        focus: 'Lower-body loading and deep core; the bench is your safety marker. Warm up → main work → cool down.',
        items: [
          { exerciseId: 'bird_dog', sets: 2, reps: '8 each side, 2 s hold', restSec: 30, note: 'Warm-up: back level enough that a water bottle on it wouldn’t tip' },
          { exerciseId: 'bench_squat', sets: 3, reps: '10-12 reps', restSec: 90, note: 'Bodyweight, arms crossed; touch the bench and stand straight up; keep 3 reps in reserve' },
          { exerciseId: 'glute_bridge', sets: 3, reps: '12 reps, 2 s squeeze', restSec: 60 },
          { exerciseId: 'clamshell', sets: 2, reps: '12 reps each side', restSec: 45 },
        ],
      },
      {
        key: '2',
        title: 'Day 2 · Chest and back on the bench',
        focus: 'The bench supports the trunk, so there’s no bent-over load on the lower back. Warm up → main work → cool down.',
        items: [
          { exerciseId: 'chest_supported_row', sets: 3, reps: '10-12 reps', restSec: 90, note: '2.5–4 kg each hand; squeeze the shoulder blades 2 s at the top, lower over 3 s' },
          { exerciseId: 'db_bench_press', sets: 3, reps: '10-12 reps', restSec: 90, note: '3–5 kg each hand; elbows 45–60° from the body; put the feet on the bench edge if the lower back arches' },
          { exerciseId: 'prone_w_raise', sets: 2, reps: '12 reps', restSec: 45, note: 'No weights' },
        ],
      },
      {
        key: '3',
        title: 'Day 3 · Back chain and arms',
        focus: 'Whole-body linking, laying the base for month 2. Warm up → main work → cool down.',
        items: [
          { exerciseId: 'db_rdl', sets: 3, reps: '8-10 reps', restSec: 90, note: '2.5–3 kg each hand; slide to just below the knee, back straight the whole time, never round' },
          { exerciseId: 'seated_db_ohp', sets: 3, reps: '10 reps', restSec: 75, note: '2–3 kg each hand; backrest at 80–85°' },
          { exerciseId: 'lying_triceps_ext', sets: 2, reps: '10-12 reps', restSec: 60, note: '2–3 kg each hand' },
        ],
      },
    ],
  };
}
