import { useState, useMemo } from 'react';
import { formatDate, isSameDay } from '../utils/days';

export default function CalendarView({ today, reminders, onGoToDate }) {
  const [monthOffset, setMonthOffset] = useState(0);

  const viewDate = useMemo(() => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + monthOffset);
    return d;
  }, [today, monthOffset]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0

  const days = [];
  // Pad start
  for (let i = 0; i < startDow; i++) {
    const d = new Date(firstDay);
    d.setDate(d.getDate() - (startDow - i));
    days.push({ date: d, outside: true });
  }
  // Month days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), outside: false });
  }
  // Pad end to fill 6 rows
  while (days.length < 42) {
    const d = new Date(lastDay);
    d.setDate(d.getDate() + (days.length - startDow - lastDay.getDate() + 1));
    days.push({ date: d, outside: true });
  }

  // Build task counts by date
  const taskCounts = {};
  for (const r of reminders) {
    if (r.completed) continue;
    const key = r.due_date ? new Date(r.due_date).toISOString().split('T')[0] : null;
    if (key) {
      taskCounts[key] = (taskCounts[key] || 0) + 1;
    }
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <main className="flex-1 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => setMonthOffset((o) => o - 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-border text-text-secondary hover:text-text-primary hover:border-border-bright transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text-primary">{monthName}</h2>
            {monthOffset !== 0 && (
              <button
                onClick={() => setMonthOffset(0)}
                className="text-xs px-2 py-0.5 rounded border border-accent-orange/40 text-accent-orange hover:bg-accent-orange/10 transition-colors"
              >
                Today
              </button>
            )}
          </div>
          <button
            onClick={() => setMonthOffset((o) => o + 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center border border-border text-text-secondary hover:text-text-primary hover:border-border-bright transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="text-center text-xs text-text-muted font-medium py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 border-t border-l border-border">
          {weeks.flat().map((day, idx) => {
            const key = formatDate(day.date);
            const isToday = isSameDay(day.date, today);
            const count = taskCounts[key] || 0;
            const isWeekend = day.date.getDay() === 0 || day.date.getDay() === 6;

            return (
              <button
                key={idx}
                onClick={() => !isWeekend && !day.outside && onGoToDate(key)}
                className={`
                  relative border-r border-b border-border p-2 min-h-[80px] text-left transition-colors
                  ${day.outside ? 'bg-bg-primary/30' : 'hover:bg-bg-card-hover'}
                  ${isWeekend && !day.outside ? 'bg-bg-primary/50' : ''}
                  ${isToday ? 'bg-accent-orange/5' : ''}
                  ${!isWeekend && !day.outside ? 'cursor-pointer' : 'cursor-default'}
                `}
              >
                <span
                  className={`text-sm font-medium ${
                    isToday
                      ? 'text-accent-orange'
                      : day.outside
                        ? 'text-text-muted/40'
                        : isWeekend
                          ? 'text-text-muted/60'
                          : 'text-text-primary'
                  }`}
                >
                  {day.date.getDate()}
                </span>
                {count > 0 && !day.outside && (
                  <div className="mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent-blue/15 text-accent-blue">
                      {count} {count === 1 ? 'task' : 'tasks'}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
