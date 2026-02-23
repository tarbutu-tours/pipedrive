import { z } from "zod";
export declare const summarizeDealInput: z.ZodObject<{
    dealId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    dealId: number;
}, {
    dealId: number;
}>;
export type SummarizeDealInput = z.infer<typeof summarizeDealInput>;
export declare const draftFollowupEmailInput: z.ZodObject<{
    dealId: z.ZodNumber;
    context: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    dealId: number;
    context?: string | undefined;
}, {
    dealId: number;
    context?: string | undefined;
}>;
export type DraftFollowupEmailInput = z.infer<typeof draftFollowupEmailInput>;
export declare const createNoteInput: z.ZodObject<{
    dealId: z.ZodNumber;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    content: string;
    dealId: number;
}, {
    content: string;
    dealId: number;
}>;
export type CreateNoteInput = z.infer<typeof createNoteInput>;
export declare const createActivityInput: z.ZodObject<{
    dealId: z.ZodNumber;
    subject: z.ZodString;
    dueDate: z.ZodString;
    type: z.ZodString;
}, "strip", z.ZodTypeAny, {
    subject: string;
    type: string;
    dealId: number;
    dueDate: string;
}, {
    subject: string;
    type: string;
    dealId: number;
    dueDate: string;
}>;
export type CreateActivityInput = z.infer<typeof createActivityInput>;
export declare const moveStageInput: z.ZodObject<{
    dealId: z.ZodNumber;
    stageId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    dealId: number;
    stageId: number;
}, {
    dealId: number;
    stageId: number;
}>;
export type MoveStageInput = z.infer<typeof moveStageInput>;
export declare const weeklyReportInput: z.ZodObject<{
    ownerId: z.ZodOptional<z.ZodNumber>;
    days: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    days: number;
    ownerId?: number | undefined;
}, {
    ownerId?: number | undefined;
    days?: number | undefined;
}>;
export type WeeklyReportInput = z.infer<typeof weeklyReportInput>;
export declare const actionInputSchemas: {
    readonly summarize_deal: z.ZodObject<{
        dealId: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        dealId: number;
    }, {
        dealId: number;
    }>;
    readonly draft_followup_email: z.ZodObject<{
        dealId: z.ZodNumber;
        context: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        dealId: number;
        context?: string | undefined;
    }, {
        dealId: number;
        context?: string | undefined;
    }>;
    readonly create_note: z.ZodObject<{
        dealId: z.ZodNumber;
        content: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        content: string;
        dealId: number;
    }, {
        content: string;
        dealId: number;
    }>;
    readonly create_activity: z.ZodObject<{
        dealId: z.ZodNumber;
        subject: z.ZodString;
        dueDate: z.ZodString;
        type: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        subject: string;
        type: string;
        dealId: number;
        dueDate: string;
    }, {
        subject: string;
        type: string;
        dealId: number;
        dueDate: string;
    }>;
    readonly move_stage: z.ZodObject<{
        dealId: z.ZodNumber;
        stageId: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        dealId: number;
        stageId: number;
    }, {
        dealId: number;
        stageId: number;
    }>;
    readonly weekly_report: z.ZodObject<{
        ownerId: z.ZodOptional<z.ZodNumber>;
        days: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        days: number;
        ownerId?: number | undefined;
    }, {
        ownerId?: number | undefined;
        days?: number | undefined;
    }>;
};
export type ActionType = keyof typeof actionInputSchemas;
//# sourceMappingURL=schemas.d.ts.map