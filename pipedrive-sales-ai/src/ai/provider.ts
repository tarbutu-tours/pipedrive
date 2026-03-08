/**
 * Pluggable AI provider: Anthropic (Claude) if key set, else rules-based planner.
 * Output is strict JSON only; guardrails: never invent IDs, ask for missing info.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PlanOutput } from "./types.js";
import { rulesBasedPlan, parseStructuredPlan } from "./rules-planner.js";
import { ALLOWLIST } from "../actions/index.js";

const SYSTEM_PROMPT = `You are a sales assistant. You MUST respond with valid JSON only, no markdown or extra text.
Allowed actions (allowlist): ${ALLOWLIST.join(", ")}
- For ANY question about data (sales, pipeline, win rate, leads, deals count, reports, inventory, etc.): use intent "query" with humanSummary briefly describing the question. The system will fetch live data and answer fully.
- For read-only actions: use intent "query" or action types summarize_deal (with dealId), draft_followup_email, weekly_report (no confirmation).
- For write operations: use intent "action" with actionType create_note, create_activity, or move_stage and set requiresConfirmation: true.
Never invent deal IDs or stage IDs - if the user did not provide numbers for an action, respond with intent "query" and humanSummary asking for the missing data.
Output format: {"intent":"query"|"action", "actionType?: "<allowlisted>", "input?: {...}", "humanSummary": "string", "requiresConfirmation?: boolean"}`;

export async function planFromAI(message: string): Promise<PlanOutput> {
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

  const text =
    response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("") || "";

  const parsed = parseStructuredPlan(text);
  if (parsed) return parsed;
  return rulesBasedPlan(message);
}

/**
 * משפר את ניסוח התשובה עם Claude – בלי לשנות עובדות או מספרים.
 * מוסיף מקור אמינות (Pipedrive) אם לא צוין. אם אין מפתח או שהקריאה נכשלת – מחזיר את התשובה המקורית.
 */
export async function polishAnswerWithAI(userQuestion: string, rawAnswer: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || process.env.AI_POLISH_ANSWERS === "false") return rawAnswer;
  if (rawAnswer.length < 80) return rawAnswer; // תשובות קצרות (שגיאות וכו') – לא ללטש

  const client = new Anthropic({ apiKey: key });
  const system = `You are a Hebrew business assistant. Rewrite the given answer in clear, professional Hebrew.
Rules:
- Keep ALL numbers, dates, and facts exactly as they are. Do NOT add, remove, or invent any data.
- Only improve wording and flow. If the answer already mentions "Pipedrive" or "מקור" you may keep it; otherwise add at the very end one line: "מקור: Pipedrive. נתונים חיים."
Output: the rewritten answer only, no preamble.`;

  try {
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 1024,
      system,
      messages: [
        {
          role: "user",
          content: `User question: ${userQuestion}\n\nCurrent answer (rewrite this):\n${rawAnswer}`,
        },
      ],
    });
    const out =
      response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim() || "";
    return out.length > 0 ? out : rawAnswer;
  } catch {
    return rawAnswer;
  }
}

const SOLUTIONS_NO = "NO_RECOMMENDATIONS";

/**
 * מציע 1–3 המלצות מעשיות קצרות על בסיס התשובה בלבד – בלי להמציא נתונים.
 * מחזיר מחרוזת ריקה או NO_RECOMMENDATIONS אם אין צורך בהמלצות, אחרת טקסט ההמלצות (בוליטים).
 */
export async function addSolutionsToAnswer(userQuestion: string, answerText: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || process.env.AI_SUGGEST_SOLUTIONS === "false") return "";

  if (answerText.length < 50) return "";

  const client = new Anthropic({ apiKey: key });
  const system = `You are a Hebrew sales advisor. Based ONLY on the data in the answer below, suggest 1–3 short actionable recommendations (bullets, Hebrew). Do NOT add or change any number or fact from the answer.
If the data does not indicate a clear problem (e.g. no stalled deals, no lost money, no overdue deals, no drop in leads), respond with exactly: ${SOLUTIONS_NO}
Otherwise output only the recommendations, one per line, starting with • or - no other text.`;

  try {
    const response = await client.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 256,
      system,
      messages: [
        {
          role: "user",
          content: `Question: ${userQuestion}\n\nAnswer:\n${answerText}`,
        },
      ],
    });
    const out =
      response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim() || "";
    if (!out || out.toUpperCase().includes(SOLUTIONS_NO)) return "";
    return out;
  } catch {
    return "";
  }
}
