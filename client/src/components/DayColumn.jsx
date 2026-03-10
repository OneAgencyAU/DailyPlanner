import { useRef, useEffect, useCallback, useState } from 'react';

export default function DayColumn({
  date,
  dateKey,
  theme,
  isToday,
  isExpanded,
  onToggle,
  note,
  onNoteChange,
  taskCount,
  eventCount,
  reminders = [],
  onToggleReminder,
  onAddReminder,
}) {
  const textareaRef = useRef(null);
  const [newTask, setNewTask] = useState('');

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

  const handleAddTask = useCallback(
    (e) => {
      if (e.key === 'Enter' && newTask.trim()) {
        e.preventDefault();
        onAddReminder(newTask.trim(), dateKey);
        setNewTask('');
      }
    },
    [newTask, dateKey, onAddReminder]
  );

  const themeColor = theme.color;

  // Sort: incomplete first, then completed; overdue at top
  const sorted = [...reminders].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    return (a.title || '').localeCompare(b.title || '');
  });

  const pendingTasks = sorted.filter((r) => !r.completed);
  const completedTasks = sorted.filter((r) => r.completed);

  return (
    <div
      onClick={() => onToggle()}
      className={`
        relative flex flex-col rounded-xl border cursor-pointer
        transition-all duration-300 ease-in-out overflow-hidden
        ${isExpanded ? 'flex-[2.5]' : 'flex-1'}
        ${
          isToday
            ? 'border-[var(--color-accent-orange)]/40 bg-bg-card-active shadow-[0_0_20px_rgba(245,101,54,0.08)]'
            : 'border-border bg-bg-card hover:bg-bg-card-hover hover:border-border-bright'
        }
      `}
    >
      {isToday && (
        <div className="absolute top-0 left-0 right-0 h-[2px] today-badge" />
      )}

      <div className="p-5 flex flex-col h-full">
        {/* Day header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`text-2xl font-semibold ${
                  isToday ? 'today-gradient-text' : 'text-text-primary'
                }`}
              >
                {theme.day}
              </span>
              {isToday && (
                <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full today-badge text-white">
                  Today
                </span>
              )}
            </div>
            <div className="text-text-secondary text-sm">
              {dayNum} {monthShort}
            </div>
          </div>
        </div>

        {/* Theme chip */}
        <div
          className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg border"
          style={{
            backgroundColor: themeColor.bg,
            borderColor: themeColor.border,
          }}
        >
          <span className="text-base">{theme.emoji}</span>
          <span className="text-sm font-medium" style={{ color: themeColor.text }}>
            {theme.theme}
          </span>
        </div>

        {/* Badges */}
        <div className="flex gap-2 mb-4">
          <span className={`text-xs px-2.5 py-1 rounded-full border ${
            taskCount > 0
              ? 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'
              : 'bg-bg-primary text-text-muted border-border'
          }`}>
            {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-bg-primary text-text-muted border border-border">
            {eventCount} events
          </span>
        </div>

        {/* Expanded content */}
        {isExpanded ? (
          <div className="flex-1 flex flex-col gap-4 mt-2 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Focus note */}
            <div>
              <label className="text-xs text-text-muted uppercase tracking-wider mb-2 font-medium block">
                Focus for the day
              </label>
              <textarea
                ref={textareaRef}
                value={note || ''}
                onChange={handleNoteInput}
                placeholder="What's your focus today?"
                className="w-full bg-bg-primary/50 border border-border rounded-lg p-3 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-accent-blue/50 transition-colors"
                style={{ maxHeight: '80px', minHeight: '60px', overflowY: 'auto' }}
              />
            </div>

            {/* Tasks */}
            <div className="flex-1 flex flex-col min-h-0">
              <label className="text-xs text-text-muted uppercase tracking-wider mb-2 font-medium block">
                Tasks
              </label>

              {/* Add task input */}
              <input
                type="text"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                onKeyDown={handleAddTask}
                placeholder="Add a task — press Enter"
                className="w-full bg-bg-primary/50 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-blue/50 transition-colors mb-2"
              />

              {/* Task list */}
              <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                {pendingTasks.length === 0 && completedTasks.length === 0 && (
                  <p className="text-xs text-text-muted py-2">No tasks for this day</p>
                )}

                {pendingTasks.map((r) => (
                  <TaskItem
                    key={r.uid}
                    reminder={r}
                    onToggle={() => onToggleReminder(r.uid)}
                  />
                ))}

                {completedTasks.length > 0 && pendingTasks.length > 0 && (
                  <div className="border-t border-border my-2" />
                )}

                {completedTasks.map((r) => (
                  <TaskItem
                    key={r.uid}
                    reminder={r}
                    onToggle={() => onToggleReminder(r.uid)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-auto pt-3">
            {note ? (
              <div className="mb-2">
                <div className="text-[10px] text-text-muted uppercase tracking-wider mb-1 font-medium">Focus</div>
                <p className="text-sm text-text-secondary line-clamp-2">{note}</p>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-text-muted">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span className="text-[11px]">Click to expand</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskItem({ reminder, onToggle }) {
  return (
    <div
      className={`flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-bg-primary/50 group ${
        reminder.overdue ? 'bg-amber-500/5' : ''
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          reminder.completed
            ? 'bg-accent-blue border-accent-blue'
            : reminder.overdue
              ? 'border-amber-500/60 hover:border-amber-500'
              : 'border-border-bright hover:border-accent-blue'
        }`}
      >
        {reminder.completed && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm leading-tight block ${
            reminder.completed
              ? 'text-text-muted line-through'
              : reminder.overdue
                ? 'text-amber-400'
                : 'text-text-primary'
          }`}
        >
          {reminder.title}
        </span>
        {reminder.overdue && !reminder.completed && (
          <span className="text-[10px] text-amber-500/80">Overdue</span>
        )}
        {reminder.calendar_name && reminder.calendar_name !== 'Reminders' && (
          <span className="text-[10px] text-text-muted ml-1">{reminder.calendar_name}</span>
        )}
      </div>
    </div>
  );
}
