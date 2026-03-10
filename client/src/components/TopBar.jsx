import { getWeekNumber } from '../utils/days';

export default function TopBar({ today }) {
  const dayName = today.toLocaleDateString('en-AU', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const weekNum = getWeekNumber(today);

  return (
    <header className="flex items-center justify-between px-8 py-5 border-b border-border">
      <div className="flex items-center gap-6">
        <h1 className="text-xl font-semibold tracking-tight accent-gradient-text">
          ONE AGENCY
        </h1>
        <div className="h-5 w-px bg-border" />
        <span className="text-text-secondary text-sm">Daily Planner</span>
      </div>
      <div className="flex items-center gap-6">
        <span className="text-text-secondary text-sm">Week {weekNum}</span>
        <div className="h-5 w-px bg-border" />
        <span className="text-text-primary text-sm font-medium">{dayName}</span>
        <span className="text-text-secondary text-sm">{dateStr}</span>
      </div>
    </header>
  );
}
