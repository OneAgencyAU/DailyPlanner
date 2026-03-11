import { useState, useEffect, useCallback, useRef } from 'react';
import TopBar from './components/TopBar';
import DayColumn from './components/DayColumn';
import { DAY_THEMES, getWeekDates, formatDate, isSameDay } from './utils/days';
import { fetchNotes, saveNote, fetchReminders, syncReminders, toggleReminder, moveReminder, createReminder, fetchSyncStatus } from './utils/api';

export default function App() {
  const today = new Date();
  const weekDates = getWeekDates(today);
  const todayKey = formatDate(today);

  const [expandedIndex, setExpandedIndex] = useState(() => {
    const todayIdx = weekDates.findIndex((d) => isSameDay(d, today));
    return todayIdx >= 0 ? todayIdx : null;
  });

  const [notes, setNotes] = useState({});
  const [reminders, setReminders] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);
  const [syncConfigured, setSyncConfigured] = useState(false);
  const [googleAppConfigured, setGoogleAppConfigured] = useState(false);
  const debounceTimers = useRef({});

  const start = formatDate(weekDates[0]);
  const end = formatDate(weekDates[4]);

  // Fetch notes on mount
  useEffect(() => {
    fetchNotes(start, end)
      .then(setNotes)
      .catch((err) => console.error('Failed to load notes:', err));
  }, []);

  // Fetch tasks + sync status on mount (and after OAuth redirect)
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

    // Handle OAuth redirect (?auth=success)
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      window.history.replaceState({}, '', '/');
      // Re-fetch after a brief delay to let token settle
      setTimeout(loadTasks, 500);
    }
  }, []);

  const handleToggle = useCallback(
    (index) => {
      setExpandedIndex((prev) => (prev === index ? null : index));
    },
    []
  );

  const handleNoteChange = useCallback(
    (dateKey, value) => {
      setNotes((prev) => ({ ...prev, [dateKey]: value }));

      if (debounceTimers.current[dateKey]) {
        clearTimeout(debounceTimers.current[dateKey]);
      }
      debounceTimers.current[dateKey] = setTimeout(() => {
        saveNote(dateKey, value).catch((err) =>
          console.error('Failed to save note:', err)
        );
      }, 600);
    },
    []
  );

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncReminders();
      setLastSynced(result.synced_at);
      // Re-fetch cached reminders after sync
      const data = await fetchReminders(start, end);
      setReminders(data.reminders || []);
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }, [start, end]);

  const handleToggleReminder = useCallback(async (uid) => {
    // Optimistic update
    setReminders((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, completed: !r.completed } : r))
    );
    try {
      await toggleReminder(uid);
    } catch (err) {
      console.error('Failed to toggle reminder:', err);
      // Revert on failure
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
        { uid: result.uid, title: result.title, due_date: result.dueDate, completed: false, priority: 0, calendar_name: 'Reminders' },
      ]);
    } catch (err) {
      console.error('Failed to create reminder:', err);
    }
  }, []);

  const handleMoveReminder = useCallback(async (uid, newDateKey) => {
    // Optimistic update
    setReminders((prev) =>
      prev.map((r) => (r.uid === uid ? { ...r, due_date: newDateKey } : r))
    );
    try {
      await moveReminder(uid, newDateKey);
    } catch (err) {
      console.error('Failed to move task:', err);
      // Reload on failure to revert
      const data = await fetchReminders(start, end);
      setReminders(data.reminders || []);
    }
  }, [start, end]);

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
      // No due date → show on today
      if (remindersByDay[todayKey]) {
        remindersByDay[todayKey].push(r);
      }
    }
    // Overdue: due before this week's start → show on today
    if (dueKey && dueKey < start && !r.completed) {
      if (remindersByDay[todayKey] && !remindersByDay[todayKey].find((x) => x.uid === r.uid)) {
        remindersByDay[todayKey].push({ ...r, overdue: true });
      }
    }
  }

  // Mark overdue items within existing days
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
        onSync={handleSync}
        syncing={syncing}
        lastSynced={lastSynced}
        syncConfigured={syncConfigured}
        googleAppConfigured={googleAppConfigured}
      />

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
              onAddReminder={handleAddReminder}
              weekDates={weekDates}
            />
          );
        })}
      </main>
    </div>
  );
}
