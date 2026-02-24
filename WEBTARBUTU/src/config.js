import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  agencyName: process.env.AGENCY_NAME || 'תרבותו',
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY,
  },
  pipedrive: {
    apiToken: process.env.PIPEDRIVE_API_TOKEN,
    domain: process.env.PIPEDRIVE_DOMAIN,
  },
  monday: {
    apiKey: process.env.MONDAY_API_KEY,
    boardId: process.env.MONDAY_BOARD_ID,
  },
  alerts: {
    email: process.env.ALERT_EMAIL,
    whatsappPhone: process.env.ALERT_WHATSAPP_PHONE,
    smtp: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  },
  humanTakeoverPauseMinutes: 60,
};
