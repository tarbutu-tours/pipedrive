/**
 * AI provider: OpenAI או Anthropic (לפי מפתח זמין). אם אין מפתח – rules-based.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { PlanOutput } from "./types.js";
import { rulesBasedPlan, parseStructuredPlan } from "./rules-planner.js";
import { ALLOWLIST } from "../actions/index.js";

const OPENAI_MODEL = "gpt-4o-mini";
const ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";

type Provider = "openai" | "anthropic";

function getProvider(): { provider: Provider; key: string } | null {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) return { provider: "openai", key: openaiKey };
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) return { provider: "anthropic", key: anthropicKey };
  return null;
}

async function callLLM(
  system: string,
  userMessage: string,
  maxTokens: number
): Promise<string> {
  const p = getProvider();
  if (!p) return "";

  if (p.provider === "openai") {
    const client = new OpenAI({ apiKey: p.key });
    const res = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMessage },
      ],
    });
    const text = res.choices?.[0]?.message?.content?.trim() ?? "";
    return text;
  }

  const client = new Anthropic({ apiKey: p.key });
  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const text =
    response.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim() || "";
  return text;
}

const SYSTEM_PROMPT = `You are a sales assistant. You MUST respond with valid JSON only, no markdown or extra text.
Allowed actions (allowlist): ${ALLOWLIST.join(", ")}
- For ANY question about data (sales, pipeline, win rate, leads, deals count, reports, inventory, etc.): use intent "query" with humanSummary briefly describing the question. The system will fetch live data and answer fully.
- For read-only actions: use intent "query" or action types summarize_deal (with dealId), draft_followup_email, weekly_report (no confirmation).
- For write operations: use intent "action" with actionType create_note, create_activity, or move_stage and set requiresConfirmation: true.
Never invent deal IDs or stage IDs - if the user did not provide numbers for an action, respond with intent "query" and humanSummary asking for the missing data.
Output format: {"intent":"query"|"action", "actionType?: "<allowlisted>", "input?: {...}", "humanSummary": "string", "requiresConfirmation?: boolean"}`;

export async function planFromAI(message: string): Promise<PlanOutput> {
  const p = getProvider();
  if (!p) return rulesBasedPlan(message);

  try {
    const text = await callLLM(SYSTEM_PROMPT, message, 1024);
    const parsed = parseStructuredPlan(text);
    if (parsed) return parsed;
  } catch {
    /* אין קרדיטים / שגיאת רשת – עוברים ל־rules */
  }
  return rulesBasedPlan(message);
}

const POLISH_SYSTEM = `You are a Hebrew business assistant. Rewrite the given answer in clear, professional Hebrew.
Rules:
- Keep ALL numbers, dates, and facts exactly as they are. Do NOT add, remove, or invent any data.
- Only improve wording and flow. If the answer already mentions "Pipedrive" or "מקור" you may keep it; otherwise add at the very end one line: "מקור: Pipedrive. נתונים חיים."
Output: the rewritten answer only, no preamble.`;

export async function polishAnswerWithAI(userQuestion: string, rawAnswer: string): Promise<string> {
  if (getProvider() === null || process.env.AI_POLISH_ANSWERS === "false") return rawAnswer;
  if (rawAnswer.length < 80) return rawAnswer;

  try {
    const out = await callLLM(
      POLISH_SYSTEM,
      `User question: ${userQuestion}\n\nCurrent answer (rewrite this):\n${rawAnswer}`,
      1024
    );
    return out.length > 0 ? out : rawAnswer;
  } catch {
    return rawAnswer;
  }
}

const SOLUTIONS_NO = "NO_RECOMMENDATIONS";

const SOLUTIONS_SYSTEM = `You are a Hebrew sales advisor. Based ONLY on the data in the answer below, suggest 1–3 short actionable recommendations (bullets, Hebrew). Do NOT add or change any number or fact from the answer.
If the data does not indicate a clear problem (e.g. no stalled deals, no lost money, no overdue deals, no drop in leads), respond with exactly: ${SOLUTIONS_NO}
Otherwise output only the recommendations, one per line, starting with • or - no other text.`;

export async function addSolutionsToAnswer(userQuestion: string, answerText: string): Promise<string> {
  if (getProvider() === null || process.env.AI_SUGGEST_SOLUTIONS === "false") return "";
  if (answerText.length < 50) return "";

  try {
    const out = await callLLM(
      SOLUTIONS_SYSTEM,
      `Question: ${userQuestion}\n\nAnswer:\n${answerText}`,
      256
    ).then((s) => s.trim());
    if (!out || out.toUpperCase().includes(SOLUTIONS_NO)) return "";
    return out;
  } catch {
    return "";
  }
}

const FALLBACK_SYSTEM = `You are a helpful Hebrew sales assistant. The user asked something that our system did not match to a specific report.
Reply in Hebrew, briefly (2-4 sentences). Do NOT invent numbers or data. You can:
- Answer general questions about sales best practices or how to use reports.
- If the question sounds like a data question (leads, pipeline, conversion, reps), suggest they try: "כמה לידים היום", "דוח מנהלים", "אחוז המרה של [שם נציג]", "מי הנציגים הפעילים ב-2026", "שווי צינור", "רשימת מלאי".
- Say you don't have that information if it's outside sales/Pipedrive.
Output: only the reply, no preamble.`;

export async function answerWithAIFallback(question: string): Promise<string | null> {
  if (getProvider() === null || process.env.AI_ANSWER_ANYTHING === "false") return null;

  try {
    const out = await callLLM(FALLBACK_SYSTEM, question, 320).then((s) => s.trim());
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
