import { getWeekNumber } from '../utils/days';

export default function TopBar({ today, onSync, syncing, lastSynced, syncConfigured }) {
  const dayName = today.toLocaleDateString('en-AU', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const weekNum = getWeekNumber(today);

  const syncLabel = syncing
    ? 'Syncing…'
    : lastSynced
      ? `Synced ${new Date(lastSynced).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
      : 'Sync Reminders';

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
        {syncConfigured && (
          <button
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:border-border-bright transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={syncing ? 'animate-spin' : ''}
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            {syncLabel}
          </button>
        )}
        <span className="text-text-secondary text-sm">Week {weekNum}</span>
        <div className="h-5 w-px bg-border" />
        <span className="text-text-primary text-sm font-medium">{dayName}</span>
        <span className="text-text-secondary text-sm">{dateStr}</span>
      </div>
    </header>
  );
}
