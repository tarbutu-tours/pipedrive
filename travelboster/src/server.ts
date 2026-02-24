/**
 * Express server: health + Pipedrive webhook + TravelBooster OAuth callback.
 */

import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import { config } from './config';
import healthRouter from './routes/health';
import webhooksPipedriveRouter from './routes/webhooks.pipedrive';
import { testPipedriveConnection, checkRequiredPipedriveFields } from './services/pipedriveClient';
import { getAuthorizationUrl, exchangeCodeForToken } from './services/travelboosterClient';

// Ensure store directory exists on startup (audit + TB token)
const storeDir = path.join(__dirname, 'store');
if (!fs.existsSync(storeDir)) {
  fs.mkdirSync(storeDir, { recursive: true });
}

const app = express();
app.use(express.json());

app.use('/health', healthRouter);
app.post('/webhooks/pipedrive', webhooksPipedriveRouter);

/** GET /setup – readiness check (no secrets). Use to verify config before going live. */
app.get('/setup', (_req, res) => {
  const hasPipedriveToken = !!config.pipedrive.apiToken?.trim();
  const hasTBCredentials =
    !!config.travelbooster.clientId?.trim() && !!config.travelbooster.clientSecret?.trim();
  const tbTokenPath = path.join(__dirname, 'store', 'tb-token.json');
  const hasTBToken = fs.existsSync(tbTokenPath);
  res.json({
    ready: hasPipedriveToken && hasTBCredentials && hasTBToken,
    pipedriveConfigured: hasPipedriveToken,
    travelboosterCredentialsConfigured: hasTBCredentials,
    travelboosterTokenExists: hasTBToken,
    message: !hasPipedriveToken
      ? 'Set PIPEDRIVE_API_TOKEN in .env'
      : !hasTBCredentials
        ? 'Set TB_CLIENT_ID and TB_CLIENT_SECRET in .env'
        : !hasTBToken
          ? 'Complete OAuth: open GET /tb/auth in browser'
          : 'OK',
  });
});

/** GET /pipedrive/test – validate Pipedrive API token (calls Pipedrive API). */
app.get('/pipedrive/test', async (_req, res) => {
  const result = await testPipedriveConnection();
  if (result.ok) {
    res.json({ ok: true, message: 'Pipedrive token is valid' });
  } else {
    res.status(401).json({ ok: false, error: result.error });
  }
});

/** GET /pipedrive/fields-check – verify required deal/person custom fields exist in Pipedrive. */
app.get('/pipedrive/fields-check', async (_req, res) => {
  const result = await checkRequiredPipedriveFields();
  if (result.error && Object.keys(result.dealFields).length === 0) {
    res.status(401).json(result);
    return;
  }
  res.json(result);
});

// TravelBooster OAuth: step 1 redirect
app.get('/tb/auth', (_req, res) => {
  const url = getAuthorizationUrl();
  res.redirect(url);
});

// TravelBooster OAuth: step 2 callback (GET ?code=...)
app.get('/tb/callback', async (req, res) => {
  const code = req.query?.code as string | undefined;
  if (!code) {
    res.status(400).send('Missing code');
    return;
  }
  try {
    await exchangeCodeForToken(code);
    res.send('TravelBooster token saved. You can close this tab.');
  } catch (e) {
    console.error('Token exchange failed', e);
    res.status(500).send('Token exchange failed. Check server logs.');
  }
});

const port = config.port;
app.listen(port, () => {
  console.log(`TravelBooster agent listening on port ${port}`);
  console.log('  Health:   GET /health');
  console.log('  Setup:    GET /setup (readiness check)');
  console.log('  Pipedrive: GET /pipedrive/test (token), GET /pipedrive/fields-check (required fields)');
  console.log('  Webhook:  POST /webhooks/pipedrive');
  console.log('  TB OAuth: GET /tb/auth → then GET /tb/callback?code=...');
  if (!config.pipedrive.apiToken?.trim()) {
    console.warn('  [WARN] PIPEDRIVE_API_TOKEN is missing – set it in .env');
  }
  if (!config.travelbooster.clientId?.trim() || !config.travelbooster.clientSecret?.trim()) {
    console.warn('  [WARN] TB_CLIENT_ID or TB_CLIENT_SECRET missing – set in .env');
  }
});
