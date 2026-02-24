import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { handleIncomingMessage, pauseSessionForHumanTakeover } from './chatRouter.js';
import { getAlertWhatsAppPhone } from './alerts.js';
import { config } from '../config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authPath = path.join(__dirname, '..', '..', '.wwebjs_auth');

let client = null;
let clientReady = false;

export async function initWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: process.env.NODE_ENV === 'production'
      ? { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
      : { headless: true },
  });

  client.on('qr', (qr) => {
    console.log('\n📱 Scan this QR code with WhatsApp on your phone:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    clientReady = true;
    console.log('WhatsApp client ready.');
  });

  client.on('authenticated', () => {
    console.log('WhatsApp authenticated.');
  });

  client.on('auth_failure', (msg) => {
    console.error('WhatsApp auth failure:', msg);
  });

  client.on('disconnected', (reason) => {
    clientReady = false;
    console.log('WhatsApp disconnected:', reason);
  });

  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    const chatId = msg.from;
    const body = msg.body?.trim?.() || '';
    if (!body) return;
    const phone = chatId.replace(/\D/g, '').slice(-10) || chatId;
    try {
      const result = await handleIncomingMessage('whatsapp', chatId, body, { fromHumanAgent: false });
      if (result.reply) {
        await msg.reply(result.reply);
      }
      if (result.alertWhatsApp && getAlertWhatsAppPhone()) {
        try {
          const alertNum = getAlertWhatsAppPhone().replace(/\D/g, '');
          const alertChatId = alertNum.includes('@') ? alertNum : `${alertNum}@s.whatsapp.net`;
          await client.sendMessage(alertChatId, `[${config.agencyName}] Low-confidence reply to ${phone}. Last user message: ${body.slice(0, 200)}`);
        } catch (e) {
          console.error('Alert WhatsApp send failed:', e.message);
        }
      }
    } catch (err) {
      console.error('WhatsApp message handling error:', err);
      await msg.reply('Sorry, something went wrong. Please call us at 03-5260090.');
    }
  });

  client.on('message_create', async (msg) => {
    if (!msg.fromMe) return;
    const chatId = msg.to;
    if (!chatId) return;
    try {
      await pauseSessionForHumanTakeover('whatsapp', chatId);
    } catch (err) {
      console.error('WhatsApp human takeover pause error:', err);
    }
  });

  try {
    await client.initialize();
  } catch (err) {
    console.error('WhatsApp initialize error:', err.message);
  }
}

export function getWhatsAppClient() {
  return clientReady ? client : null;
}
