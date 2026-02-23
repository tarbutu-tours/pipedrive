/**
 * Webhook worker: polls unprocessed webhook_events, marks processed.
 * Also runs the daily "available rooms" Excel report at 9:00 and sends it by email.
 */

import "../load-env.js";
import cron from "node-cron";
import { createDb } from "../db/index.js";
import { config } from "../config.js";
import { createPipedriveClient, createStubPipedriveClient } from "../pipedrive/client.js";
import { buildAvailableRoomsReport } from "../reports/available-rooms-report.js";
import { sendReportEmail } from "../reports/send-report-email.js";

const POLL_MS = 5000;
const BATCH = 20;

const db = createDb();
const pipedrive = config.pipedrive.apiToken
  ? createPipedriveClient({
      apiToken: config.pipedrive.apiToken,
      domain: config.pipedrive.domain,
    })
  : createStubPipedriveClient();

async function runDailyReport() {
  if (!config.report.email || !config.report.smtpHost) {
    console.warn("Daily report skipped: set REPORT_EMAIL and SMTP_HOST (and optionally SMTP_USER, SMTP_PASS) to receive the Excel report.");
    return;
  }
  try {
    const buffer = await buildAvailableRoomsReport(pipedrive);
    await sendReportEmail(buffer, {
      to: config.report.email,
      smtpHost: config.report.smtpHost,
      smtpPort: config.report.smtpPort,
      smtpSecure: config.report.smtpSecure,
      smtpUser: config.report.smtpUser || undefined,
      smtpPass: config.report.smtpPass || undefined,
    });
    console.log("Daily report (חדרים פנויים) sent to", config.report.email);
  } catch (err) {
    console.error("Daily report failed:", err);
  }
}

// 9:00 every day (Israel time)
cron.schedule("0 9 * * *", runDailyReport, { timezone: "Asia/Jerusalem" });
console.log("Daily report scheduled for 9:00 (Asia/Jerusalem)");

async function processBatch() {
  const events = await db.webhookEvent.findMany({
    where: { status: "pending" },
    take: BATCH,
    orderBy: { receivedAt: "asc" },
  });

  for (const event of events) {
    try {
      // MVP: only mark as processed. Do not execute writes; do not call Pipedrive.
      await db.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), status: "processed" },
      });
    } catch (err) {
      console.error("Worker failed for event", event.id, err);
      await db.webhookEvent.update({
        where: { id: event.id },
        data: { status: "failed" },
      }).catch(() => {});
    }
  }
}

async function run() {
  console.log("Webhook worker started");
  for (;;) {
    try {
      await processBatch();
    } catch (e) {
      console.error("Worker poll error", e);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

run();
