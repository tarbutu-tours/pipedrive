import nodemailer from 'nodemailer';
import { config } from '../config.js';

const transporter = config.alerts?.smtp?.host
  ? nodemailer.createTransport({
      host: config.alerts.smtp.host,
      port: config.alerts.smtp.port,
      secure: config.alerts.smtp.port === 465,
      auth: config.alerts.smtp.user ? { user: config.alerts.smtp.user, pass: config.alerts.smtp.pass } : undefined,
    })
  : null;

export async function sendUnansweredAlert({ channel, externalId, lastMessage, reason }) {
  const to = config.alerts?.email;
  if (!to) return;
  const subject = `[${config.agencyName}] Chat needs attention - ${reason}`;
  const text = [
    `Channel: ${channel}`,
    `User: ${externalId}`,
    `Reason: ${reason}`,
    `Last message: ${lastMessage?.slice(0, 500)}`,
  ].join('\n');
  try {
    if (transporter) {
      await transporter.sendMail({
        from: config.alerts.smtp?.user || 'alerts@noreply.local',
        to,
        subject,
        text,
      });
    }
  } catch (err) {
    console.error('Alert email failed:', err.message);
  }
}

export function getAlertWhatsAppPhone() {
  return config.alerts?.whatsappPhone || null;
}
