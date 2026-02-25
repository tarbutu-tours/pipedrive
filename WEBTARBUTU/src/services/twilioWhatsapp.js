/**
 * Twilio WhatsApp – קבלת הודעות ב-webhook ושליחת תשובות דרך Twilio API.
 * משתמש במספר הרשמי הקיים (מחובר ל-Twilio). אין סריקת QR, אין מגבלת 4 מכשירים.
 */
import twilio from 'twilio';
import { config } from '../config.js';
import { handleIncomingMessage } from './chatRouter.js';
import { getAlertWhatsAppPhone } from './alerts.js';
import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const statusPath = path.join(__dirname, '..', '..', 'public', 'whatsapp-status.json');

const accountSid = config.twilio?.accountSid;
const authToken = config.twilio?.authToken;
const whatsappFrom = config.twilio?.whatsappFrom;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

function writeStatus(obj) {
  try {
    writeFileSync(statusPath, JSON.stringify({ ...obj, updated: new Date().toISOString() }, null, 2));
  } catch (e) {}
}

export function isTwilioConfigured() {
  return !!(client && whatsappFrom);
}

export async function sendWhatsAppMessage(to, body) {
  if (!client || !whatsappFrom) return;
  let num = to.replace('whatsapp:', '').replace(/\D/g, '');
  if (num.startsWith('0')) num = '972' + num.slice(1);
  if (!num.startsWith('972')) num = '972' + num;
  const toAddr = `whatsapp:+${num}`;
  const fromAddr = whatsappFrom.startsWith('whatsapp:') ? whatsappFrom : `whatsapp:+${whatsappFrom.replace(/\D/g, '')}`;
  await client.messages.create({
    from: fromAddr,
    to: toAddr,
    body,
  });
}

/**
 * מטפל ב-webhook של Twilio (הודעות נכנסות).
 * Twilio שולח POST עם Content-Type: application/x-www-form-urlencoded
 * שדות: From (whatsapp:+...), To, Body
 */
export async function handleTwilioWebhook(req, res) {
  if (!isTwilioConfigured()) {
    res.status(503).send('Twilio not configured');
    return;
  }
  let from = (req.body?.From || '').replace('whatsapp:', '').replace(/\D/g, '');
  if (from.startsWith('0')) from = '972' + from.slice(1);
  if (from && !from.startsWith('972')) from = '972' + from;
  const body = (req.body?.Body || '').trim();
  if (!from) {
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    return;
  }
  res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

  if (!body) return;
  writeStatus({ status: 'connected', message: 'חיבור וואטסאפ (Twilio) פעיל' });
  try {
    const result = await handleIncomingMessage('whatsapp', from, body, { fromHumanAgent: false });
    if (result.reply) {
      await sendWhatsAppMessage(from, result.reply);
    } else if (result.session?.bot_paused_until) {
      await sendWhatsAppMessage(from, 'נציג מתחבר לשיחה, רגע אחד.');
    }
    if (result.alertWhatsApp && getAlertWhatsAppPhone()) {
      try {
        const alertNum = getAlertWhatsAppPhone().replace(/\D/g, '');
        const alertId = alertNum.startsWith('972') ? alertNum : `972${alertNum.replace(/^0/, '')}`;
        await sendWhatsAppMessage(`whatsapp:${alertId}`, `[${config.agencyName}] Low-confidence reply. User: ${body.slice(0, 200)}`);
      } catch (e) {
        console.error('Twilio alert send failed:', e.message);
      }
    }
  } catch (err) {
    console.error('Twilio webhook handling error:', err);
    try {
      await sendWhatsAppMessage(from, 'מצטערים, אירעה שגיאה. נא להתקשר ל-03-5260090.');
    } catch (e) {}
  }
}
