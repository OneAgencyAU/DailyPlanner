/**
 * One-time script to get a Google OAuth2 refresh token for Google Tasks.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com/
 *   2. Create a project (or use existing)
 *   3. Enable the "Google Tasks API"
 *   4. Go to Credentials → Create OAuth 2.0 Client ID (Web application)
 *   5. Add http://localhost:3000/oauth2callback as an authorized redirect URI
 *   6. Copy the Client ID and Client Secret
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=yyy node scripts/get-google-token.js
 *
 * Then add these env vars to your Railway deployment:
 *   GOOGLE_CLIENT_ID=xxx
 *   GOOGLE_CLIENT_SECRET=yyy
 *   GOOGLE_REFRESH_TOKEN=<the token printed by this script>
 */

import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  'http://localhost:3000/oauth2callback'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/tasks'],
});

console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for callback...\n');

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost:3000');
  if (reqUrl.pathname === '/oauth2callback' && reqUrl.searchParams.get('code')) {
    try {
      const { tokens } = await oauth2Client.getToken(reqUrl.searchParams.get('code'));
      console.log('=== SUCCESS ===\n');
      console.log('Add these environment variables to Railway:\n');
      console.log(`GOOGLE_CLIENT_ID=${CLIENT_ID}`);
      console.log(`GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`);
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('\n===============\n');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Done!</h1><p>You can close this window. Check the terminal for your refresh token.</p>');
      server.close();
    } catch (err) {
      console.error('Error exchanging code:', err.message);
      res.writeHead(500);
      res.end('Error: ' + err.message);
    }
  }
}).listen(3000);
