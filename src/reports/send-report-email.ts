/**
 * Sends the daily Excel report by email.
 * Requires SMTP and REPORT_EMAIL to be configured.
 */

import nodemailer from "nodemailer";

export interface ReportEmailConfig {
  to: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
}

export async function sendReportEmail(
  buffer: Buffer,
  config: ReportEmailConfig
): Promise<void> {
  const { to, smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass } = config;
  if (!to || !smtpHost) {
    throw new Error("REPORT_EMAIL and SMTP_HOST are required to send the daily report.");
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort ?? 587,
    secure: smtpSecure ?? false,
    auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
  });

  const date = new Date().toLocaleDateString("he-IL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  await transporter.sendMail({
    from: smtpUser ?? "report@pipedrive-sales-ai",
    to,
    subject: `דוח חדרים פנויים – ${date}`,
    text: `מצורף דוח חדרים פנויים נכון להיום (${date}).`,
    html: `<p>מצורף דוח חדרים פנויים נכון להיום (<strong>${date}</strong>).</p>`,
    attachments: [
      {
        filename: `חדרים-פנויים-${new Date().toISOString().slice(0, 10)}.xlsx`,
        content: buffer,
      },
    ],
  });
}
