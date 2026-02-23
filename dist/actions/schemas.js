import { z } from "zod";
export const summarizeDealInput = z.object({
    dealId: z.number().int().positive(),
});
export const draftFollowupEmailInput = z.object({
    dealId: z.number().int().positive(),
    context: z.string().optional(),
});
export const createNoteInput = z.object({
    dealId: z.number().int().positive(),
    content: z.string().min(1).max(64000),
});
export const createActivityInput = z.object({
    dealId: z.number().int().positive(),
    subject: z.string().min(1).max(500),
    dueDate: z.string(), // YYYY-MM-DD
    type: z.string().min(1).max(100),
});
export const moveStageInput = z.object({
    dealId: z.number().int().positive(),
    stageId: z.number().int().positive(),
});
export const weeklyReportInput = z.object({
    ownerId: z.number().int().positive().optional(),
    days: z.number().int().min(1).max(90).optional().default(7),
});
export const actionInputSchemas = {
    summarize_deal: summarizeDealInput,
    draft_followup_email: draftFollowupEmailInput,
    create_note: createNoteInput,
    create_activity: createActivityInput,
    move_stage: moveStageInput,
    weekly_report: weeklyReportInput,
};
//# sourceMappingURL=schemas.js.map