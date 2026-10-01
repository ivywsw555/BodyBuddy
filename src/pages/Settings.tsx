import { useRef } from 'react';
import type { Cautions, Equipment, Goal, Member, Role } from '../types';
import { ALL_EQUIPMENT, EQUIPMENT_NAMES, GOAL_NAMES } from '../lib/plan';
import { today, uid, WEEKDAY_NAMES } from '../lib/date';
import { defaultState, useStore } from '../store';

const ROLE_NAMES: Record<Role, string> = {
  trainee: '训练者',
  supervisor: '纯监督者',
  both: '训练 + 监督',
};

const CAUTION_NAMES: Record<keyof Cautions, string> = {
  spineFragile: '脊柱骨量低（DEXA 黄/红区）',
  hipFragile: '髋部骨量低',
  neckShoulderPain: '肩颈背经常酸痛',
  kneeIssue: '膝盖不适（减少跳跃）',
  cleared: '已获医生/康复师许可做大重量和高冲击训练',
};

export function SettingsPage() {
  const { state, update, replace } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bodybuddy-备份-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || !Array.isArray(data.members)) throw new Error('格式不对');
      if (confirm('导入会覆盖这台设备上的全部数据，确定吗？')) replace({ ...defaultState(), ...data });
    } catch (e) {
      alert(`导入失败：${(e as Error).message}`);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">⚙️ 设置</h1>
      {state.members.map((m) => (
        <MemberEditor key={m.id} member={m} />
      ))}
      <button
        className="btn btn-block"
        onClick={() =>
          update((s) =>
            void s.members.push({
              id: uid(),
              name: '新成员',
              avatar: '🙂',
              role: 'trainee',
              goals: ['fitness'],
              place: 'home',
              equipment: [],
              trainingDays: [1, 3, 5],
              level: 'beginner',
              cautions: { spineFragile: false, hipFragile: false, neckShoulderPain: false, kneeIssue: false, cleared: false },
              startDate: today(),
              swaps: {},
            }),
          )
        }
      >
        ＋ 添加成员
      </button>

      <div className="card">
        <h3 className="m0">监督规则</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={state.settings.requireApproval}
            onChange={(e) => update((s) => void (s.settings.requireApproval = e.target.checked))}
          />
          打卡需要监督人确认后才算数
        </label>
        <label>
          一次训练至少完成 {Math.round(state.settings.minCompletion * 100)}% 的组数才算有效
          <input
            type="range"
            min={50}
            max={100}
            step={10}
            value={state.settings.minCompletion * 100}
            onChange={(e) => update((s) => void (s.settings.minCompletion = Number(e.target.value) / 100))}
          />
        </label>
        <label>
          货币符号
          <select value={state.settings.currency} onChange={(e) => update((s) => void (s.settings.currency = e.target.value))}>
            <option value="¥">¥ 人民币</option>
            <option value="$">$ 美元</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h3 className="m0">数据</h3>
        <p className="muted small">
          数据只保存在这个浏览器里。建议两个人用同一台设备（比如家里的 iPad），或者定期导出备份。换设备时导出 → 在新设备导入。
        </p>
        <div className="row wrap">
          <button className="btn" onClick={exportData}>导出备份</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>导入备份</button>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('清空全部数据并恢复默认？此操作无法撤销。')) replace(defaultState());
            }}
          >
            清空数据
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importData(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

function MemberEditor({ member }: { member: Member }) {
  const { state, update } = useStore();
  const edit = (fn: (m: Member) => void) =>
    update((s) => {
      const m = s.members.find((x) => x.id === member.id);
      if (m) fn(m);
    });
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const others = state.members.filter((m) => m.id !== member.id);

  return (
    <details className="card" open={state.activeMemberId === member.id}>
      <summary>
        <b>
          {member.avatar} {member.name}
        </b>{' '}
        <span className="muted small">{ROLE_NAMES[member.role]}</span>
      </summary>
      <div className="form grid2">
        <label>
          名字
          <input value={member.name} onChange={(e) => edit((m) => void (m.name = e.target.value))} />
        </label>
        <label>
          头像 emoji
          <input value={member.avatar} onChange={(e) => edit((m) => void (m.avatar = e.target.value))} />
        </label>
        <label>
          角色
          <select value={member.role} onChange={(e) => edit((m) => void (m.role = e.target.value as Role))}>
            {(Object.keys(ROLE_NAMES) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_NAMES[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          谁来监督 TA
          <select
            value={member.supervisorId ?? ''}
            onChange={(e) => edit((m) => void (m.supervisorId = e.target.value || undefined))}
          >
            <option value="">不需要监督</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.avatar} {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h4>训练目标（可多选）</h4>
      <div className="chips">
        {(Object.keys(GOAL_NAMES) as Goal[]).map((g) => (
          <button
            key={g}
            className={`chip ${member.goals.includes(g) ? 'active' : ''}`}
            onClick={() => edit((m) => void (m.goals = toggle(m.goals, g)))}
          >
            {GOAL_NAMES[g]}
          </button>
        ))}
      </div>

      <h4>身体情况</h4>
      {(Object.keys(CAUTION_NAMES) as (keyof Cautions)[]).map((k) => (
        <label key={k} className="check">
          <input type="checkbox" checked={member.cautions[k]} onChange={(e) => edit((m) => void (m.cautions[k] = e.target.checked))} />
          {CAUTION_NAMES[k]}
        </label>
      ))}

      <h4>在哪练</h4>
      <div className="seg">
        <button className={`seg-btn ${member.place === 'gym' ? 'active' : ''}`} onClick={() => edit((m) => void (m.place = 'gym'))}>
          🏋️ 健身房
        </button>
        <button className={`seg-btn ${member.place === 'home' ? 'active' : ''}`} onClick={() => edit((m) => void (m.place = 'home'))}>
          🏠 在家
        </button>
      </div>
      {member.place === 'home' && (
        <>
          <p className="muted small">家里有哪些器械？（都不选 = 徒手）</p>
          <div className="chips">
            {ALL_EQUIPMENT.map((e: Equipment) => (
              <button
                key={e}
                className={`chip ${member.equipment.includes(e) ? 'active' : ''}`}
                onClick={() => edit((m) => void (m.equipment = toggle(m.equipment, e)))}
              >
                {EQUIPMENT_NAMES[e]}
              </button>
            ))}
          </div>
        </>
      )}

      <h4>每周训练日</h4>
      <div className="chips">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button
            key={d}
            className={`chip ${member.trainingDays.includes(d) ? 'active' : ''}`}
            onClick={() => edit((m) => void (m.trainingDays = toggle(m.trainingDays, d)))}
          >
            {WEEKDAY_NAMES[d]}
          </button>
        ))}
      </div>

      <div className="form grid2">
        <label>
          训练经验
          <select value={member.level} onChange={(e) => edit((m) => void (m.level = e.target.value as Member['level']))}>
            <option value="beginner">新手</option>
            <option value="intermediate">有基础</option>
          </select>
        </label>
        <label>
          计划开始日期
          <input type="date" value={member.startDate} onChange={(e) => edit((m) => void (m.startDate = e.target.value))} />
        </label>
      </div>
      {state.members.length > 1 && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (!confirm(`删除 ${member.name}？TA 的训练记录会保留在备份里，但不再显示。`)) return;
            update((s) => {
              s.members = s.members.filter((m) => m.id !== member.id);
              s.members.forEach((m) => m.supervisorId === member.id && (m.supervisorId = undefined));
              if (s.activeMemberId === member.id) s.activeMemberId = s.members[0].id;
            });
          }}
        >
          删除成员
        </button>
      )}
    </details>
  );
}
