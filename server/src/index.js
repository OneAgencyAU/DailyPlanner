import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';
import { fetchAllReminders, completeReminderOnServer, uncompleteReminderOnServer, createReminderOnServer } from './caldav.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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
      // Format date as YYYY-MM-DD string
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

// ─── Reminders ──────────────────────────────────────────────

// Get cached reminders for a date range
app.get('/api/reminders', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params required' });
  }
  try {
    // Fetch reminders with due date in range OR no due date (shown on today)
    const result = await pool.query(
      `SELECT uid, title, due_date, completed, completed_at, priority, calendar_name
       FROM reminders
       WHERE (due_date >= $1 AND due_date <= $2)
          OR due_date IS NULL
       ORDER BY completed ASC, priority DESC, title ASC`,
      [start, end]
    );
    res.json({ reminders: result.rows, synced_at: null });
  } catch (err) {
    console.error('Error fetching reminders:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get last sync timestamp
app.get('/api/reminders/status', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT synced_at FROM reminders ORDER BY synced_at DESC LIMIT 1`
    );
    res.json({
      lastSynced: result.rows.length > 0 ? result.rows[0].synced_at : null,
      configured: !!(process.env.APPLE_CALDAV_USERNAME && process.env.APPLE_CALDAV_APP_PASSWORD),
    });
  } catch (err) {
    console.error('Error fetching sync status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Trigger a fresh sync from iCloud
app.post('/api/reminders/sync', async (req, res) => {
  try {
    if (!process.env.APPLE_CALDAV_USERNAME || !process.env.APPLE_CALDAV_APP_PASSWORD) {
      return res.status(400).json({ error: 'Apple CalDAV credentials not configured' });
    }

    console.log('Starting iCloud Reminders sync...');
    const reminders = await fetchAllReminders();
    console.log(`Fetched ${reminders.length} reminders from iCloud`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear old reminders and insert fresh
      await client.query('DELETE FROM reminders');

      for (const r of reminders) {
        await client.query(
          `INSERT INTO reminders (uid, etag, calendar_name, title, due_date, completed, completed_at, priority, raw_vcal, url, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [r.uid, r.etag, r.calendarName, r.title, r.dueDate, r.completed, r.completedAt, r.priority, r.rawVcal, r.url]
        );
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    res.json({ count: reminders.length, synced_at: new Date().toISOString() });
  } catch (err) {
    console.error('Sync failed:', err);
    res.status(500).json({ error: `Sync failed: ${err.message}` });
  }
});

