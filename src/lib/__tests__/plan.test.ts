import { describe, expect, it } from 'vitest';
import { buildSessions, currentPhase } from '../plan';
import { EXERCISE_MAP } from '../../data/exercises';
import { defaultState } from '../../store';
import type { Member } from '../../types';

const [ivy, hubby] = defaultState().members;

function ids(m: Member, t = m.startDate) {
  return buildSessions(m, t).flatMap((s) => s.items.map((i) => i.exerciseId));
}

describe('buildSessions', () => {
  it('骨量低：每套都有冲击和背伸/核心，没有禁做动作和大重量', () => {
    const later = '2027-06-01'; // 第三阶段
    const sessions = buildSessions(hubby, later);
    for (const s of sessions) {
      expect(s.items[0].exerciseId).toMatch(/heel_drop|pogo_jump|rope_jumping/);
    }
    const all = ids(hubby, later);
    expect(all).not.toContain('cat_cow');
    expect(all).not.toContain('jump_squat');
    expect(all).not.toContain('barbell_deadlift');
    expect(all.every((id) => EXERCISE_MAP[id].tier <= 2)).toBe(true);
  });

  it('获得医生许可后第三阶段开放大重量', () => {
    const cleared = { ...hubby, level: 'intermediate' as const, cautions: { ...hubby.cautions, cleared: true } };
    const all = ids(cleared, '2027-06-01');
    expect(all).toContain('barbell_squat');
    expect(all).toContain('jump_squat');
  });

  it('在家只用有的器械', () => {
    const home = { ...ivy, equipment: [] };
    const all = ids(home);
    expect(all.every((id) => EXERCISE_MAP[id].equip.length === 0)).toBe(true);
  });

  it('肩颈酸痛：每套都含颈部和肩胛训练', () => {
    for (const s of buildSessions(ivy, ivy.startDate)) {
      const patterns = s.items.map((i) => EXERCISE_MAP[i.exerciseId].pattern);
      expect(patterns).toContain('neck');
      expect(patterns).toContain('scap');
      expect(patterns).toContain('conditioning');
    }
  });

  it('手动替换的动作生效', () => {
    const sessions = buildSessions(ivy, ivy.startDate);
    const item = sessions[0].items.find((i) => i.candidates.length > 1)!;
    const other = item.candidates.find((c) => c !== item.exerciseId)!;
    const swapped = { ...ivy, swaps: { [`A-${item.slot}`]: other } };
    expect(buildSessions(swapped, ivy.startDate)[0].items.find((i) => i.slot === item.slot)!.exerciseId).toBe(other);
  });

  it('阶段按周数推进', () => {
    const m = { ...ivy, startDate: '2026-01-05' };
    expect(currentPhase(m, '2026-01-20')).toBe(1);
    expect(currentPhase(m, '2026-02-10')).toBe(2);
    expect(currentPhase(m, '2026-04-10')).toBe(3);
  });
});
