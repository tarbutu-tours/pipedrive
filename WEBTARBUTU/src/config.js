import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  agencyName: process.env.AGENCY_NAME || 'תרבותו',
  websiteUrl: process.env.WEBSITE_URL || 'https://tarbutu.co.il',
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
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM, // e.g. whatsapp:+972501234567
  },
};
