import { getLeads, getRecentMessagesForAdmin, getGlobalBotPaused, setGlobalBotPaused } from '../services/supabase.js';

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
}
