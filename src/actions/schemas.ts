import { z } from "zod";

export const summarizeDealInput = z.object({
  dealId: z.number().int().positive(),
});
export type SummarizeDealInput = z.infer<typeof summarizeDealInput>;

export const draftFollowupEmailInput = z.object({
  dealId: z.number().int().positive(),
  context: z.string().optional(),
});
export type DraftFollowupEmailInput = z.infer<typeof draftFollowupEmailInput>;

export const createNoteInput = z.object({
  dealId: z.number().int().positive(),
  content: z.string().min(1).max(64000),
});
export type CreateNoteInput = z.infer<typeof createNoteInput>;

export const createActivityInput = z.object({
  dealId: z.number().int().positive(),
  subject: z.string().min(1).max(500),
  dueDate: z.string(), // YYYY-MM-DD
  type: z.string().min(1).max(100),
});
export type CreateActivityInput = z.infer<typeof createActivityInput>;

export const moveStageInput = z.object({
  dealId: z.number().int().positive(),
  stageId: z.number().int().positive(),
});
export type MoveStageInput = z.infer<typeof moveStageInput>;

export const weeklyReportInput = z.object({
  ownerId: z.number().int().positive().optional(),
  days: z.number().int().min(1).max(90).optional().default(7),
});
export type WeeklyReportInput = z.infer<typeof weeklyReportInput>;

export const actionInputSchemas = {
  summarize_deal: summarizeDealInput,
  draft_followup_email: draftFollowupEmailInput,
  create_note: createNoteInput,
  create_activity: createActivityInput,
  move_stage: moveStageInput,
  weekly_report: weeklyReportInput,
} as const;

export type ActionType = keyof typeof actionInputSchemas;
