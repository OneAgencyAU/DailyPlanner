import express from 'express';
import cors from 'cors';
import pool from './db.js';

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
