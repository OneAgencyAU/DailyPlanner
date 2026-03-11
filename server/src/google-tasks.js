import { google } from 'googleapis';

/**
 * Create an OAuth2 client. If a refreshToken is provided, set it.
 */
function createOAuth2Client(refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  if (refreshToken) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  }
  return oauth2Client;
}

function getClient(refreshToken) {
  const auth = createOAuth2Client(refreshToken);
  return google.tasks({ version: 'v1', auth });
}

/**
 * Generate the Google OAuth2 consent URL.
 */
export function getAuthUrl(redirectUri) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/tasks'],
  });
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(code, redirectUri) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Fetch all task lists the user has.
 */
export async function fetchTaskLists(refreshToken) {
  const client = getClient(refreshToken);
  const res = await client.tasklists.list({ maxResults: 100 });
  return res.data.items || [];
}

/**
 * Fetch all tasks across all lists, optionally filtered by due date range.
 * Returns a flat array with list name attached.
 */
export async function fetchAllTasks(refreshToken, startDate, endDate) {
  const client = getClient(refreshToken);
  const lists = await fetchTaskLists(refreshToken);

  const allTasks = [];
  const seenIds = new Set();

  for (const list of lists) {
    // First: fetch tasks with due dates in range
    if (startDate && endDate) {
      let pageToken = null;
      do {
        const res = await client.tasks.list({
          tasklist: list.id,
          maxResults: 100,
          showCompleted: true,
          showHidden: false,
          dueMin: new Date(startDate + 'T00:00:00Z').toISOString(),
          dueMax: new Date(endDate + 'T23:59:59Z').toISOString(),
          pageToken,
        });
        for (const task of res.data.items || []) {
          if (!task.title || seenIds.has(task.id)) continue;
          seenIds.add(task.id);
          allTasks.push(formatTask(task, list.title, list.id));
        }
        pageToken = res.data.nextPageToken;
      } while (pageToken);
    }

    // Second: fetch ALL incomplete tasks (no date filter) — this catches
    // tasks with no due date, overdue tasks, and tasks with only reminders
    let pageToken = null;
    do {
      const res = await client.tasks.list({
        tasklist: list.id,
        maxResults: 100,
        showCompleted: false,
        showHidden: false,
        pageToken,
      });
      for (const task of res.data.items || []) {
        if (!task.title || seenIds.has(task.id)) continue;
        seenIds.add(task.id);
        allTasks.push(formatTask(task, list.title, list.id));
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  }

  return allTasks;
}

function formatTask(task, listTitle, listId) {
  return {
    uid: task.id,
    title: task.title,
    due_date: task.due ? task.due.split('T')[0] : null,
    completed: task.status === 'completed',
    completed_at: task.completed || null,
    priority: 0,
    calendar_name: listTitle,
    notes: task.notes || null,
    _tasklistId: listId,
  };
}

/**
 * Toggle a task's completion status.
 */
export async function toggleTask(refreshToken, taskId) {
  const client = getClient(refreshToken);
  const lists = await fetchTaskLists(refreshToken);

  for (const list of lists) {
    try {
      const res = await client.tasks.get({ tasklist: list.id, task: taskId });
      const task = res.data;
      const newStatus = task.status === 'completed' ? 'needsAction' : 'completed';

      const body = { status: newStatus };
      if (newStatus === 'needsAction') {
        body.completed = null;
      }

      const updated = await client.tasks.patch({
        tasklist: list.id,
        task: taskId,
        requestBody: body,
      });

      return {
        uid: updated.data.id,
        completed: updated.data.status === 'completed',
      };
    } catch {
      continue;
    }
  }

  throw new Error('Task not found in any list');
}

/**
 * Create a new task in the default (first) task list.
 */
export async function createTask(refreshToken, title, dueDate) {
  const client = getClient(refreshToken);
  const lists = await fetchTaskLists(refreshToken);
  if (lists.length === 0) {
    throw new Error('No task lists found');
  }

  const tasklistId = lists[0].id;
  const body = {
    title,
    status: 'needsAction',
  };
  if (dueDate) {
    body.due = new Date(dueDate + 'T00:00:00Z').toISOString();
  }

  const res = await client.tasks.insert({
    tasklist: tasklistId,
    requestBody: body,
  });

  return {
    uid: res.data.id,
    title: res.data.title,
    dueDate: res.data.due ? res.data.due.split('T')[0] : null,
    completed: false,
  };
}
