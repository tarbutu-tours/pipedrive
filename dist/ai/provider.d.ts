/**
 * Pluggable AI provider: Anthropic (Claude) if key set, else rules-based planner.
 * Output is strict JSON only; guardrails: never invent IDs, ask for missing info.
 */
import type { PlanOutput } from "./types.js";
export declare function planFromAI(message: string): Promise<PlanOutput>;
//# sourceMappingURL=provider.d.ts.map