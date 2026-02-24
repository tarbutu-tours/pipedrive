-- Run this in Supabase SQL Editor to create tables for WEBTARBUTU chatbot

-- Sessions: one per user (phone or web session_id)
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'web')),
  external_id TEXT NOT NULL,  -- phone number (WhatsApp) or session_id (web)
  intent TEXT,                 -- 'sales' | 'support'
  name TEXT,
  phone TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  bot_paused_until TIMESTAMPTZ, -- human takeover: pause until this time
  pipedrive_person_id BIGINT,
  pipedrive_deal_id BIGINT,
  monday_item_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel, external_id)
);

-- All messages (incoming + outgoing) for full history and abandoned chats
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  from_human_agent BOOLEAN DEFAULT FALSE,  -- true when sent from phone/dashboard
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leads (captured for sales): denormalized for admin table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT 'sales',
  crm_status TEXT DEFAULT 'new',  -- new | contacted | won | lost
  pipedrive_deal_id BIGINT,
  chat_summary TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Support requests (for Monday.com sync)
CREATE TABLE IF NOT EXISTS support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  phone TEXT,
  issue_description TEXT,
  monday_item_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global bot pause (admin "Pause Bot" button)
CREATE TABLE IF NOT EXISTS bot_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO bot_config (key, value) VALUES ('global_bot_paused', 'false')
ON CONFLICT (key) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_external ON chat_sessions(channel, external_id);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- RLS (optional): enable if you use Supabase auth for admin
-- ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
