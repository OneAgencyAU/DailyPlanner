const API_BASE = '/api';

export async function fetchNotes(startDate, endDate) {
  const res = await fetch(`${API_BASE}/notes?start=${startDate}&end=${endDate}`);
  if (!res.ok) throw new Error('Failed to fetch notes');
  return res.json();
}

export async function saveNote(date, note) {
  const res = await fetch(`${API_BASE}/notes/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  if (!res.ok) throw new Error('Failed to save note');
  return res.json();
}

// ─── Tasks (Google Tasks) ───────────────────────────────────

export async function fetchReminders(startDate, endDate) {
  const res = await fetch(`${API_BASE}/reminders?start=${startDate}&end=${endDate}`);
  if (!res.ok) throw new Error('Failed to fetch reminders');
  return res.json();
}

export async function fetchSyncStatus() {
  const res = await fetch(`${API_BASE}/reminders/status`);
  if (!res.ok) throw new Error('Failed to fetch sync status');
  return res.json();
}

export async function syncReminders() {
  const res = await fetch(`${API_BASE}/reminders/sync`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Sync failed');
  }
  return res.json();
}

export async function toggleReminder(uid) {
  const res = await fetch(`${API_BASE}/reminders/${uid}/toggle`, { method: 'PATCH' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to toggle reminder');
  }
  return res.json();
}

export async function createReminder(title, dueDate) {
  const res = await fetch(`${API_BASE}/reminders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, dueDate }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create reminder');
  }
  return res.json();
}

export async function disconnectGoogle() {
  const res = await fetch(`${API_BASE}/auth/google/disconnect`, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to disconnect');
  return res.json();
}

export function getGoogleAuthUrl() {
  return `${API_BASE}/auth/google`;
}
