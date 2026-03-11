import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';
import { getAuthUrl, exchangeCode, fetchAllTasks, toggleTask, createTask } from './google-tasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── Helpers ────────────────────────────────────────────────

const isGoogleAppConfigured = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Get the stored Google refresh token from the settings table. */
async function getRefreshToken() {
  // Check env var first (fallback), then DB
  if (process.env.GOOGLE_REFRESH_TOKEN) return process.env.GOOGLE_REFRESH_TOKEN;
  try {
    const result = await pool.query("SELECT value FROM settings WHERE key = 'google_refresh_token'");
    return result.rows.length > 0 ? result.rows[0].value : null;
  } catch {
    return null;
  }
}

/** Store the Google refresh token in the settings table. */
async function saveRefreshToken(token) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ('google_refresh_token', $1, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = $1, updated_at = NOW()`,
    [token]
  );
}

/** Build the OAuth2 redirect URI from the request. */
function getRedirectUri(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol;
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}/api/auth/google/callback`;
}

// ─── Health ─────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ─── Notes ──────────────────────────────────────────────────

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

// ─── Google OAuth2 ──────────────────────────────────────────

// Start the OAuth flow — redirects browser to Google
app.get('/api/auth/google', (req, res) => {
  if (!isGoogleAppConfigured()) {
    return res.status(400).json({ error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars not set' });
  }
  const redirectUri = getRedirectUri(req);
  const url = getAuthUrl(redirectUri);
  res.redirect(url);
});

// Google redirects back here with ?code=...
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.redirect('/?auth=error&message=' + encodeURIComponent(error));
  }
  if (!code) {
    return res.redirect('/?auth=error&message=no_code');
  }
  try {
    const redirectUri = getRedirectUri(req);
    const tokens = await exchangeCode(code, redirectUri);
    if (tokens.refresh_token) {
      await saveRefreshToken(tokens.refresh_token);
      console.log('Google Tasks connected successfully');
    }
    res.redirect('/?auth=success');
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/?auth=error&message=' + encodeURIComponent(err.message));
  }
});

// Disconnect Google Tasks
app.post('/api/auth/google/disconnect', async (req, res) => {
  try {
    await pool.query("DELETE FROM settings WHERE key = 'google_refresh_token'");
    res.json({ ok: true });
  } catch (err) {
    console.error('Error disconnecting:', err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ─── Tasks (Google Tasks) ───────────────────────────────────

app.get('/api/reminders', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params required' });
  }
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return res.json({ reminders: [], synced_at: null });
  }
  try {
    const tasks = await fetchAllTasks(refreshToken, start, end);
    res.json({ reminders: tasks, synced_at: new Date().toISOString() });
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: `Failed to fetch tasks: ${err.message}` });
  }
});

app.get('/api/reminders/status', async (req, res) => {
  const refreshToken = await getRefreshToken();
  const connected = !!refreshToken;
  res.json({
    lastSynced: connected ? new Date().toISOString() : null,
    configured: connected,
    googleAppConfigured: isGoogleAppConfigured(),
  });
});

app.post('/api/reminders/sync', async (req, res) => {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return res.status(400).json({ error: 'Google Tasks not connected. Click "Connect Google Tasks" to set up.' });
  }
  try {
    const tasks = await fetchAllTasks(refreshToken);
    res.json({ count: tasks.length, synced_at: new Date().toISOString() });
  } catch (err) {
    console.error('Sync failed:', err);
    res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
});

app.patch('/api/reminders/:uid/toggle', async (req, res) => {
  const { uid } = req.params;
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return res.status(400).json({ error: 'Google Tasks not connected' });
  }
  try {
    const result = await toggleTask(refreshToken, uid);
    res.json(result);
  } catch (err) {
    console.error('Error toggling task:', err);
    res.status(500).json({ error: `Failed to update: ${err.message}` });
  }
});

app.post('/api/reminders', async (req, res) => {
  const { title, dueDate } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return res.status(400).json({ error: 'Google Tasks not connected' });
  }
  try {
    const task = await createTask(refreshToken, title, dueDate || null);
    res.json(task);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: `Failed to create: ${err.message}` });
  }
});

// ─── Static / SPA ───────────────────────────────────────────

const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Google OAuth app configured: ${isGoogleAppConfigured()}`);
});
