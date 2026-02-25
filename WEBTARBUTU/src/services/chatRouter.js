import { config } from '../config.js';
import {
  getOrCreateSession,
  getSessionById,
  saveMessage,
  getRecentMessages,
  updateSession,
  createLead,
  createSupportRequest,
  getGlobalBotPaused,
  getSessionByChannelAndExternal,
} from './supabase.js';
import { chatCompletion, summarizeChat } from './openai.js';
import { createPersonAndDeal } from './pipedrive.js';
import { createSupportItem } from './monday.js';
import { sendUnansweredAlert, getAlertWhatsAppPhone } from './alerts.js';

const WELCOME_TEXT = `ברוכים הבאים ל${config.agencyName}! איך נוכל לעזור?
1. מכירות (טיולים והזמנות)
2. שירות לקוחות (הזמנות קיימות / תמיכה)

השיבו 1 או 2.`;

const LEAD_REQUIRED_REPLY = `כדי שאוכל לשלוח לך את הקטלוג והמחירים לווטסאפ, או כדי שהמומחה שלנו יחזור אליך עם הצעה מדויקת – נשמח לשם ומספר טלפון. נא לשלוח: השם והטלפון (למשל דוד כהן, 050-1234567).`;

function normalizePhone(input) {
  const digits = (input || '').replace(/\D/g, '');
  if (digits.length >= 9) return digits.slice(-9);
  return null;
}

/** Israeli mobile: 9 digits starting with 5 (050, 052, 053, 054, 058 etc.) */
function isValidIsraeliPhone(phone) {
  if (!phone || phone.length !== 9) return false;
  return phone[0] === '5';
}

function extractNameAndPhone(text) {
  const trimmed = (text || '').trim();
  const phone = normalizePhone(trimmed);
  const withoutPhone = trimmed.replace(/[\d\-\.\s]{7,}/g, '').trim();
  const name = withoutPhone.replace(/\s*,\s*$/, '').trim() || null;
  return { name: name || null, phone };
}

function isChoosingIntent(msg) {
  const t = (msg || '').trim();
  return t === '1' || t === '2' || t === 'sales' || t === 'support' || t.toLowerCase() === 'sales' || t.toLowerCase() === 'support';
}

function getIntentFromChoice(msg) {
  const t = (msg || '').trim();
  if (t === '1' || t.toLowerCase() === 'sales') return 'sales';
  if (t === '2' || t.toLowerCase() === 'support') return 'support';
  return null;
}

function wantsPricingOrBooking(content) {
  const lower = (content || '').toLowerCase();
  const pricing = /\b(price|מחיר|מחירים|עלות|כמה עולה|תמחיר)\b/.test(lower);
  const booking = /\b(book|הזמנה|להזמין|להרשם|רישום)\b/.test(lower);
  return pricing || booking;
}

export async function getOrCreateSessionForUser(channel, externalId, utm = {}) {
  return getOrCreateSession(channel, externalId, {
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
  });
}

export async function getWelcomeOrNext(channel, externalId, utm = {}) {
  const session = await getOrCreateSessionForUser(channel, externalId, utm);
  const messages = await getRecentMessages(session.id);
  if (messages.length === 0) {
    await saveMessage(session.id, 'assistant', WELCOME_TEXT);
    return { reply: WELCOME_TEXT, session, intent: null, leadCaptured: false, showChoiceButtons: true };
  }
  const last = messages[messages.length - 1];
  if (last.role === 'user' && isChoosingIntent(last.content) && !session.intent) {
    const intent = getIntentFromChoice(last.content);
    if (intent) {
      await updateSession(session.id, { intent });
      const next = intent === 'sales'
        ? 'מעולה, אשמח לעזור עם טיולים והזמנות. על איזה טיול או יעד תרצה לשמוע?'
        : 'אשמח לעזור עם הזמנות קיימות ותמיכה. במה אתה צריך עזרה?';
      await saveMessage(session.id, 'assistant', next);
      return { reply: next, session: { ...session, intent }, intent, leadCaptured: false };
    }
  }
  return null;
}

function isPaused(session) {
  if (session.bot_paused_until) {
    const until = new Date(session.bot_paused_until);
    if (until > new Date()) return true;
  }
  return false;
}

