import { createDAVClient, DAVNamespaceShort } from 'tsdav';

const ICLOUD_SERVER = 'https://caldav.icloud.com';

/**
 * Generate an iCalendar UTC timestamp string (e.g. 20260310T120000Z).
 */
function icsTimestamp(date = new Date()) {
  return (
    date.getUTCFullYear().toString() +
    String(date.getUTCMonth() + 1).padStart(2, '0') +
    String(date.getUTCDate()).padStart(2, '0') +
    'T' +
    String(date.getUTCHours()).padStart(2, '0') +
    String(date.getUTCMinutes()).padStart(2, '0') +
    String(date.getUTCSeconds()).padStart(2, '0') +
    'Z'
  );
}

/**
 * Update (or insert) a property in raw VCAL data inside the VTODO block.
 * Handles both simple props (KEY:VALUE) and parameterised props (KEY;PARAM=X:VALUE).
 */
function setVtodoProp(vcal, propName, value) {
  // Match the property line (possibly with parameters)
  const regex = new RegExp(`^${propName}[;:][^\\r\\n]*`, 'm');
  if (regex.test(vcal)) {
    return vcal.replace(regex, `${propName}:${value}`);
  }
  // Insert before END:VTODO
  return vcal.replace('END:VTODO', `${propName}:${value}\r\nEND:VTODO`);
}

/**
 * Remove a property line from raw VCAL data.
 */
function removeVtodoProp(vcal, propName) {
  const regex = new RegExp(`^${propName}[;:][^\\r\\n]*\\r?\\n?`, 'gm');
  return vcal.replace(regex, '');
}

/**
 * Increment the SEQUENCE counter in a VTODO (iOS 13+ uses this for sync).
 */
function bumpSequence(vcal) {
  const match = vcal.match(/^SEQUENCE:(\d+)/m);
  const seq = match ? parseInt(match[1], 10) + 1 : 1;
  return setVtodoProp(vcal, 'SEQUENCE', String(seq));
}

/**
 * Create an authenticated CalDAV client for iCloud.
 */
async function getClient() {
  const username = process.env.APPLE_CALDAV_USERNAME;
  const password = process.env.APPLE_CALDAV_APP_PASSWORD;

  if (!username || !password) {
    throw new Error('APPLE_CALDAV_USERNAME and APPLE_CALDAV_APP_PASSWORD must be set');
  }

  const client = await createDAVClient({
    serverUrl: ICLOUD_SERVER,
    credentials: { username, password },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });

  return client;
}

/**
 * Parse a VTODO string to extract reminder fields.
 */
