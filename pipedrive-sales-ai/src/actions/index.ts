/**
 * Actions layer: strict allowlist. Write actions require confirmation via ActionRequest.
 * Only execute write actions when called from confirm endpoint with a confirmed ActionRequest.
 */

import type { PipedriveClient } from "../pipedrive/client.js";
import {
  type ActionType,
  actionInputSchemas,
  createActivityInput,
  createNoteInput,
  moveStageInput,
  summarizeDealInput,
  draftFollowupEmailInput,
  weeklyReportInput,
} from "./schemas.js";
import type {
  SummarizeDealInput,
  DraftFollowupEmailInput,
  CreateNoteInput,
  CreateActivityInput,
  MoveStageInput,
  WeeklyReportInput,
} from "./schemas.js";

export const ALLOWLIST: readonly ActionType[] = [
  "summarize_deal",
  "draft_followup_email",
  "create_note",
  "create_activity",
  "move_stage",
  "weekly_report",
] as const;

export function isAllowlistedAction(action: string): action is ActionType {
  return (ALLOWLIST as readonly string[]).includes(action);
}

export const ACTION_METADATA: Record<
  ActionType,
  { isWrite: boolean; requiresConfirmation: boolean }
> = {
  summarize_deal: { isWrite: false, requiresConfirmation: false },
  draft_followup_email: { isWrite: false, requiresConfirmation: false },
  create_note: { isWrite: true, requiresConfirmation: true },
  create_activity: { isWrite: true, requiresConfirmation: true },
  move_stage: { isWrite: true, requiresConfirmation: true },
  weekly_report: { isWrite: false, requiresConfirmation: false },
};

export interface ActionContext {
  pipedrive: PipedriveClient;
  /** When executing a write action, this must be set and the request must be confirmed */
  confirmedActionRequestId?: string;
}

export type ActionResult = { ok: true; data: unknown } | { ok: false; error: string };

export async function executeAction(
  ctx: ActionContext,
  actionType: ActionType,
  input: unknown
): Promise<ActionResult> {
  if (!isAllowlistedAction(actionType)) {
    return { ok: false, error: `Unknown action: ${actionType}` };
  }

  const meta = ACTION_METADATA[actionType];
  if (meta.isWrite && meta.requiresConfirmation) {
    if (!ctx.confirmedActionRequestId) {
      return { ok: false, error: "Write action requires confirmation; no confirmed action request" };
    }
  }

  const schema = actionInputSchemas[actionType];
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  switch (actionType) {
    case "summarize_deal":
      return runSummarizeDeal(ctx, parsed.data as SummarizeDealInput);
    case "draft_followup_email":
      return runDraftFollowupEmail(ctx, parsed.data as DraftFollowupEmailInput);
    case "create_note":
      return runCreateNote(ctx, parsed.data as CreateNoteInput);
    case "create_activity":
      return runCreateActivity(ctx, parsed.data as CreateActivityInput);
    case "move_stage":
      return runMoveStage(ctx, parsed.data as MoveStageInput);
    case "weekly_report":
      return runWeeklyReport(ctx, parsed.data as WeeklyReportInput);
    default:
      return { ok: false, error: `Unimplemented action: ${actionType}` };
  }
}

async function runSummarizeDeal(
  ctx: ActionContext,
  input: SummarizeDealInput
): Promise<ActionResult> {
  try {
    const deal = await ctx.pipedrive.getDeal(input.dealId);
    if (!deal) return { ok: false, error: "Deal not found" };
    const activities = await ctx.pipedrive.listActivities({ dealId: input.dealId, sinceDays: 30 });
    const notes = await ctx.pipedrive.listNotes({ dealId: input.dealId, sinceDays: 30 });
    return {
      ok: true,
      data: {
        deal: { id: deal.id, title: deal.title, value: deal.value, stage_id: deal.stage_id },
        activitiesCount: activities.length,
        notesCount: notes.length,
        recentActivities: activities.slice(0, 5).map((a) => ({ id: a.id, subject: a.subject, type: a.type })),
        recentNotes: notes.slice(0, 3).map((n) => ({ id: n.id, contentPreview: (n.content ?? "").slice(0, 100) })),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runDraftFollowupEmail(
  ctx: ActionContext,
  input: DraftFollowupEmailInput
): Promise<ActionResult> {
  try {
    const deal = await ctx.pipedrive.getDeal(input.dealId);
    if (!deal) return { ok: false, error: "Deal not found" };
    const notes = await ctx.pipedrive.listNotes({ dealId: input.dealId, sinceDays: 14 });
    const draft = `שלום,\n\nבהמשך לעסקה "${deal.title ?? "ללא כותרת"}" (ערך: ${deal.value ?? 0}).\n${input.context ? `הקשר: ${input.context}\n` : ""}\n${notes.length ? `הערות אחרונות: ${notes.slice(0, 2).map((n) => (n.content ?? "").slice(0, 80)).join("; ")}\n` : ""}\nבברכה`;
    return { ok: true, data: { draft } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runCreateNote(ctx: ActionContext, input: CreateNoteInput): Promise<ActionResult> {
  if (!ctx.confirmedActionRequestId) {
    return { ok: false, error: "create_note requires confirmation" };
  }
  try {
    const note = await ctx.pipedrive.createNote({
      dealId: input.dealId,
      content: input.content,
    });
    return { ok: true, data: note };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runCreateActivity(
  ctx: ActionContext,
  input: CreateActivityInput
): Promise<ActionResult> {
  if (!ctx.confirmedActionRequestId) {
    return { ok: false, error: "create_activity requires confirmation" };
  }
  try {
    const activity = await ctx.pipedrive.createActivity({
      dealId: input.dealId,
      subject: input.subject,
      dueDate: input.dueDate,
      type: input.type,
    });
    return { ok: true, data: activity };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runMoveStage(ctx: ActionContext, input: MoveStageInput): Promise<ActionResult> {
  if (!ctx.confirmedActionRequestId) {
    return { ok: false, error: "move_stage requires confirmation" };
  }
  try {
    const deal = await ctx.pipedrive.updateDealStage({
      dealId: input.dealId,
      stageId: input.stageId,
    });
    return { ok: true, data: deal };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function runWeeklyReport(
  ctx: ActionContext,
  input: WeeklyReportInput
): Promise<ActionResult> {
  try {
    const deals = await ctx.pipedrive.searchDeals({
      ownerId: input.ownerId,
      olderThanDaysNoActivity: input.days,
    });
    const summary = {
      periodDays: input.days,
      ownerId: input.ownerId,
      dealsWithNoActivity: deals.length,
      sampleDealIds: deals.slice(0, 10).map((d) => d.id),
    };
    return { ok: true, data: summary };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Validate input for an action (for confirm endpoint re-validation) */
export function validateActionInput(
  actionType: ActionType,
  input: unknown
): { success: true; data: unknown } | { success: false; error: string } {
  if (!isAllowlistedAction(actionType)) {
    return { success: false, error: `Unknown action: ${actionType}` };
  }
  const schema = actionInputSchemas[actionType];
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.message };
  return { success: true, data: parsed.data };
}

export {
  actionInputSchemas,
  createNoteInput,
  createActivityInput,
  moveStageInput,
  summarizeDealInput,
  draftFollowupEmailInput,
  weeklyReportInput,
};