export async function handleIncomingMessage(channel, externalId, content, { fromHumanAgent = false, utm = {} } = {}) {
  const session = await getOrCreateSessionForUser(channel, externalId, utm);
  await saveMessage(session.id, 'user', content, fromHumanAgent);

  const globalPaused = await getGlobalBotPaused();
  if (globalPaused) {
    const reply = `${config.agencyName}: הבוט מושהה. נציג יצור איתך קשר בהקדם.`;
    await saveMessage(session.id, 'assistant', reply);
    return { reply, session, leadCaptured: false };
  }

  if (fromHumanAgent) {
    const pauseUntil = new Date(Date.now() + config.humanTakeoverPauseMinutes * 60 * 1000);
    await updateSession(session.id, { bot_paused_until: pauseUntil.toISOString() });
    return { reply: null, session, leadCaptured: false, paused: true };
  }

  if (isPaused(session)) {
    return { reply: null, session, leadCaptured: false };
  }

  const welcomeNext = await getWelcomeOrNext(channel, externalId, utm);
  if (welcomeNext) return welcomeNext;

  const updatedSession = await getSessionById(session.id);
  const intent = updatedSession?.intent || 'sales';
  const recent = await getRecentMessages(session.id);
  const chatHistory = recent
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

  if (intent === 'support' && !updatedSession.monday_item_id) {
    const mondayItemId = await createSupportItem({
      phone: updatedSession.phone || (channel === 'whatsapp' ? externalId : null),
      issueDescription: content,
    });
    if (mondayItemId) {
      await updateSession(session.id, { monday_item_id: mondayItemId });
      await createSupportRequest(session.id, {
        phone: updatedSession.phone || (channel === 'whatsapp' ? externalId : null),
        issue_description: content,
        monday_item_id: mondayItemId,
      });
    }
  }

  const hasLead = updatedSession?.name && updatedSession?.phone;
  const needsLead = intent === 'sales' && (wantsPricingOrBooking(content) || !hasLead);
  const { name, phone } = extractNameAndPhone(content);
  const mightBeLead = name || phone;

  if (intent === 'sales' && needsLead && mightBeLead) {
    const newName = name || updatedSession.name;
    const newPhone = phone || updatedSession.phone;
    if (newName && newPhone) {
      if (!isValidIsraeliPhone(newPhone)) {
        const invalidReply = 'נראה שהמספר לא תקין. נא לשלוח מספר טלפון ישראלי (למשל 050-1234567).';
        await saveMessage(session.id, 'assistant', invalidReply);
        return { reply: invalidReply, session: updatedSession, leadCaptured: false };
      }
      const summary = await summarizeChat(chatHistory);
      const { personId, dealId } = await createPersonAndDeal({
        name: newName,
        phone: newPhone,
        utm_source: updatedSession.utm_source,
        utm_medium: updatedSession.utm_medium,
        utm_campaign: updatedSession.utm_campaign,
        chatSummary: summary,
      });
      await updateSession(session.id, {
        name: newName,
        phone: newPhone,
        pipedrive_person_id: personId,
        pipedrive_deal_id: dealId,
      });
      await createLead(session.id, {
        name: newName,
        phone: newPhone,
        intent: 'sales',
        chatSummary: summary,
        utm_source: updatedSession.utm_source,
        utm_medium: updatedSession.utm_medium,
        utm_campaign: updatedSession.utm_campaign,
        pipedrive_deal_id: dealId,
      });
      const reply = `תודה ${newName}! קיבלנו את הפרטים. נציג יצור איתך קשר ב-${newPhone} עם מחירים ואפשרויות. אפשר גם להתקשר אלינו: 03-5260090.`;
      await saveMessage(session.id, 'assistant', reply);
      return { reply, session: await getSessionById(session.id), leadCaptured: true };
    }
  }

  /* Value first: we do NOT block with LEAD_REQUIRED_REPLY here. The AI gives value, then asks for contact with "reason why". */
  const { content: assistantContent, confidence } = await chatCompletion(chatHistory.concat([{ role: 'user', content }]), { stream: false, intent });
  await saveMessage(session.id, 'assistant', assistantContent);

  if (confidence < 0.6) {
    await sendUnansweredAlert({
      channel,
      externalId,
      lastMessage: content,
      reason: 'Low confidence answer',
    });
  }

  return {
    reply: assistantContent,
    session: updatedSession,
    leadCaptured: false,
    alertWhatsApp: confidence < 0.6 ? getAlertWhatsAppPhone() : null,
  };
}

export async function pauseSessionForHumanTakeover(channel, externalId) {
  const session = await getSessionByChannelAndExternal(channel, externalId);
  if (!session) return;
  const pauseUntil = new Date(Date.now() + config.humanTakeoverPauseMinutes * 60 * 1000);
  await updateSession(session.id, { bot_paused_until: pauseUntil.toISOString() });
}

export async function handleSupportTicket(sessionId, phone, issueDescription) {
  const mondayItemId = await createSupportItem({ phone, issueDescription });
  if (mondayItemId) {
    await createSupportRequest(sessionId, { phone, issue_description: issueDescription, monday_item_id: mondayItemId });
  }
  return mondayItemId;
}

export { WELCOME_TEXT, getIntentFromChoice };
