import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import { config } from './config.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerAdminRoutes } from './routes/admin.js';
import { initWhatsApp, getWhatsAppClient } from './services/whatsapp.js';
import { isTwilioConfigured, handleTwilioWebhook } from './services/twilioWhatsapp.js';
import { preloadWebsiteContext, startPeriodicRefresh } from './services/websiteContent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '..', 'public');
const adminIndexPath = path.resolve(publicDir, 'admin', 'index.html');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// דף בית – קישור ללוח ניהול
app.get('/', (req, res) => {
  res.redirect(302, '/admin');
});

// לוח ניהול – לפני static כדי ש-/admin תמיד יוגש מהנתיב הנכון
app.get('/admin', (req, res) => {
  res.sendFile(adminIndexPath, (err) => {
    if (err) {
      console.error('Admin file error:', err);
      res.status(500).send('Admin page not found. Check public/admin/index.html exists.');
    }
  });
});

app.use(express.static(publicDir));

registerChatRoutes(app);
registerAdminRoutes(app);

app.get('/api/whatsapp-status', (req, res) => {
  const statusPath = path.join(publicDir, 'whatsapp-status.json');
  let data = { status: 'unknown', message: '' };
  if (existsSync(statusPath)) {
    try {
      data = JSON.parse(readFileSync(statusPath, 'utf8'));
    } catch (e) {}
  }
  if (getWhatsAppClient()) data.status = 'connected';
  if (isTwilioConfigured()) data.status = data.status === 'unknown' ? 'connected' : data.status;
  res.json(data);
});

app.get('/whatsapp-status', (req, res) => {
  res.sendFile(path.join(publicDir, 'whatsapp-status.html'));
});

app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Twilio WhatsApp webhook – כשמשתמשים ב-Twilio, מגדירים ב-Console את הכתובת הזו
app.post('/webhook/twilio/whatsapp', handleTwilioWebhook);

async function start() {
  const basePort = config.port;
  let port = basePort;
  const maxTries = 10;

  function tryListen(p) {
    return new Promise((resolve, reject) => {
      const server = app.listen(p, () => resolve(server));
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          resolve(null);
        } else {
          reject(err);
        }
      });
    });
  }

  let server = null;
  while (port < basePort + maxTries) {
    server = await tryListen(port);
    if (server) break;
    port++;
  }
  if (!server) {
    console.error(`Could not start: ports ${basePort}-${basePort + maxTries - 1} are in use.`);
    process.exit(1);
  }
  if (port !== basePort) {
    console.log(`Port ${basePort} in use, using ${port} instead.`);
  }
  console.log(`WEBTARBUTU server running at http://localhost:${port}`);
  console.log(`Admin: http://localhost:${port}/admin`);
  preloadWebsiteContext();
  startPeriodicRefresh();
  if (isTwilioConfigured()) {
    console.log('WhatsApp: Twilio API – הבוט יקבל הודעות דרך webhook (אין צורך ב-QR)');
  } else {
    await initWhatsApp();
  }
}

start().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
