/**
 * Rules-based planner when ANTHROPIC_API_KEY is not set.
 * Parses user message and returns a structured plan (JSON only). Never invents IDs.
 */
import type { PlanOutput } from "./types.js";
export declare function rulesBasedPlan(message: string): PlanOutput;
export declare function parseStructuredPlan(json: string): PlanOutput | null;
//# sourceMappingURL=rules-planner.d.ts.map