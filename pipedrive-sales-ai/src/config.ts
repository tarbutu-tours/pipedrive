export const config = {
  port: parseInt(process.env.PORT ?? "3000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? "",
  pipedrive: {
    apiToken: process.env.PIPEDRIVE_API_TOKEN ?? "",
    domain: process.env.PIPEDRIVE_DOMAIN ?? "https://api.pipedrive.com",
  },
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-in-production",
  rateLimitChat: parseInt(process.env.RATE_LIMIT_CHAT ?? "20", 10),
  rateLimitConfirm: parseInt(process.env.RATE_LIMIT_CONFIRM ?? "30", 10),
  /** Daily report: Excel with available rooms, sent at 9:00. */
  report: {
    email: process.env.REPORT_EMAIL ?? "",
    smtpHost: process.env.SMTP_HOST ?? "",
    smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
    smtpSecure: process.env.SMTP_SECURE === "true",
    smtpUser: process.env.SMTP_USER ?? "",
    smtpPass: process.env.SMTP_PASS ?? "",
  },
};
