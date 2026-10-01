import type { Member } from '../types';
import { addDays, mondayOf, today, WEEKDAY_NAMES, weekday } from '../lib/date';
import { doneDates, leaveDates, pendingDates, poolWeeks } from '../lib/escrow';
import { useStore } from '../store';

/** 本周 7 天的打卡情况 + 本周要求次数 */
export function WeekStrip({ member }: { member: Member }) {
  const { state } = useStore();
  const t = today();
  const mon = mondayOf(t);
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  const done = doneDates(state.logs, member.id, state.settings);
  const pending = pendingDates(state.logs, member.id, state.settings);
  const leave = leaveDates(state.leaves, member.id);
  const pool = state.pools.find((p) => p.traineeId === member.id && poolWeeks(p).some((w) => w.start === mon));
  const leavesThisWeek = days.filter((d) => leave.has(d)).length;
  const required = Math.max(0, (pool?.requiredPerWeek ?? member.trainingDays.length) - leavesThisWeek);
  const doneN = days.filter((d) => done.has(d)).length;
  const pendingN = days.filter((d) => pending.has(d)).length;
  const left = Math.max(0, required - doneN - pendingN);
  const daysLeft = days.filter((d) => d >= t).length;

  return (
    <div className="card">
      <div className="row-between">
        <h3 className="m0">本周打卡</h3>
        <span className={`pill ${doneN >= required ? 'pill-ok' : left > daysLeft ? 'pill-bad' : ''}`}>
          {doneN}/{required} 次{pendingN ? ` · ${pendingN} 待确认` : ''}
        </span>
      </div>
      <div className="week-strip">
        {days.map((d) => {
          const wd = weekday(d);
          const planned = member.trainingDays.includes(wd);
          const cls = done.has(d)
            ? 'done'
            : pending.has(d)
              ? 'pending'
              : leave.has(d)
                ? 'leave'
                : d < t && planned && d >= member.startDate
                  ? 'missed'
                  : planned
                    ? 'planned'
                    : '';
          return (
            <div key={d} className={`day ${cls} ${d === t ? 'is-today' : ''}`}>
              <span className="day-name">{WEEKDAY_NAMES[wd].slice(1)}</span>
              <span className="day-dot">
                {done.has(d) ? '✓' : pending.has(d) ? '⏳' : leave.has(d) ? '假' : planned ? '•' : ''}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted small m0">
        {doneN >= required
          ? '🎉 本周已达标，多练的不扣钱也不加钱，但对身体有好处！'
          : left > daysLeft
            ? `⚠️ 本周剩余 ${daysLeft} 天，还差 ${left} 次，已无法全部补上。`
            : `还需 ${left} 次${pool ? `，每缺 1 次扣 ${state.settings.currency}${pool.penaltyPerMiss}` : ''}。不可补卡，只能当天打卡。`}
      </p>
    </div>
  );
}
