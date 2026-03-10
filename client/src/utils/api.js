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
