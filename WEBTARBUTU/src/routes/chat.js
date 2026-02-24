import { handleIncomingMessage, getWelcomeOrNext, getOrCreateSessionForUser } from '../services/chatRouter.js';
import { getRecentMessages } from '../services/supabase.js';

export function registerChatRoutes(app) {
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, sessionId: rawSessionId, utm = {} } = req.body || {};
      const sessionId = rawSessionId || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const externalId = sessionId.startsWith('web-') ? sessionId : `web-${sessionId}`;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message required' });
      }
      const result = await handleIncomingMessage('web', externalId, message.trim(), { utm });
      if (result.reply) {
        return res.json({
          reply: result.reply,
          sessionId: externalId,
          leadCaptured: result.leadCaptured || false,
        });
      }
      res.json({ reply: null, sessionId: externalId, leadCaptured: false });
    } catch (err) {
      console.error('POST /api/chat', err);
      res.status(500).json({ error: 'Failed to process message' });
    }
  });

  app.get('/api/chat/history', async (req, res) => {
    try {
      const sessionId = req.query.sessionId;
      if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
      const externalId = sessionId.startsWith('web-') ? sessionId : `web-${sessionId}`;
      const session = await getOrCreateSessionForUser('web', externalId, {});
      const messages = await getRecentMessages(session.id);
      res.json({ messages: messages.map(m => ({ role: m.role, content: m.content, createdAt: m.created_at })) });
    } catch (err) {
      console.error('GET /api/chat/history', err);
      res.status(500).json({ error: 'Failed to load history' });
    }
  });

  app.post('/api/chat/welcome', async (req, res) => {
    try {
      const { sessionId: rawSessionId, utm = {} } = req.body || {};
      const sessionId = rawSessionId || `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const externalId = sessionId.startsWith('web-') ? sessionId : `web-${sessionId}`;
      const result = await getWelcomeOrNext('web', externalId, utm);
      if (result) {
        return res.json({ reply: result.reply, sessionId: externalId });
      }
      res.json({ reply: null, sessionId: externalId });
    } catch (err) {
      console.error('POST /api/chat/welcome', err);
      res.status(500).json({ error: 'Failed to get welcome' });
    }
  });
}
