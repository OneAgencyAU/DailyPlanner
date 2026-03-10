import { useRef, useEffect, useCallback } from 'react';

export default function DayColumn({
  date,
  theme,
  isToday,
  isExpanded,
  onToggle,
  note,
  onNoteChange,
  taskCount,
  eventCount,
}) {
  const textareaRef = useRef(null);

  // Auto-focus textarea when expanded
  useEffect(() => {
    if (isExpanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isExpanded]);

  const dayNum = date.getDate();
  const monthShort = date.toLocaleDateString('en-AU', { month: 'short' });

  const handleNoteInput = useCallback(
    (e) => {
      onNoteChange(e.target.value);
    },
    [onNoteChange]
  );

  return (
    <div
      onClick={() => onToggle()}
      className={`
        relative flex flex-col rounded-xl border cursor-pointer
        transition-all duration-300 ease-in-out overflow-hidden
        ${isExpanded ? 'flex-[2.5]' : 'flex-1'}
        ${
          isToday
            ? 'border-accent-blue/40 bg-bg-card-active shadow-[0_0_20px_rgba(79,142,247,0.08)]'
            : 'border-border bg-bg-card hover:bg-bg-card-hover hover:border-border-bright'
        }
      `}
    >
      {/* Today indicator bar */}
      {isToday && (
        <div className="absolute top-0 left-0 right-0 h-[2px] accent-gradient" />
      )}

      <div className="p-5 flex flex-col h-full">
        {/* Day header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-2xl font-semibold ${
                  isToday ? 'accent-gradient-text' : 'text-text-primary'
                }`}
              >
                {theme.day}
              </span>
              {isToday && (
                <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full accent-gradient text-white">
                  Today
                </span>
              )}
            </div>
            <div className="text-text-secondary text-sm">
              {dayNum} {monthShort}
            </div>
          </div>
        </div>

        {/* Theme */}
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-bg-primary/50">
          <span className="text-base">{theme.emoji}</span>
          <span className="text-sm text-text-secondary font-medium">{theme.theme}</span>
        </div>

        {/* Badges */}
        <div className="flex gap-2 mb-4">
          <span className="text-xs px-2.5 py-1 rounded-full bg-bg-primary text-text-muted border border-border">
            {taskCount} tasks
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-bg-primary text-text-muted border border-border">
            {eventCount} events
          </span>
        </div>

        {/* Focus note */}
        {isExpanded ? (
          <div className="flex-1 flex flex-col mt-2" onClick={(e) => e.stopPropagation()}>
            <label className="text-xs text-text-muted uppercase tracking-wider mb-2 font-medium">
              Focus for the day
            </label>
            <textarea
              ref={textareaRef}
              value={note || ''}
              onChange={handleNoteInput}
              placeholder="What's your focus today?"
              className="flex-1 min-h-[100px] bg-bg-primary/50 border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-accent-blue/50 transition-colors"
            />
            <div className="mt-2 text-[10px] text-text-muted">Auto-saves as you type</div>
          </div>
        ) : (
          note && (
            <p className="text-sm text-text-secondary line-clamp-2 mt-auto">
              {note}
            </p>
          )
        )}

        {/* Expand hint when collapsed */}
        {!isExpanded && (
          <div className="mt-auto pt-3">
            <span className="text-[11px] text-text-muted">Click to expand</span>
          </div>
        )}
      </div>
    </div>
  );
}
