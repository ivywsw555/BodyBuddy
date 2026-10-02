import { useRef } from 'react';
import type { Cautions, Equipment, Goal, Member, Role } from '../types';
import { ALL_EQUIPMENT, EQUIPMENT_NAMES, GOAL_NAMES } from '../lib/plan';
import { today, uid, WEEKDAY_NAMES } from '../lib/date';
import { defaultState, memberName, useMember, useStore } from '../store';

const ROLE_NAMES: Record<Role, string> = {
  trainee: 'Trains',
  supervisor: 'Supervises only',
  both: 'Trains + supervises',
};

const CAUTION_NAMES: Record<keyof Cautions, string> = {
  spineFragile: 'Low spine bone density (DEXA yellow/red)',
  hipFragile: 'Low hip bone density',
  neckShoulderPain: 'Frequent neck, shoulder or back aches',
  kneeIssue: 'Knee discomfort (fewer jumps)',
  cleared: 'Cleared by a doctor/physio for heavy and high-impact training',
};

export function SettingsPage() {
  const { state, update, replace } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bodybuddy-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || !Array.isArray(data.members)) throw new Error('not a BodyBuddy backup file');
      if (confirm('Importing replaces all data on this device. Continue?')) replace({ ...defaultState(), ...data });
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">⚙️ Settings</h1>
      {state.members.map((m) => (
        <MemberEditor key={m.id} member={m} />
      ))}
      <button
        className="btn btn-block"
        onClick={() =>
          update((s) =>
            void s.members.push({
              id: uid(),
              name: 'New member',
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
        + Add member
      </button>

      <div className="card">
        <h3 className="m0">Supervision rules</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={state.settings.requireApproval}
            onChange={(e) => update((s) => void (s.settings.requireApproval = e.target.checked))}
          />
          Check-ins only count after the supervisor approves
        </label>
        <label>
          A workout counts once at least {Math.round(state.settings.minCompletion * 100)}% of sets are done
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
          Currency
          <select value={state.settings.currency} onChange={(e) => update((s) => void (s.settings.currency = e.target.value))}>
            <option value="¥">¥ RMB</option>
            <option value="$">$ USD</option>
          </select>
        </label>
      </div>

      <div className="card">
        <h3 className="m0">Data</h3>
        <p className="muted small">
          Data is stored only in this browser. Share one device (like a home iPad) or export backups regularly. To switch devices, export here and import on the new one.
        </p>
        <div className="row wrap">
          <button className="btn" onClick={exportData}>Export backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import backup</button>
          <button
            className="btn btn-danger"
            onClick={() => {
              if (confirm('Erase all data and reset to defaults? This can’t be undone.')) replace(defaultState());
            }}
          >
            Erase data
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
  // Plan settings (days, level, start date, who supervises) belong to the supervisor once one is set
  const viewer = useMember();
  const locked = !!member.supervisorId && viewer?.id !== member.supervisorId;

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
          Name
          <input value={member.name} onChange={(e) => edit((m) => void (m.name = e.target.value))} />
        </label>
        <label>
          Avatar emoji
          <input value={member.avatar} onChange={(e) => edit((m) => void (m.avatar = e.target.value))} />
        </label>
        <label>
          Role
          <select value={member.role} onChange={(e) => edit((m) => void (m.role = e.target.value as Role))}>
            {(Object.keys(ROLE_NAMES) as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_NAMES[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supervised by
          <select
            value={member.supervisorId ?? ''}
            disabled={locked}
            onChange={(e) => edit((m) => void (m.supervisorId = e.target.value || undefined))}
          >
            <option value="">No supervisor</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.avatar} {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h4>Goals (pick any)</h4>
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

      <h4>Body condition</h4>
      {(Object.keys(CAUTION_NAMES) as (keyof Cautions)[]).map((k) => (
        <label key={k} className="check">
          <input type="checkbox" checked={member.cautions[k]} onChange={(e) => edit((m) => void (m.cautions[k] = e.target.checked))} />
          {CAUTION_NAMES[k]}
        </label>
      ))}

      <h4>Where you train</h4>
      <div className="seg">
        <button className={`seg-btn ${member.place === 'gym' ? 'active' : ''}`} onClick={() => edit((m) => void (m.place = 'gym'))}>
          🏋️ Gym
        </button>
        <button className={`seg-btn ${member.place === 'home' ? 'active' : ''}`} onClick={() => edit((m) => void (m.place = 'home'))}>
          🏠 Home
        </button>
        <button className={`seg-btn ${member.place === 'both' ? 'active' : ''}`} onClick={() => edit((m) => void (m.place = 'both'))}>
          🔁 Both
        </button>
      </div>
      {member.place !== 'gym' && (
        <>
          <p className="muted small">
            What equipment do you have at home? (none = bodyweight only)
            {member.place === 'both' ? ' The plan only uses this, so every workout works at home and at the gym.' : ''}
          </p>
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

      <h4>Training days</h4>
      {locked && (
        <p className="muted small">
          🔒 Training days, experience, start date and supervisor are set by {memberName(state, member.supervisorId)}. Switch to their profile to change them.
        </p>
      )}
      <div className="chips">
        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button
            key={d}
            disabled={locked}
            className={`chip ${member.trainingDays.includes(d) ? 'active' : ''}`}
            onClick={() => edit((m) => void (m.trainingDays = toggle(m.trainingDays, d)))}
          >
            {WEEKDAY_NAMES[d]}
          </button>
        ))}
      </div>

      <div className="form grid2">
        <label>
          Experience
          <select value={member.level} disabled={locked} onChange={(e) => edit((m) => void (m.level = e.target.value as Member['level']))}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Some experience</option>
          </select>
        </label>
        <label>
          Plan start date
          <input type="date" value={member.startDate} disabled={locked} onChange={(e) => edit((m) => void (m.startDate = e.target.value))} />
        </label>
      </div>
      {state.members.length > 1 && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (!confirm(`Remove ${member.name}? Their records stay in backups but won’t be shown.`)) return;
            update((s) => {
              s.members = s.members.filter((m) => m.id !== member.id);
              s.members.forEach((m) => m.supervisorId === member.id && (m.supervisorId = undefined));
              if (s.activeMemberId === member.id) s.activeMemberId = s.members[0].id;
            });
          }}
        >
          Remove member
        </button>
      )}
    </details>
  );
}
