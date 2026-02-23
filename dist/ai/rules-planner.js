/**
 * Rules-based planner when ANTHROPIC_API_KEY is not set.
 * Parses user message and returns a structured plan (JSON only). Never invents IDs.
 */
import { isAllowlistedAction } from "../actions/index.js";
const ACTION_KEYWORDS = {
    "create note": "create_note",
    "create activity": "create_activity",
    "הוסף הערה": "create_note",
    "צור הערה": "create_note",
    "הוסף פעילות": "create_activity",
    "צור פעילות": "create_activity",
    "העבר שלב": "move_stage",
    "move stage": "move_stage",
    "move deal": "move_stage",
    "סיכום עסקה": "summarize_deal",
    "summarize deal": "summarize_deal",
    "דוח שבועי": "weekly_report",
    "weekly report": "weekly_report",
    "טיוטת אימייל": "draft_followup_email",
    "draft email": "draft_followup_email",
};
function extractNumber(s) {
    const m = s.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
}
function extractIsoDate(s) {
    const m = s.match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : null;
}
export function rulesBasedPlan(message) {
    const normalized = message.trim().toLowerCase();
    const hebrew = message.trim();
    // Check for action-like intent
    for (const [phrase, actionType] of Object.entries(ACTION_KEYWORDS)) {
        if (normalized.includes(phrase.toLowerCase()) || hebrew.includes(phrase)) {
            const dealId = extractNumber(message) ?? extractNumber(normalized);
            if (actionType === "create_note") {
                const contentMatch = message.match(/(?:content|תוכן|הערה|note)[:\s]+([^\n]+)/i)
                    ?? message.match(/"([^"]+)"/)
                    ?? message.match(/לעסקה\s+\d+\s*(.+)/);
                const content = contentMatch ? contentMatch[1].trim() : null;
                if (!dealId || !content) {
                    return {
                        intent: "query",
                        humanSummary: "לבקשת יצירת הערה נדרשים מזהה עסקה (מספר) ותוכן ההערה. אנא ציין עסקה ותוכן.",
                    };
                }
                return {
                    intent: "action",
                    actionType: "create_note",
                    input: { dealId, content },
                    humanSummary: `הצעה: הוספת הערה לעסקה ${dealId}: "${content.slice(0, 80)}${content.length > 80 ? "…" : ""}"`,
                    requiresConfirmation: true,
                };
            }
            if (actionType === "create_activity") {
                const subjectMatch = message.match(/(?:subject|נושא)[:\s]+([^\n]+)/i) ?? message.match(/"([^"]+)"/);
                const subject = subjectMatch ? subjectMatch[1].trim() : "פעילות";
                const dueDate = extractIsoDate(message) ?? new Date().toISOString().slice(0, 10);
                const type = message.includes("call") || message.includes("שיחה") ? "call" : "task";
                if (!dealId) {
                    return {
                        intent: "query",
                        humanSummary: "לבקשת יצירת פעילות נדרש מזהה עסקה. אנא ציין מספר עסקה.",
                    };
                }
                return {
                    intent: "action",
                    actionType: "create_activity",
                    input: { dealId, subject, dueDate, type },
                    humanSummary: `הצעה: יצירת פעילות בעסקה ${dealId} - ${subject}, לתאריך ${dueDate}`,
                    requiresConfirmation: true,
                };
            }
            if (actionType === "move_stage") {
                const stageId = extractNumber(message);
                const secondNum = message.match(/\d+/g);
                const stageIdFromMessage = secondNum && secondNum.length >= 2 ? parseInt(secondNum[1], 10) : stageId;
                if (!dealId || !stageIdFromMessage) {
                    return {
                        intent: "query",
                        humanSummary: "להעברת עסקה לשלב נדרשים מזהה עסקה ומזהה שלב. אנא ציין שני מספרים.",
                    };
                }
                return {
                    intent: "action",
                    actionType: "move_stage",
                    input: { dealId, stageId: stageIdFromMessage },
                    humanSummary: `הצעה: העברת עסקה ${dealId} לשלב ${stageIdFromMessage}`,
                    requiresConfirmation: true,
                };
            }
            if (actionType === "summarize_deal" && dealId) {
                return {
                    intent: "action",
                    actionType: "summarize_deal",
                    input: { dealId },
                    humanSummary: `סיכום עסקה ${dealId}`,
                    requiresConfirmation: false,
                };
            }
            if (actionType === "weekly_report") {
                const ownerId = extractNumber(message);
                const days = extractNumber(message) ?? 7;
                return {
                    intent: "action",
                    actionType: "weekly_report",
                    input: { ownerId: ownerId ?? undefined, days },
                    humanSummary: "דוח שבועי",
                    requiresConfirmation: false,
                };
            }
            if (actionType === "draft_followup_email" && dealId) {
                return {
                    intent: "action",
                    actionType: "draft_followup_email",
                    input: { dealId, context: undefined },
                    humanSummary: `טיוטת אימייל לעסקה ${dealId}`,
                    requiresConfirmation: false,
                };
            }
        }
    }
    // Default: treat as query (read-only)
    return {
        intent: "query",
        humanSummary: "שאילתת מידע – אחפש בעסקאות והפעילויות.",
    };
}
export function parseStructuredPlan(json) {
    try {
        const parsed = JSON.parse(json);
        if (parsed.intent === "action" && parsed.actionType) {
            if (!isAllowlistedAction(parsed.actionType))
                return null;
            return parsed;
        }
        if (parsed.intent === "query")
            return parsed;
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=rules-planner.js.map