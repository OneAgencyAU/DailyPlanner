import { useState, useEffect, useCallback, useRef } from 'react';
import TopBar from './components/TopBar';
import DayColumn from './components/DayColumn';
import { DAY_THEMES, getWeekDates, formatDate, isSameDay } from './utils/days';
import { fetchNotes, saveNote } from './utils/api';

export default function App() {
  const today = new Date();
  const weekDates = getWeekDates(today);

  const [expandedIndex, setExpandedIndex] = useState(() => {
    const todayIdx = weekDates.findIndex((d) => isSameDay(d, today));
    return todayIdx >= 0 ? todayIdx : null;
  });

  const [notes, setNotes] = useState({});
  const debounceTimers = useRef({});

  // Fetch notes for the current week
  useEffect(() => {
    const start = formatDate(weekDates[0]);
    const end = formatDate(weekDates[4]);
    fetchNotes(start, end)
      .then(setNotes)
      .catch((err) => console.error('Failed to load notes:', err));
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

      // Debounced save (600ms)
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

  return (
    <div className="min-h-screen flex flex-col bg-bg-primary">
      <TopBar today={today} />

      <main className="flex-1 flex gap-4 p-6">
        {weekDates.map((date, i) => {
          const dateKey = formatDate(date);
          return (
            <DayColumn
              key={dateKey}
              date={date}
              theme={DAY_THEMES[i]}
              isToday={isSameDay(date, today)}
              isExpanded={expandedIndex === i}
              onToggle={() => handleToggle(i)}
              note={notes[dateKey] || ''}
              onNoteChange={(val) => handleNoteChange(dateKey, val)}
              taskCount={0}
              eventCount={0}
            />
          );
        })}
      </main>
    </div>
  );
}
