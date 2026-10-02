import type { Member } from '../types';
import { addDays, mondayOf, today, WEEKDAY_NAMES, weekday } from '../lib/date';
import { doneDates, leaveDates, pendingDates, poolWeeks } from '../lib/escrow';
import { useStore } from '../store';

/** This week's 7 days of check-ins plus the weekly requirement */
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
        <h3 className="m0">This week</h3>
        <span className={`pill ${doneN >= required ? 'pill-ok' : left > daysLeft ? 'pill-bad' : ''}`}>
          {doneN}/{required} done{pendingN ? ` · ${pendingN} pending` : ''}
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
              <span className="day-name">{WEEKDAY_NAMES[wd]}</span>
              <span className="day-dot">
                {done.has(d) ? '✓' : pending.has(d) ? '⏳' : leave.has(d) ? 'L' : planned ? '•' : ''}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted small m0">
        {doneN >= required
          ? '🎉 Goal met for this week! Extra sessions don’t change the money, but your body will thank you.'
          : left > daysLeft
            ? `⚠️ ${left} sessions still needed with only ${daysLeft} days left, so this week can’t be fully met.`
            : `${left} more to go${pool ? `; each miss costs ${state.settings.currency}${pool.penaltyPerMiss}` : ''}. Check-ins only count on the day, no backfilling.`}
      </p>
    </div>
  );
}
