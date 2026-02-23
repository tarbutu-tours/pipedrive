/**
 * Actions layer: strict allowlist. Write actions require confirmation via ActionRequest.
 * Only execute write actions when called from confirm endpoint with a confirmed ActionRequest.
 */
import type { PipedriveClient } from "../pipedrive/client.js";
import { type ActionType, actionInputSchemas, createActivityInput, createNoteInput, moveStageInput, summarizeDealInput, draftFollowupEmailInput, weeklyReportInput } from "./schemas.js";
export declare const ALLOWLIST: readonly ActionType[];
export declare function isAllowlistedAction(action: string): action is ActionType;
export declare const ACTION_METADATA: Record<ActionType, {
    isWrite: boolean;
    requiresConfirmation: boolean;
}>;
export interface ActionContext {
    pipedrive: PipedriveClient;
    /** When executing a write action, this must be set and the request must be confirmed */
    confirmedActionRequestId?: string;
}
export type ActionResult = {
    ok: true;
    data: unknown;
} | {
    ok: false;
    error: string;
};
export declare function executeAction(ctx: ActionContext, actionType: ActionType, input: unknown): Promise<ActionResult>;
/** Validate input for an action (for confirm endpoint re-validation) */
export declare function validateActionInput(actionType: ActionType, input: unknown): {
    success: true;
    data: unknown;
} | {
    success: false;
    error: string;
};
export { actionInputSchemas, createNoteInput, createActivityInput, moveStageInput, summarizeDealInput, draftFollowupEmailInput, weeklyReportInput, };
//# sourceMappingURL=index.d.ts.map