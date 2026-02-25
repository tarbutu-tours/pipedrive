import { getLeads, getRecentMessagesForAdmin, getGlobalBotPaused, setGlobalBotPaused, getSessionsForAdmin, getSessionById, updateSession, getSessionByChannelAndExternal, saveMessage } from '../services/supabase.js';
import { isTwilioConfigured, sendWhatsAppMessage } from '../services/twilioWhatsapp.js';

export function registerAdminRoutes(app) {
  app.get('/api/admin/leads', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
      const leads = await getLeads(limit);
      res.json({ leads });
    } catch (err) {
      console.error('GET /api/admin/leads', err);
      res.status(500).json({ error: 'Failed to load leads' });
    }
  });

  app.get('/api/admin/messages', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
      const messages = await getRecentMessagesForAdmin(limit);
      res.json({ messages });
    } catch (err) {
      console.error('GET /api/admin/messages', err);
      res.status(500).json({ error: 'Failed to load messages' });
    }
  });

  app.get('/api/admin/pause', async (req, res) => {
    try {
      const paused = await getGlobalBotPaused();
      res.json({ paused: !!paused });
    } catch (err) {
      console.error('GET /api/admin/pause', err);
      res.status(500).json({ error: 'Failed to get pause status' });
    }
  });

  app.post('/api/admin/pause', async (req, res) => {
    try {
      const { paused } = req.body ?? {};
      await setGlobalBotPaused(!!paused);
      res.json({ paused: !!paused });
    } catch (err) {
      console.error('POST /api/admin/pause', err);
      res.status(500).json({ error: 'Failed to set pause status' });
    }
  });

  app.get('/api/admin/sessions', async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
      const channel = req.query.channel || null;
      const sessions = await getSessionsForAdmin(limit, channel);
      res.json({ sessions });
    } catch (err) {
      console.error('GET /api/admin/sessions', err);
      res.status(500).json({ error: 'Failed to load sessions' });
    }
  });

  app.post('/api/admin/session/:sessionId/takeover', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const pauseMinutes = parseInt(req.body?.pauseMinutes || '60', 10) || 60;
      const until = new Date(Date.now() + pauseMinutes * 60 * 1000);
      await updateSession(sessionId, { bot_paused_until: until.toISOString() });
      res.json({ ok: true, bot_paused_until: until.toISOString() });
    } catch (err) {
      console.error('POST takeover', err);
      res.status(500).json({ error: 'Failed to take over' });
    }
  });

  app.post('/api/admin/session/:sessionId/resume', async (req, res) => {
    try {
      const { sessionId } = req.params;
      await updateSession(sessionId, { bot_paused_until: null });
      res.json({ ok: true });
    } catch (err) {
      console.error('POST resume', err);
      res.status(500).json({ error: 'Failed to resume' });
    }
  });

  app.post('/api/admin/whatsapp/send', async (req, res) => {
    try {
      if (!isTwilioConfigured()) {
        return res.status(503).json({ error: 'WhatsApp (Twilio) not configured' });
      }
      const { to, message } = req.body || {};
      if (!to || !message) {
        return res.status(400).json({ error: 'to and message required' });
      }
      await sendWhatsAppMessage(to, message.trim());
      let externalId = (to || '').replace(/\D/g, '');
      if (externalId.startsWith('0')) externalId = '972' + externalId.slice(1);
      if (externalId && !externalId.startsWith('972')) externalId = '972' + externalId;
      const session = await getSessionByChannelAndExternal('whatsapp', externalId);
      if (session) await saveMessage(session.id, 'assistant', message.trim(), true);
      res.json({ ok: true });
    } catch (err) {
      console.error('POST whatsapp/send', err);
      res.status(500).json({ error: 'Failed to send' });
    }
  });
}
