import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerAdminRoutes } from './routes/admin.js';
import { initWhatsApp } from './services/whatsapp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

registerChatRoutes(app);
registerAdminRoutes(app);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

async function start() {
  const port = config.port;
  app.listen(port, () => {
    console.log(`WEBTARBUTU server running at http://localhost:${port}`);
    console.log(`Admin: http://localhost:${port}/admin`);
  });
  await initWhatsApp();
}

start().catch((err) => {
  console.error('Startup error:', err);
  process.exit(1);
});