function parseVTodo(vcalData, calendarName) {
  // Unfold iCalendar line folding (RFC 5545 §3.1): lines starting with
  // a space or tab are continuations of the previous line. iOS 13+ Reminders
  // frequently uses long property values that get folded.
  const unfolded = vcalData.replace(/\r?\n[ \t]/g, '');

  const get = (key) => {
    const regex = new RegExp(`^${key}[;:](.*)$`, 'm');
    const match = unfolded.match(regex);
    if (!match) return null;
    // Handle parameters like DUE;VALUE=DATE:20260310
    let val = match[1];
    if (val.includes(':')) {
      val = val.split(':').pop();
    }
    return val.trim();
  };

  const uid = get('UID');
  if (!uid) return null;

  const summary = get('SUMMARY') || '(No title)';
  const status = get('STATUS');
  const completed = status === 'COMPLETED';
  const priority = parseInt(get('PRIORITY') || '0', 10);

  // Parse DUE date — could be DATE or DATE-TIME
  let dueDate = null;
  const dueRaw = get('DUE');
  if (dueRaw) {
    // Format: 20260310 or 20260310T120000Z
    const dateStr = dueRaw.replace(/[TZ]/g, '').slice(0, 8);
    if (dateStr.length === 8) {
      dueDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
  }

  // Parse COMPLETED timestamp
  let completedAt = null;
  const completedRaw = get('COMPLETED');
  if (completedRaw) {
    try {
      const yr = completedRaw.slice(0, 4);
      const mo = completedRaw.slice(4, 6);
      const dy = completedRaw.slice(6, 8);
      const hr = completedRaw.slice(9, 11) || '00';
      const mi = completedRaw.slice(11, 13) || '00';
      const se = completedRaw.slice(13, 15) || '00';
      completedAt = new Date(`${yr}-${mo}-${dy}T${hr}:${mi}:${se}Z`);
    } catch {
      // ignore parse errors
    }
  }

  return {
    uid,
    title: summary,
    dueDate,
    completed,
    completedAt,
    priority,
    calendarName,
  };
}

/**
 * Fetch all reminders (VTODOs) from iCloud across all calendars.
 * Returns parsed reminder objects.
 */
export async function fetchAllReminders() {
  const client = await getClient();

  // Fetch calendars that support VTODO
  const calendars = await client.fetchCalendars();
  console.log(`Found ${calendars.length} calendars:`, calendars.map((c) => ({ name: c.displayName, url: c.url, components: c.components })));

  const todoCalendars = calendars.filter(
    (cal) =>
      cal.components?.includes('VTODO') ||
      cal.url?.includes('/tasks/')
  );

  // If no VTODO-specific calendars found, try all non-VEVENT calendars, then fall back to all
  let calsToSearch = todoCalendars;
  if (calsToSearch.length === 0) {
    calsToSearch = calendars.filter((cal) => !cal.components || !cal.components.includes('VEVENT'));
  }
  if (calsToSearch.length === 0) {
    calsToSearch = calendars;
  }

  console.log(`Searching ${calsToSearch.length} calendars for VTODOs:`, calsToSearch.map((c) => c.displayName));

  const allReminders = [];

  for (const cal of calsToSearch) {
    try {
      // Use fetchCalendarObjects with VTODO filter — tsdav's higher-level API
      // handles response parsing across different server implementations
      const objects = await client.fetchCalendarObjects({
        calendar: cal,
        filters: {
          [`${DAVNamespaceShort.CALDAV}:comp-filter`]: {
            _attributes: { name: 'VCALENDAR' },
            [`${DAVNamespaceShort.CALDAV}:comp-filter`]: {
              _attributes: { name: 'VTODO' },
            },
          },
        },
      });

      console.log(`Calendar "${cal.displayName}": ${objects.length} VTODO objects found`);

      for (const obj of objects) {
        // fetchCalendarObjects returns objects with .data, .etag, .url
        const data = obj.data;
        const etag = obj.etag;
        const url = obj.url;
        if (!data || !data.includes('VTODO')) continue;

        const calName = cal.displayName || 'Reminders';
        const parsed = parseVTodo(data, calName);
        if (parsed) {
          parsed.etag = etag;
          parsed.rawVcal = data;
          parsed.url = url;
          allReminders.push(parsed);
        }
      }
    } catch (err) {
      console.warn(`Skipping calendar ${cal.displayName}: ${err.message}`);
    }
  }

  console.log(`Total reminders parsed: ${allReminders.length}`);
  return allReminders;
}

/**
 * Mark a reminder as completed on iCloud via CalDAV.
 */
export async function completeReminderOnServer(url, etag, rawVcal) {
  const client = await getClient();

  const now = icsTimestamp();

  let updatedVcal = rawVcal;
  updatedVcal = setVtodoProp(updatedVcal, 'STATUS', 'COMPLETED');
  updatedVcal = setVtodoProp(updatedVcal, 'COMPLETED', now);
  updatedVcal = setVtodoProp(updatedVcal, 'PERCENT-COMPLETE', '100');
  updatedVcal = setVtodoProp(updatedVcal, 'DTSTAMP', now);
  updatedVcal = setVtodoProp(updatedVcal, 'LAST-MODIFIED', now);
  updatedVcal = bumpSequence(updatedVcal);

  await client.updateCalendarObject({
    calendarObject: {
      url,
      data: updatedVcal,
      etag,
    },
  });

  return updatedVcal;
}

/**
 * Mark a reminder as incomplete on iCloud via CalDAV.
 */
export async function uncompleteReminderOnServer(url, etag, rawVcal) {
  const client = await getClient();

  const now = icsTimestamp();

  let updatedVcal = rawVcal;

  // Remove completion-related properties
  updatedVcal = removeVtodoProp(updatedVcal, 'COMPLETED');
  updatedVcal = removeVtodoProp(updatedVcal, 'PERCENT-COMPLETE');

  // Set status and update modification timestamps
  updatedVcal = setVtodoProp(updatedVcal, 'STATUS', 'NEEDS-ACTION');
  updatedVcal = setVtodoProp(updatedVcal, 'DTSTAMP', now);
  updatedVcal = setVtodoProp(updatedVcal, 'LAST-MODIFIED', now);
  updatedVcal = bumpSequence(updatedVcal);

  await client.updateCalendarObject({
    calendarObject: {
      url,
      data: updatedVcal,
      etag,
    },
  });

  return updatedVcal;
}

/**
 * Create a new reminder (VTODO) on iCloud via CalDAV.
 */
export async function createReminderOnServer(title, dueDate) {
  const client = await getClient();

  const calendars = await client.fetchCalendars();
  const todoCal = calendars.find(
    (cal) =>
      cal.components?.includes('VTODO') ||
      !cal.components?.includes('VEVENT')
  );

  if (!todoCal) {
    throw new Error('No reminders calendar found on iCloud');
  }

  const uid = crypto.randomUUID();
  const now = icsTimestamp();

  let dueLine = '';
  if (dueDate) {
    const clean = dueDate.replace(/-/g, '');
    dueLine = `DUE;VALUE=DATE:${clean}`;
  }

  const vcalData = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OneAgency//DailyPlanner//EN',
    'BEGIN:VTODO',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `CREATED:${now}`,
    `LAST-MODIFIED:${now}`,
    `SUMMARY:${title}`,
    dueLine || null,
    'STATUS:NEEDS-ACTION',
    'SEQUENCE:0',
    'END:VTODO',
    'END:VCALENDAR',
    '', // trailing newline
  ]
    .filter((line) => line !== null)
    .join('\r\n');

  const response = await client.createCalendarObject({
    calendar: todoCal,
    filename: `${uid}.ics`,
    iCalString: vcalData,
  });

  return {
    uid,
    rawVcal: vcalData,
    url: `${todoCal.url}${uid}.ics`,
    etag: response?.headers?.get?.('etag') || null,
  };
}
