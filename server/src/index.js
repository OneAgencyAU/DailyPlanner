import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';
import { fetchAllTasks, toggleTask, createTask } from './google-tasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const isGoogleConfigured = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Get notes for a date range (week)
app.get('/api/notes', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params required' });
  }
  try {
    const result = await pool.query(
      'SELECT date, note FROM daily_notes WHERE date >= $1 AND date <= $2',
      [start, end]
    );
    const notes = {};
    for (const row of result.rows) {
      const d = new Date(row.date);
      const key = d.toISOString().split('T')[0];
      notes[key] = row.note;
    }
    res.json(notes);
  } catch (err) {
    console.error('Error fetching notes:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upsert a note for a specific date
app.put('/api/notes/:date', async (req, res) => {
  const { date } = req.params;
  const { note } = req.body;
  try {
    await pool.query(
      `INSERT INTO daily_notes (date, note, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (date)
       DO UPDATE SET note = $2, updated_at = NOW()`,
      [date, note]
    );
    res.json({ date, note });
  } catch (err) {
    console.error('Error saving note:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Tasks (Google Tasks) ───────────────────────────────────

// Get tasks for a date range — fetches directly from Google Tasks API
app.get('/api/reminders', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params required' });
  }
  if (!isGoogleConfigured()) {
    return res.json({ reminders: [], synced_at: null });
  }
  try {
    const tasks = await fetchAllTasks(start, end);
    res.json({ reminders: tasks, synced_at: new Date().toISOString() });
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: `Failed to fetch tasks: ${err.message}` });
  }
});

// Sync status — with Google Tasks, every fetch is live so we just report config status
app.get('/api/reminders/status', (req, res) => {
  res.json({
    lastSynced: isGoogleConfigured() ? new Date().toISOString() : null,
    configured: isGoogleConfigured(),
  });
});

// Manual sync — just re-fetches from Google Tasks (kept for frontend compatibility)
app.post('/api/reminders/sync', async (req, res) => {
  if (!isGoogleConfigured()) {
    return res.status(400).json({ error: 'Google Tasks credentials not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.' });
  }
  try {
    const tasks = await fetchAllTasks();
    res.json({ count: tasks.length, synced_at: new Date().toISOString() });
  } catch (err) {
    console.error('Sync failed:', err);
    res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
});

// Toggle task completion — updates directly on Google Tasks
app.patch('/api/reminders/:uid/toggle', async (req, res) => {
  const { uid } = req.params;
  if (!isGoogleConfigured()) {
    return res.status(400).json({ error: 'Google Tasks not configured' });
  }
  try {
    const result = await toggleTask(uid);
    res.json(result);
  } catch (err) {
    console.error('Error toggling task:', err);
    res.status(500).json({ error: `Failed to update: ${err.message}` });
  }
});

// Create a new task on Google Tasks
app.post('/api/reminders', async (req, res) => {
  const { title, dueDate } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!isGoogleConfigured()) {
    return res.status(400).json({ error: 'Google Tasks not configured' });
  }
  try {
    const task = await createTask(title, dueDate || null);
    res.json(task);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: `Failed to create: ${err.message}` });
  }
});

// Serve client build in production
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Google Tasks configured: ${isGoogleConfigured()}`);
});
