import { useState, useEffect, useCallback, useRef } from 'react';
import TopBar from './components/TopBar';
import DayColumn from './components/DayColumn';
import CalendarView from './components/CalendarView';
import CalendarDropOverlay from './components/CalendarDropOverlay';
import { DAY_THEMES, getWeekDates, getMonday, formatDate, isSameDay } from './utils/days';
import { fetchNotes, saveNote, fetchReminders, syncReminders, toggleReminder, moveReminder, deleteReminder, createReminder, fetchSyncStatus } from './utils/api';

export default function App() {
  const today = new Date();
  const todayKey = formatDate(today);

  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState('week'); // 'week' or 'calendar'
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [notes, setNotes] = useState({});
  const [reminders, setReminders] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [syncConfigured, setSyncConfigured] = useState(false);
  const [googleAppConfigured, setGoogleAppConfigured] = useState(false);
  const [draggingTask, setDraggingTask] = useState(null); // { uid, title }
  const dragTimeoutRef = useRef(null);
  const debounceTimers = useRef({});

  // Compute the week dates based on offset
  const baseMonday = getMonday(today);
  const offsetMonday = new Date(baseMonday);
  offsetMonday.setDate(baseMonday.getDate() + weekOffset * 7);
  const weekDates = getWeekDates(offsetMonday);

  const start = formatDate(weekDates[0]);
  const end = formatDate(weekDates[4]);

  // Set expanded to today's index when on current week
  useEffect(() => {
    if (weekOffset === 0) {
      const todayIdx = weekDates.findIndex((d) => isSameDay(d, today));
      setExpandedIndex(todayIdx >= 0 ? todayIdx : null);
    } else {
      setExpandedIndex(null);
    }
  }, [weekOffset]);

  // Fetch notes on week change
  useEffect(() => {
    fetchNotes(start, end)
      .then(setNotes)
      .catch((err) => console.error('Failed to load notes:', err));
  }, [start, end]);

  // Fetch tasks + sync status on week change (and after OAuth redirect)
  const loadTasks = useCallback(() => {
    fetchReminders(start, end)
      .then((data) => setReminders(data.reminders || []))
      .catch((err) => console.error('Failed to load tasks:', err));

    fetchSyncStatus()
      .then((data) => {
        setLastSynced(data.lastSynced);
        setSyncConfigured(data.configured);
        setGoogleAppConfigured(data.googleAppConfigured || false);
      })
      .catch(() => {});
  }, [start, end]);

  useEffect(() => {
    loadTasks();

    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      window.history.replaceState({}, '', '/');
      setTimeout(loadTasks, 500);
    }
  }, [loadTasks]);

  const handleToggle = useCallback((index) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }, []);

  const handleNoteChange = useCallback((dateKey, value) => {
    setNotes((prev) => ({ ...prev, [dateKey]: value }));
    if (debounceTimers.current[dateKey]) {
      clearTimeout(debounceTimers.current[dateKey]);
    }
    debounceTimers.current[dateKey] = setTimeout(() => {
      saveNote(dateKey, value).catch((err) => console.error('Failed to save note:', err));
    }, 600);
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncReminders();
      setLastSynced(result.synced_at);
      const data = await fetchReminders(start, end);
      setReminders(data.reminders || []);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }, [start, end]);

  const handleToggleReminder = useCallback(async (uid) => {
    setReminders((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, completed: !r.completed } : r))
    );
    try {
      await toggleReminder(uid);
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
      setReminders((prev) =>
        prev.map((r) => (r.uid === uid ? { ...r, completed: !r.completed } : r))
      );
    }
  }, []);

  const handleAddReminder = useCallback(async (title, dateKey) => {
    try {
      const result = await createReminder(title, dateKey);
      setReminders((prev) => [
        ...prev,
        { uid: result.uid, title: result.title, due_date: result.dueDate, completed: false, priority: 0 },
      ]);
    } catch (err) {
      console.error('Failed to create reminder:', err);
    }
  }, []);

  const handleMoveReminder = useCallback(async (uid, newDateKey) => {
    setReminders((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, due_date: newDateKey } : r))
    );
    try {
      await moveReminder(uid, newDateKey);
    } catch (err) {
      console.error('Failed to move task:', err);
      const data = await fetchReminders(start, end);
      setReminders(data.reminders || []);
    }
  }, [start, end]);

  const handleDeleteReminder = useCallback(async (uid) => {
    setReminders((prev) => prev.filter((r) => r.uid !== uid));
    try {
      await deleteReminder(uid);
    } catch (err) {
      console.error('Failed to delete task:', err);
      const data = await fetchReminders(start, end);
      setReminders(data.reminders || []);
    }
  }, [start, end]);

  const handlePrevWeek = useCallback(() => setWeekOffset((o) => o - 1), []);
  const handleNextWeek = useCallback(() => setWeekOffset((o) => o + 1), []);
  const handleToday = useCallback(() => setWeekOffset(0), []);

  const handleGoToDate = useCallback((dateStr) => {
    const target = new Date(dateStr + 'T00:00:00');
    const targetMonday = getMonday(target);
    const diff = Math.round((targetMonday - baseMonday) / (7 * 86400000));
    setWeekOffset(diff);
    setViewMode('week');
  }, [baseMonday]);

  // Drag state management — show calendar overlay after a brief hold
  const handleTaskDragStart = useCallback((uid, title) => {
    // Show overlay after 600ms of holding the drag (gives time for same-week drops)
    dragTimeoutRef.current = setTimeout(() => {
      setDraggingTask({ uid, title });
    }, 600);
  }, []);

  const handleTaskDragEnd = useCallback(() => {
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
      dragTimeoutRef.current = null;
    }
    setDraggingTask(null);
  }, []);

  const handleCalendarDrop = useCallback(async (newDateKey) => {
    if (!draggingTask) return;
    const { uid } = draggingTask;
    setDraggingTask(null);
    await handleMoveReminder(uid, newDateKey);
    // Navigate to the dropped week
    handleGoToDate(newDateKey);
    // Reload tasks for that week
    setTimeout(loadTasks, 300);
  }, [draggingTask, handleMoveReminder, handleGoToDate, loadTasks]);

  const handleCalendarDropCancel = useCallback(() => {
    setDraggingTask(null);
  }, []);

  // Build per-day reminders map
  const remindersByDay = {};
  for (const dateObj of weekDates) {
    const key = formatDate(dateObj);
    remindersByDay[key] = [];
  }
  for (const r of reminders) {
    const dueKey = r.due_date ? new Date(r.due_date).toISOString().split('T')[0] : null;
    if (dueKey && remindersByDay[dueKey]) {
      remindersByDay[dueKey].push(r);
    } else if (!dueKey) {
      if (remindersByDay[todayKey]) {
        remindersByDay[todayKey].push(r);
      }
    }
    if (dueKey && dueKey < start && !r.completed) {
      const showKey = weekOffset === 0 ? todayKey : start;
      if (remindersByDay[showKey] && !remindersByDay[showKey].find((x) => x.uid === r.uid)) {
        remindersByDay[showKey].push({ ...r, overdue: true });
      }
    }
  }

  for (const key of Object.keys(remindersByDay)) {
    remindersByDay[key] = remindersByDay[key].map((r) => {
      const dueKey = r.due_date ? new Date(r.due_date).toISOString().split('T')[0] : null;
      if (dueKey && dueKey < todayKey && !r.completed) {
        return { ...r, overdue: true };
      }
      return r;
    });
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg-primary">
      <TopBar
        today={today}
        weekDates={weekDates}
        weekOffset={weekOffset}
        onPrevWeek={handlePrevWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
        onSync={handleSync}
        syncing={syncing}
        lastSynced={lastSynced}
        syncConfigured={syncConfigured}
        googleAppConfigured={googleAppConfigured}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {viewMode === 'week' ? (
        <main className="flex-1 flex gap-4 p-6">
          {weekDates.map((date, i) => {
            const dateKey = formatDate(date);
            const dayReminders = remindersByDay[dateKey] || [];
            return (
              <DayColumn
                key={dateKey}
                date={date}
                dateKey={dateKey}
                theme={DAY_THEMES[i]}
                isToday={isSameDay(date, today)}
                isExpanded={expandedIndex === i}
                onToggle={() => handleToggle(i)}
                note={notes[dateKey] || ''}
                onNoteChange={(val) => handleNoteChange(dateKey, val)}
                taskCount={dayReminders.filter((r) => !r.completed).length}
                eventCount={0}
                reminders={dayReminders}
                onToggleReminder={handleToggleReminder}
                onMoveReminder={handleMoveReminder}
                onDeleteReminder={handleDeleteReminder}
                onAddReminder={handleAddReminder}
                onTaskDragStart={handleTaskDragStart}
                onTaskDragEnd={handleTaskDragEnd}
                weekDates={weekDates}
              />
            );
          })}
        </main>
      ) : (
        <CalendarView
          today={today}
          reminders={reminders}
          weekDates={weekDates}
          onGoToDate={handleGoToDate}
        />
      )}

      {/* Calendar drop overlay — appears when dragging a task for 600ms */}
      {draggingTask && (
        <CalendarDropOverlay
          today={today}
          taskTitle={draggingTask.title}
          onDrop={handleCalendarDrop}
          onCancel={handleCalendarDropCancel}
        />
      )}
    </div>
  );
}
