import type { ActionType } from "../actions/schemas.js";

export interface ChatIntent {
  type: "query" | "action_suggestion";
  /** For action_suggestion: the allowlisted action and draft payload */
  action?: {
    actionType: ActionType;
    input: unknown;
    humanSummary: string;
    requiresConfirmation: boolean;
  };
}

export interface PlanOutput {
  intent: "query" | "action";
  actionType?: ActionType;
  input?: unknown;
  humanSummary?: string;
  requiresConfirmation?: boolean;
}
