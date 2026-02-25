import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import { writeFileSync } from 'fs';
import { Document, Packer, Paragraph, TextRun, ImageRun } from 'docx';
import { handleIncomingMessage, pauseSessionForHumanTakeover } from './chatRouter.js';
import { getAlertWhatsAppPhone } from './alerts.js';
import { config } from '../config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authPath = path.join(__dirname, '..', '..', '.wwebjs_auth');
const publicDir = path.join(__dirname, '..', '..', 'public');
const qrPngPath = path.join(publicDir, 'whatsapp-qr.png');
const qrDocxPath = path.join(publicDir, 'whatsapp-qr-document.docx');
const statusPath = path.join(publicDir, 'whatsapp-status.json');

let client = null;
let clientReady = false;

function writeStatus(obj) {
  try {
    writeFileSync(statusPath, JSON.stringify({ ...obj, updated: new Date().toISOString() }, null, 2));
  } catch (e) {}
}

async function saveQrToFile(qr) {
  try {
    const pngBuffer = await QRCode.toBuffer(qr, { type: 'png', width: 400, margin: 2 });
    writeFileSync(qrPngPath, pngBuffer);

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'סריקת וואטסאפ – צ\'אטבוט תרבותו', bold: true, size: 32 })],
            alignment: 'center',
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'סרקו את הברקוד עם האפליקציה וואטסאפ:', size: 28 })],
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'הגדרות → מכשירים מקושרים → חבר מכשיר', size: 24 })],
            spacing: { after: 400 },
          }),
          new Paragraph({
            alignment: 'center',
            children: [
              new ImageRun({
                data: pngBuffer,
                transformation: { width: 400, height: 400 },
                type: 'png',
              }),
            ],
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [new TextRun({ text: 'הברקוד תקף לזמן מוגבל. אם פג תוקפו – הרצו שוב את השרת וצרו מסמך חדש.', italics: true, size: 22 })],
          }),
        ],
      }],
    });
    const docBuffer = await Packer.toBuffer(doc);
    writeFileSync(qrDocxPath, docBuffer);

    console.log('\n📄 קובץ וורד נוצר: public/whatsapp-qr-document.docx');
    console.log('   שולחים את הקובץ למשרד – פותחים ב-Word וסורקים את הברקוד\n');
  } catch (err) {
    console.error('שמירת קובץ QR:', err.message);
  }
}

export async function initWhatsApp() {
  writeStatus({ status: 'starting', message: 'מאתחל וואטסאפ...' });
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: authPath }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,720',
      ],
    },
  });

  client.on('qr', async (qr) => {
    writeStatus({ status: 'qr', message: 'סרקו את הברקוד בטלפון עכשיו' });
    console.log('\n[WhatsApp] 📱 סרקו את הברקוד עכשיו בטלפון (וואטסאפ → הגדרות → מכשירים מקושרים):\n');
    qrcodeTerminal.generate(qr, { small: true });
    await saveQrToFile(qr);
  });

  client.on('ready', () => {
    clientReady = true;
    writeStatus({ status: 'connected', message: 'חיבור וואטסאפ פעיל' });
    console.log('\n[WhatsApp] ✅ חיבור הצליח – הבוט פעיל.\n');
  });

  client.on('authenticated', () => {
    writeStatus({ status: 'authenticated', message: 'מתחבר...' });
    console.log('[WhatsApp] התחברות אושרה, ממתין להפעלה...');
  });

  client.on('auth_failure', (msg) => {
    clientReady = false;
    writeStatus({ status: 'failed', message: 'חיבור נכשל', detail: String(msg) });
    console.error('[WhatsApp] ❌ חיבור נכשל:', msg);
  });

  client.on('disconnected', (reason) => {
    clientReady = false;
    writeStatus({ status: 'disconnected', message: 'נותק', detail: String(reason) });
    console.log('[WhatsApp] נותק:', reason);
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
      await msg.reply('מצטערים, משהו השתבש. נא להתקשר אלינו: 03-5260090.');
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
