import { useState, useMemo, useCallback } from 'react';
import { formatDate, isSameDay } from '../utils/days';

/**
 * Full-screen calendar overlay that appears when dragging a task.
 * Every day cell is a drop target. Dropping moves the task to that date.
 */
export default function CalendarDropOverlay({ today, taskTitle, onDrop, onCancel }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [hoverKey, setHoverKey] = useState(null);

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
  const startDow = (firstDay.getDay() + 6) % 7;

  const days = [];
  for (let i = 0; i < startDow; i++) {
    const d = new Date(firstDay);
    d.setDate(d.getDate() - (startDow - i));
    days.push({ date: d, outside: true });
  }
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), outside: false });
  }
  while (days.length < 42) {
    const d = new Date(lastDay);
    d.setDate(d.getDate() + (days.length - startDow - lastDay.getDate() + 1));
    days.push({ date: d, outside: true });
  }

  const handleDragOver = useCallback((e, key) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setHoverKey(key);
  }, []);

  const handleDragLeave = useCallback(() => {
    setHoverKey(null);
  }, []);

  const handleDrop = useCallback((e, key) => {
    e.preventDefault();
    setHoverKey(null);
    onDrop(key);
  }, [onDrop]);

  // Also handle native dragend (e.g. user drops outside or presses Escape)
  const handleOverlayDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  const navBtnClass = 'w-8 h-8 rounded-lg flex items-center justify-center border border-border text-text-secondary hover:text-text-primary hover:border-border-bright transition-colors z-10';

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg-primary/95 backdrop-blur-sm animate-in fade-in"
      onDragOver={handleOverlayDragOver}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
          <span className="text-sm text-text-secondary">
            Moving: <span className="text-text-primary font-medium">{taskTitle}</span>
          </span>
        </div>
        <button
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded-lg border border-border text-text-muted hover:text-text-primary hover:border-border-bright transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Calendar */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-3xl">
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={(e) => { e.stopPropagation(); setMonthOffset((o) => o - 1); }}
              className={navBtnClass}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-text-primary">{monthName}</h2>
              {monthOffset !== 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setMonthOffset(0); }}
                  className="text-xs px-2 py-0.5 rounded border border-accent-orange/40 text-accent-orange hover:bg-accent-orange/10 transition-colors"
                >
                  This month
                </button>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setMonthOffset((o) => o + 1); }}
              className={navBtnClass}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-xs text-text-muted font-medium py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-7 border-t border-l border-border rounded-lg overflow-hidden">
            {days.map((day, idx) => {
              const key = formatDate(day.date);
              const isToday = isSameDay(day.date, today);
              const isHover = hoverKey === key;

              return (
                <div
                  key={idx}
                  onDragOver={(e) => handleDragOver(e, key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, key)}
                  className={`
                    border-r border-b border-border p-3 min-h-[72px] transition-all duration-150 cursor-crosshair
                    ${day.outside ? 'bg-bg-primary/30 opacity-40' : ''}
                    ${isHover && !day.outside ? 'bg-accent-blue/15 ring-2 ring-inset ring-accent-blue/50 scale-[1.02]' : ''}
                    ${isToday && !isHover ? 'bg-accent-orange/5' : ''}
                    ${!isHover && !isToday && !day.outside ? 'hover:bg-bg-card-hover' : ''}
                  `}
                >
                  <span
                    className={`text-sm font-medium ${
                      isHover && !day.outside
                        ? 'text-accent-blue'
                        : isToday
                          ? 'text-accent-orange'
                          : day.outside
                            ? 'text-text-muted/40'
                            : 'text-text-primary'
                    }`}
                  >
                    {day.date.getDate()}
                  </span>
                  {isHover && !day.outside && (
                    <div className="mt-1 text-[10px] text-accent-blue font-medium">
                      Drop here
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-center text-xs text-text-muted mt-4">
            Drop the task on any day to reschedule it
          </p>
        </div>
      </div>
    </div>
  );
}
