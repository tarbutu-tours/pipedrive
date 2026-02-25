import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const supabase = config.supabase?.url && config.supabase?.anonKey
  ? createClient(config.supabase.url, config.supabase.anonKey)
  : null;

export async function getOrCreateSession(channel, externalId, data = {}) {
  if (!supabase) return null;
  const { data: existing } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('channel', channel)
    .eq('external_id', externalId)
    .single();
  if (existing) {
    if (Object.keys(data).length) {
      await supabase.from('chat_sessions').update({
        ...data,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
      return { ...existing, ...data };
    }
    return existing;
  }
  const { data: created, error } = await supabase
    .from('chat_sessions')
    .insert({ channel, external_id: externalId, ...data })
    .select()
    .single();
  if (error) throw error;
  return created;
}

export async function saveMessage(sessionId, role, content, fromHumanAgent = false) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, role, content, from_human_agent: fromHumanAgent })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getSessionById(sessionId) {
  if (!supabase) return null;
  const { data } = await supabase.from('chat_sessions').select('*').eq('id', sessionId).single();
  return data;
}

export async function getSessionByChannelAndExternal(channel, externalId) {
  if (!supabase) return null;
  const { data } = await supabase
    .from('chat_sessions')
    .select('*')
    .eq('channel', channel)
    .eq('external_id', externalId)
    .single();
  return data;
}

export async function getRecentMessages(sessionId, limit = 30) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('chat_messages')
    .select('role, content, from_human_agent, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);
  return data || [];
}

export async function updateSession(sessionId, updates) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('chat_sessions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createLead(sessionId, { name, phone, intent, chatSummary, utm_source, utm_medium, utm_campaign, pipedrive_deal_id }) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('leads')
    .insert({
      session_id: sessionId,
      name,
      phone,
      intent: intent || 'sales',
      chat_summary: chatSummary,
      utm_source,
      utm_medium,
      utm_campaign,
      pipedrive_deal_id,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createSupportRequest(sessionId, { phone, issue_description, monday_item_id }) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('support_requests')
    .insert({ session_id: sessionId, phone, issue_description, monday_item_id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getLeads(limit = 100) {
  if (!supabase) return [];
  const { data } = await supabase
    .from('leads')
    .select('id, name, phone, intent, crm_status, pipedrive_deal_id, chat_summary, utm_source, utm_medium, utm_campaign, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function getRecentMessagesForAdmin(limit = 50) {
  if (!supabase) return [];
  const { data: messages } = await supabase
    .from('chat_messages')
    .select('id, session_id, role, content, from_human_agent, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!messages?.length) return [];
  const sessionIds = [...new Set(messages.map(m => m.session_id))];
  const { data: sessions } = await supabase
    .from('chat_sessions')
    .select('id, channel, external_id, intent, name, phone')
    .in('id', sessionIds);
  const sessionMap = new Map((sessions || []).map(s => [s.id, s]));
  return messages.map(m => ({
    ...m,
    session: sessionMap.get(m.session_id) || {},
  }));
}

export async function getSessionsForAdmin(limit = 50, channel = null) {
  if (!supabase) return [];
  let q = supabase
    .from('chat_sessions')
    .select('id, channel, external_id, intent, name, phone, bot_paused_until, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (channel) q = q.eq('channel', channel);
  const { data } = await q;
  return data || [];
}

export async function getGlobalBotPaused() {
  if (!supabase) return false;
  const { data } = await supabase.from('bot_config').select('value').eq('key', 'global_bot_paused').single();
  return data?.value === true || data?.value === 'true';
}

export async function setGlobalBotPaused(paused) {
  if (!supabase) return;
  await supabase.from('bot_config').upsert({ key: 'global_bot_paused', value: paused, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

export { supabase };