// Toggle reminder completion (two-way sync)
app.patch('/api/reminders/:uid/toggle', async (req, res) => {
  const { uid } = req.params;
  try {
    // Get current reminder from cache
    const result = await pool.query(
      'SELECT uid, url, etag, raw_vcal, completed FROM reminders WHERE uid = $1',
      [uid]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    const reminder = result.rows[0];
    const newCompleted = !reminder.completed;

    // Update on iCloud
    let updatedVcal;
    if (newCompleted) {
      updatedVcal = await completeReminderOnServer(reminder.url, reminder.etag, reminder.raw_vcal);
    } else {
      updatedVcal = await uncompleteReminderOnServer(reminder.url, reminder.etag, reminder.raw_vcal);
    }

    // Update local cache
    await pool.query(
      `UPDATE reminders
       SET completed = $1, completed_at = $2, raw_vcal = $3, synced_at = NOW()
       WHERE uid = $4`,
      [newCompleted, newCompleted ? new Date() : null, updatedVcal, uid]
    );

    res.json({ uid, completed: newCompleted });
  } catch (err) {
    console.error('Error toggling reminder:', err);
    res.status(500).json({ error: `Failed to update: ${err.message}` });
  }
});

// Create a new reminder on iCloud
app.post('/api/reminders', async (req, res) => {
  const { title, dueDate } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  try {
    if (!process.env.APPLE_CALDAV_USERNAME || !process.env.APPLE_CALDAV_APP_PASSWORD) {
      return res.status(400).json({ error: 'Apple CalDAV credentials not configured' });
    }

    const reminder = await createReminderOnServer(title, dueDate || null);

    // Add to local cache
    await pool.query(
      `INSERT INTO reminders (uid, etag, calendar_name, title, due_date, completed, priority, raw_vcal, url, synced_at)
       VALUES ($1, $2, $3, $4, $5, false, 0, $6, $7, NOW())
       ON CONFLICT (uid) DO NOTHING`,
      [reminder.uid, reminder.etag, 'Reminders', title, dueDate || null, reminder.rawVcal, reminder.url]
    );

    res.json({ uid: reminder.uid, title, dueDate: dueDate || null, completed: false });
  } catch (err) {
    console.error('Error creating reminder:', err);
    res.status(500).json({ error: `Failed to create: ${err.message}` });
  }
});

// Diagnostic endpoint — test CalDAV connection step by step
app.get('/api/reminders/test', async (req, res) => {
  const steps = [];
  const push = (step, data) => steps.push({ step, ...data });

  const username = process.env.APPLE_CALDAV_USERNAME;
  const password = process.env.APPLE_CALDAV_APP_PASSWORD;

  push('credentials', {
    username: username ? `${username.slice(0, 3)}***${username.slice(-4)}` : null,
    passwordSet: !!password,
    passwordLength: password?.length || 0,
  });

  if (!username || !password) {
    return res.json({ ok: false, steps, error: 'Credentials not set' });
  }

  // Step 1: Create client
  let client;
  try {
    const { createDAVClient } = await import('tsdav');
    client = await createDAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: { username, password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });
    push('createClient', { ok: true });
  } catch (err) {
    push('createClient', { ok: false, error: err.message, stack: err.stack?.split('\n').slice(0, 5) });
    return res.json({ ok: false, steps });
  }

  // Step 2: Fetch calendars
  let calendars;
  try {
    calendars = await client.fetchCalendars();
    push('fetchCalendars', {
      ok: true,
      count: calendars.length,
      calendars: calendars.map((c) => ({
        displayName: c.displayName,
        url: c.url,
        components: c.components,
        resourcetype: c.resourcetype,
        ctag: c.ctag,
      })),
    });
  } catch (err) {
    push('fetchCalendars', { ok: false, error: err.message, stack: err.stack?.split('\n').slice(0, 5) });
    return res.json({ ok: false, steps });
  }

  // Step 3: Identify VTODO calendars
  const todoCalendars = calendars.filter(
    (cal) =>
      cal.components?.includes('VTODO') ||
      cal.url?.includes('/tasks/') ||
      !cal.components?.includes('VEVENT')
  );
  push('filterTodoCalendars', {
    count: todoCalendars.length,
    names: todoCalendars.map((c) => c.displayName),
  });

  const calsToSearch = todoCalendars.length > 0 ? todoCalendars : calendars;

  // Step 4: Fetch VTODO objects using calendarQuery with VTODO comp-filter
  const { DAVNamespaceShort } = await import('tsdav');
  const allObjects = [];
  for (const cal of calsToSearch) {
    try {
      const responses = await client.calendarQuery({
        url: cal.url,
        props: {
          [`${DAVNamespaceShort.DAV}:getetag`]: {},
          [`${DAVNamespaceShort.CALDAV}:calendar-data`]: {},
        },
        filters: {
          [`${DAVNamespaceShort.CALDAV}:comp-filter`]: {
            _attributes: { name: 'VCALENDAR' },
            [`${DAVNamespaceShort.CALDAV}:comp-filter`]: {
              _attributes: { name: 'VTODO' },
            },
          },
        },
        depth: '1',
      });
      const vtodos = responses.filter((r) => {
        const raw = r.props?.calendarData?._cdata || r.props?.calendarData;
        const data = typeof raw === 'string' ? raw : String(raw ?? '');
        return data.includes('VTODO');
      });
      push(`fetchObjects:${cal.displayName || cal.url}`, {
        ok: true,
        totalResponses: responses.length,
        vtodoCount: vtodos.length,
        sampleData: vtodos.slice(0, 2).map((r) => ({
          href: r.href,
          etag: r.props?.getetag,
          dataPreview: String(r.props?.calendarData?._cdata || r.props?.calendarData || '').slice(0, 500),
        })),
        rawResponseKeys: responses.length > 0 ? Object.keys(responses[0]) : [],
        rawPropsKeys: responses.length > 0 && responses[0].props ? Object.keys(responses[0].props) : [],
      });
      allObjects.push(...vtodos);
    } catch (err) {
      push(`fetchObjects:${cal.displayName || cal.url}`, {
        ok: false,
        error: err.message,
        stack: err.stack?.split('\n').slice(0, 5),
      });
    }
  }

  push('summary', {
    totalVtodos: allObjects.length,
  });

  res.json({ ok: allObjects.length > 0, steps });
});

// Serve client build in production
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Auto-sync reminders on startup if credentials are configured
  if (process.env.APPLE_CALDAV_USERNAME && process.env.APPLE_CALDAV_APP_PASSWORD) {
    try {
      console.log('Auto-syncing reminders on startup...');
      const reminders = await fetchAllReminders();
      console.log(`Startup sync: fetched ${reminders.length} reminders from iCloud`);

      if (reminders.length > 0) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM reminders');
          for (const r of reminders) {
            await client.query(
              `INSERT INTO reminders (uid, etag, calendar_name, title, due_date, completed, completed_at, priority, raw_vcal, url, synced_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
              [r.uid, r.etag, r.calendarName, r.title, r.dueDate, r.completed, r.completedAt, r.priority, r.rawVcal, r.url]
            );
          }
          await client.query('COMMIT');
          console.log(`Startup sync: stored ${reminders.length} reminders in database`);
        } catch (dbErr) {
          await client.query('ROLLBACK');
          console.error('Startup sync DB error:', dbErr);
        } finally {
          client.release();
        }
      }
    } catch (err) {
      console.error('Startup sync failed:', err.message);
    }
  }
});
