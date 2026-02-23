/**
 * Pluggable AI provider: Anthropic (Claude) if key set, else rules-based planner.
 * Output is strict JSON only; guardrails: never invent IDs, ask for missing info.
 */
import Anthropic from "@anthropic-ai/sdk";
import { rulesBasedPlan, parseStructuredPlan } from "./rules-planner.js";
import { ALLOWLIST } from "../actions/index.js";
const SYSTEM_PROMPT = `You are a sales assistant. You MUST respond with valid JSON only, no markdown or extra text.
Allowed actions (allowlist): ${ALLOWLIST.join(", ")}
- For read-only: use intent "query" or use action types: summarize_deal, draft_followup_email, weekly_report (no confirmation).
- For write operations: use intent "action" with actionType create_note, create_activity, or move_stage and set requiresConfirmation: true.
Never invent deal IDs or stage IDs - if the user did not provide numbers, respond with intent "query" and humanSummary asking for the missing data.
Output format: {"intent":"query"|"action", "actionType?: "<allowlisted>", "input?: {...}", "humanSummary": "string", "requiresConfirmation?: boolean"}`;
export async function planFromAI(message) {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) {
        return rulesBasedPlan(message);
    }
    const client = new Anthropic({ apiKey: key });
    const response = await client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: message }],
    });
    const text = response.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("") || "";
    const parsed = parseStructuredPlan(text);
    if (parsed)
        return parsed;
    return rulesBasedPlan(message);
}
//# sourceMappingURL=provider.js.map