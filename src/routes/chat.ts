import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import type { PipedriveClient } from "../pipedrive/client.js";
import { planFromAI } from "../ai/index.js";
import { executeAction, ACTION_METADATA, type ActionContext } from "../actions/index.js";
import type { ActionType } from "../actions/schemas.js";
import { canRequestActions } from "../auth/index.js";
import type { UserRecord } from "../auth/index.js";
import {
  getProductCustomNum,
  getProductCustomStr,
  getAvailableRoomsFieldKey,
  getStockQuantityFieldKey,
  getRoomTypeFieldKey,
  getDepartureDateFieldKey,
  getProductDateYearMonth,
  getProductDateSortable,
  PRODUCTS_FETCH_LIMIT,
} from "../lib/product-fields.js";

const messageBody = z.object({
  sessionId: z.string().nullish(),
  message: z.string().min(1).max(10000),
});

export async function chatRoutes(
  fastify: FastifyInstance,
  deps: { db: Db; pipedrive: PipedriveClient }
) {
  const ctx: ActionContext = { pipedrive: deps.pipedrive };

  fastify.post(
    "/api/chat/message",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = (req as FastifyRequest & { user: UserRecord }).user;
      const parsed = messageBody.safeParse((req as FastifyRequest<{ Body: unknown }>).body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { sessionId: existingSessionId, message } = parsed.data;
      let sessionId = existingSessionId;

      if (!sessionId) {
        const session = await deps.db.chatSession.create({
          data: { userId: user.id },
        });
        sessionId = session.id;
      } else {
        const session = await deps.db.chatSession.findFirst({
          where: { id: sessionId, userId: user.id },
        });
        if (!session) {
          return reply.status(404).send({ error: "Session not found" });
        }
      }

      await deps.db.chatMessage.create({
        data: { sessionId, role: "user", content: message },
      });
      const depsUser = user;

      const plan = await planFromAI(message);

      if (plan.intent === "query") {
        const lastMessages = sessionId
          ? await deps.db.chatMessage.findMany({
              where: { sessionId },
              orderBy: { createdAt: "desc" },
              take: 6,
            })
          : [];
        const queryResult = await runQuery(ctx, message, plan, { lastMessages });
        await deps.db.chatMessage.create({
          data: {
            sessionId,
            role: "assistant",
            content: queryResult.text,
            metadata: queryResult.metadata ? (queryResult.metadata as object) : undefined,
          },
        });
        return reply.send({
          sessionId,
          response: { content: queryResult.text, actionRequest: null },
        });
      }

      if (plan.intent === "action" && plan.actionType && plan.input != null) {
        const actionType = plan.actionType as ActionType;
        const meta = ACTION_METADATA[actionType];
        if (meta.requiresConfirmation && meta.isWrite) {
          if (!canRequestActions(depsUser.role)) {
            const text = "אין לך הרשאה לבקש פעולות כתיבה. פנה למנהל.";
            await deps.db.chatMessage.create({
              data: { sessionId, role: "assistant", content: text },
            });
            return reply.send({ sessionId, response: { content: text, actionRequest: null } });
          }
          const actionRequest = await deps.db.actionRequest.create({
            data: {
              createdByUserId: depsUser.id,
              actionType,
              planJson: { actionType, input: plan.input, humanSummary: plan.humanSummary },
              status: "pending_confirmation",
              sessionId,
            },
          });
          const text =
            (plan.humanSummary ?? "הצעה לפעולה") +
            "\n\nלאשר או לבטל השתמש בכפתורים למטה.";
          await deps.db.chatMessage.create({
            data: {
              sessionId,
              role: "assistant",
              content: text,
              metadata: {
                actionRequestId: actionRequest.id,
                actionType,
                preview: plan.input,
                humanSummary: plan.humanSummary,
              },
            },
          });
          return reply.send({
            sessionId,
            response: {
              content: text,
              actionRequest: {
                id: actionRequest.id,
                actionType,
                humanSummary: plan.humanSummary,
                preview: plan.input,
                requiresConfirmation: true,
              },
            },
          });
        }

        const result = await executeAction(ctx, actionType, plan.input);
        const text = result.ok
          ? (plan.humanSummary ?? "בוצע.") + "\n\n" + JSON.stringify(result.data, null, 2)
          : "שגיאה: " + result.error;
        await deps.db.chatMessage.create({
          data: { sessionId, role: "assistant", content: text },
        });
        return reply.send({
          sessionId,
          response: { content: text, actionRequest: null },
        });
      }

      const fallback = plan.humanSummary ?? "לא הצלחתי לפרש את הבקשה. נסה לפרט יותר.";
      await deps.db.chatMessage.create({
        data: { sessionId, role: "assistant", content: fallback },
      });
      return reply.send({
        sessionId,
        response: { content: fallback, actionRequest: null },
      });
    }
  );

  fastify.get(
    "/api/chat/sessions",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const sessions = await deps.db.chatSession.findMany({
        where: { userId: (req as FastifyRequest & { user: UserRecord }).user.id },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, createdAt: true, updatedAt: true },
      });
      return reply.send({ sessions });
    }
  );

  fastify.get(
    "/api/chat/sessions/:sessionId/messages",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const r = req as FastifyRequest<{ Params: { sessionId: string } }> & { user: UserRecord };
      const session = await deps.db.chatSession.findFirst({
        where: { id: r.params.sessionId, userId: r.user.id },
      });
      if (!session) return reply.status(404).send({ error: "Session not found" });
      const messages = await deps.db.chatMessage.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: "asc" },
      });
      return reply.send({ messages });
    }
  );
}

function isGreeting(msg: string): boolean {
  const t = msg.trim().toLowerCase();
  return /^(היי?|שלום|היילוך|אהלן|hello|hi|hey|good morning|good afternoon)\s*!?\.?$/i.test(t) || t.length <= 3 && /^[היאשלאהנ]+$/.test(t);
}

function isDealsTodayQuery(msg: string): boolean {
  const t = msg.trim();
  return /כמה\s+(לידים|עסקאות|deals|leads)/i.test(t) && /היום|today|היום/i.test(t)
    || /לידים\s+היום|עסקאות\s+היום/i.test(t);
}

function isDealsWeekQuery(msg: string): boolean {
  const t = msg.trim();
  return /כמה\s+(לידים|עסקאות|deals)/i.test(t) && /שבוע|week|השבוע/i.test(t)
    || /עסקאות\s+השבוע|לידים\s+השבוע|לידים\s+הגיעו\s+השבוע/i.test(t);
}

function isDealsYesterdayQuery(msg: string): boolean {
  const t = msg.trim();
  return /כמה\s+(לידים|עסקאות)/i.test(t) && /אתמול|yesterday/i.test(t)
    || /לידים\s+הגיעו\s+אתמול|לידים\s+אתמול/i.test(t);
}

/** "כמה WON היו השבוע" */
function isWonThisWeekQuery(msg: string): boolean {
  const t = msg.trim();
  return /won|וון|נסגרו\s+בהצלחה|זכינו/i.test(t) && /השבוע|שבוע\s+הזה|this\s*week/i.test(t);
}

/** "כמה היו שבוע שעבר" (WON last week) */
function isWonLastWeekQuery(msg: string): boolean {
  const t = msg.trim();
  return (/won|וון|נסגרו\s+בהצלחה|זכינו/i.test(t) && /שבוע\s+שעבר|השבוע\s+שעבר|last\s*week/i.test(t))
    || /כמה\s+היו\s+שבוע\s+שעבר/i.test(t);
}

/** "איזה מקורות הגעה", "מקורות הגעה" */
function isLeadSourcesQuery(msg: string): boolean {
  const t = msg.trim();
  return /מקורות\s+הגעה|מקור\s+הגעה|איזה\s+מקורות|מקורות\s+לידים/i.test(t);
}

/** "כמה חדרים פנויים מעל X", "חדרים פנויים מעל 5" – מחזיר את X או null */
function parseAvailableRoomsAbove(msg: string): number | null {
  const t = msg.trim();
  const m = t.match(/חדרים\s*פנויים\s*מעל\s*(\d+)/i) || t.match(/מעל\s*(\d+)\s*חדרים/i) || t.match(/פנויים\s*מעל\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

function isAvailableRoomsAboveQuery(msg: string): boolean {
  return parseAvailableRoomsAbove(msg) != null;
}

function isProductsInventoryQuery(msg: string): boolean {
  const t = msg.trim().toLowerCase();
  return /מלאי|מוצרים|פרודקט|products|inventory|רשימת\s*מוצרים|רשימת\s*מלאי/i.test(t);
}

/** "כמה חדרים פנויים", "חדרים פנויים נכון להיום", "רשימת חדרים פנויים" */
/** "כמה חדרים פנויים בתצוגה הזאת" / "סה"כ חדרים פנויים" / "חשב לי כמה חדרים פנויים יש" – סיכום מספרי */
function isTotalAvailableRoomsQuery(msg: string): boolean {
  const t = msg.trim();
  return (
    /חשב\s*(?:לי\s*)?כמה\s*חדרים\s*פנויים|כמה\s*חדרים\s*פנויים\s*יש\s*[?.]?$/i.test(t) ||
    /כמה\s*חדרים\s*פנויים\s*(?:בתצוגה|ברשימה|במלאי)/i.test(t) ||
    /בתצוגה\s*(?:הזאת|הזו).*חדרים\s*פנויים|חדרים\s*פנויים.*בתצוגה/i.test(t) ||
    /סה["']?כ\s*חדרים\s*פנויים|כמה\s*חדרים\s*פנויים\s*סה["']?כ/i.test(t)
  );
}

function isAvailableRoomsQuery(msg: string): boolean {
  const t = msg.trim();
  return /חדרים\s*פנויים|כמה\s*חדרים\s*פנויים|חדרים\s*פנויים\s*נכון\s*להיום|רשימת\s*חדרים\s*פנויים|available\s*rooms/i.test(t);
}

/** שמות חודשים בעברית → מספר חודש */
const HEBREW_MONTHS: Record<string, number> = {
  ינואר: 1, פברואר: 2, מרץ: 3, אפריל: 4, מאי: 5, יוני: 6, יולי: 7,
  אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12,
};

/**
 * מחלץ סינון לפי תאריך יציאה מהשאלה: שנה ו/או חודש.
 * דוגמאות: "ב-2026", "בחודש יוני", "ביוני 2026", "כמה יש במלאי ב-2026"
 */
function parseDateFilterFromMessage(msg: string): { year?: number; month?: number } | null {
  const t = msg.trim();
  let year: number | undefined;
  let month: number | undefined;

  const yearMatch = t.match(/(?:ב[-־]?|בשנת?|שנת)\s*(\d{4})\b/) ?? t.match(/\b(20\d{2})\b/);
  if (yearMatch) year = parseInt(yearMatch[1], 10);

  for (const [name, num] of Object.entries(HEBREW_MONTHS)) {
    if (t.includes(name)) {
      month = num;
      if (!year && yearMatch) year = parseInt(yearMatch[1], 10);
      break;
    }
  }
  const monthNumMatch = t.match(/חודש\s*(\d{1,2})\b/);
  if (monthNumMatch) {
    const m = parseInt(monthNumMatch[1], 10);
    if (m >= 1 && m <= 12) month = m;
  }

  if (year == null && month == null) return null;
  return { year, month };
}

/** שאלה על מלאי/חדרים עם סינון לפי תאריך יציאה (שנה או חודש) */
function isDateFilteredInventoryQuery(msg: string): boolean {
  const t = msg.trim();
  const hasRoomsOrStock =
    /חדרים\s*(?:פנויים|נותרו|נשארו)|כמה\s*יש\s*במלאי|מלאי\s*ב/i.test(t) ||
    /כמה\s*(?:חדרים|יש)\s*(?:במלאי|נותרו|נשארו)/i.test(t);
  if (!hasRoomsOrStock) return false;
  const hasYear = /\b(20\d{2})\b|בשנת|ב[-־]?\d{4}/.test(t);
  const hasMonth = /חודש\s*(\d{1,2}|[\u0590-\u05EA]+)|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר/i.test(t);
  return hasYear || hasMonth;
}

const MAX_DEALS_FETCH = 10000;
const MAX_PRODUCTS_FETCH = PRODUCTS_FETCH_LIMIT;

/**
 * בונה תצוגת מלאי לפי הפורמט: שם מוצר, שורה מתחת "כמות חדרים פנויים : X".
 * ממוין כרונולוגית לפי תאריך יציאה (אם קיים).
 */
function formatInventoryGrouped(
  products: Array<{ name?: string | null } & Record<string, unknown>>,
  opts: {
    availableRoomsKey: string | null;
    stockKey: string | null;
    roomTypeKey: string | null;
    departureKey?: string | null;
    maxGroups?: number;
    maxPerGroup?: number;
  }
): string {
  const { availableRoomsKey, departureKey, maxGroups = 50, maxPerGroup = 50 } = opts;
  const sorted = [...products].sort((a, b) => {
    if (!departureKey) return 0;
    return getProductDateSortable(a, departureKey) - getProductDateSortable(b, departureKey);
  });
  const slice = sorted.slice(0, (maxGroups ?? 50) * (maxPerGroup ?? 50));
  const blocks = slice.map((p) => {
    const productName = (p.name ?? "ללא שם").trim() || "ללא שם";
    const x = availableRoomsKey ? getProductCustomNum(p, availableRoomsKey) : 0;
    return "\u202B" + productName + "\u202C\nכמות חדרים פנויים : " + x;
  });
  const lineSep = "─────────────────────────────────────";
  let out = blocks.join("\n\n" + lineSep + "\n\n");
  if (products.length > slice.length) out += "\n\n" + lineSep + "\n\n... ועוד " + (products.length - slice.length) + " פריטים";
  return out;
}

/** שאלה שקשורה לנתונים/מאגר – נחזיר סיכום עדכני */
function isDataRelatedQuery(msg: string): boolean {
  const t = msg.trim();
  return (
    /נתונים|מאגר|דוח|מצב|כמה\s+יש|מה\s+המצב|סטטוס|סיכום\s+כללי|פייפדרייב|pipedrive|מידע\s+עדכני/i.test(t) ||
    /יש\s+לי|כמה\s+עסקאות|כמה\s+לידים|כמה\s+מוצרים/i.test(t)
  );
}

/** נראה כמו שאלה – נחזיר לפחות סיכום מאגר */
function looksLikeQuestion(msg: string): boolean {
  const t = msg.trim();
  if (t.length < 2) return false;
  if (/\?$|^\?/.test(t)) return true;
  return /^(כמה|מה|איפה|מתי|למה|איך|האם|יש|הראה|תן|רשום|רשימת|סיכום|דוח|מצב)/i.test(t);
}

/** לידים/עסקאות בשלב (למשל טרום שיחה). מחזיר { stageName, openOnly? } */
function isStageCountQuery(msg: string): { stageName: string; openOnly?: boolean } | null {
  const t = msg.trim();
  if (/טרום\s*שיחה|ליד\s*טרום\s*שיחה/i.test(t)) return { stageName: "טרום שיחה", openOnly: /עסקאות\s*פתוחות|פתוחות\s*ב/i.test(t) };
  const m = t.match(/כמה\s+לידים\s+(?:ב|ב־|בשלב)?\s*([^?.\s]+(?:\s+[^?.\s]+)*)/i)
    || t.match(/כמה\s+עסקאות\s+פתוחות\s+(?:ב|ב־|בשלב|בליד)?\s*([^?.\s]+(?:\s+[^?.\s]+)*)/i)
    || t.match(/(?:לידים?|עסקאות)\s+(?:פתוחות\s+)?(?:ב|ב־|בשלב)?\s*([^?.\s]+(?:\s+[^?.\s]+)*)/i);
  if (m) {
    const name = m[1].trim().replace(/\s*בליד\s*$/, "").trim();
    if (name && name.length < 50) return { stageName: name, openOnly: /עסקאות\s*פתוחות|פתוחות\s*ב/i.test(t) };
  }
  return null;
}

/** לידים תקועים יותר מ־X ימים */
function isStuckDealsQuery(msg: string): number | null {
  const t = msg.trim();
  if (!/תקוע|ללא\s+פעילות|נתקע/i.test(t)) return null;
  const week = t.match(/יותר\s*מ(?:־|\s)?(\d+)\s*יום/i);
  if (week) return parseInt(week[1], 10) || 7;
  const days = t.match(/(\d+)\s*יום/i);
  if (days) return parseInt(days[1], 10);
  if (/שבוע|week/i.test(t)) return 7;
  return 7;
}

function dealAddTime(deal: { add_time?: string | number; [k: string]: unknown }): number {
  const raw = deal as Record<string, unknown>;
  const t = raw.add_time ?? raw.creation_time ?? raw.create_time;
  if (t == null) return 0;
  if (typeof t === "number") return t < 1e12 ? t * 1000 : t;
  return new Date(String(t)).getTime();
}

/** התחלת היום (00:00) בישראל – להשוואת תאריכים לפי שעון ישראל */
function getStartOfTodayIsraelMs(): number {
  const now = new Date();
  const isoDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const parts = isoDate.split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return now.getTime();
  const [year, month, day] = parts;
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0);
  const israelOffset = 2 * 60 * 60 * 1000;
  return utcMidnight - israelOffset;
}

/** התחלת החודש (יום 1, 00:00) בישראל – לחישובי "החודש" עקביים */
function getStartOfMonthIsraelMs(): number {
  const todayStart = getStartOfTodayIsraelMs();
  const isoDate = new Date(todayStart).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const parts = isoDate.split("-").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  const dayOfMonth = parts[2];
  return todayStart - (dayOfMonth - 1) * 24 * 60 * 60 * 1000;
}

function dealUpdateTime(deal: { update_time?: string | number }): number {
  const t = deal.update_time;
  if (t == null) return 0;
  if (typeof t === "number") return t < 1e12 ? t * 1000 : t;
  return new Date(t).getTime();
}

function dealWonTime(deal: { won_time?: string | number }): number {
  const t = deal.won_time;
  if (t == null) return 0;
  if (typeof t === "number") return t < 1e12 ? t * 1000 : t;
  return new Date(t).getTime();
}

function dealValue(deal: { value?: number }): number {
  return Number(deal.value) || 0;
}

/** משפנמה / לידים בכל שלב */
function isFunnelQuery(msg: string): boolean {
  const t = msg.trim();
  return /משפנמה|פונל|בכל\s*שלב|לידים\s*לפי\s*שלב|עסקאות\s*לפי\s*שלב|דוח\s*משפנמה/i.test(t);
}

/** עסקאות שזכינו / נסגרו בהצלחה / הפסדנו */
function isWonLostQuery(msg: string): "won" | "lost" | "open" | null {
  const t = msg.trim();
  if (/זכינו|נסגר\s*בהצלחה|won|סגורות\s*בהצלחה|נצחונות|החודש\s*זכינו|נסגרו\s*החודש/i.test(t)) return "won";
  if (/הפסדנו|הפסד|lost|איבדנו/i.test(t)) return "lost";
  if (/פתוחות|open|פעילות\s*פתוחות|סה"כ\s*עסקאות\s*פעילות/i.test(t)) return "open";
  return null;
}

/** שווי עסקאות */
function isValueQuery(msg: string): boolean {
  const t = msg.trim();
  return /שווי|ערך|סה"כ\s*כסף|כמה\s*כסף|value|סיכום\s*כספי/i.test(t);
}

/** דוח מנהלים / סיכום מנהלים */
function isManagerSummaryQuery(msg: string): boolean {
  const t = msg.trim();
  return /דוח\s*מנהל|סיכום\s*מנהל|מנהלים|תמונת\s*מצב|מבט\s*על|overview|דשבורד|dashboard/i.test(t);
}

/** לפי בעלים – "עסקאות של X", "דוח לפי בעלים" */
function isByOwnerQuery(msg: string): { ownerName?: string } | boolean {
  const t = msg.trim();
  if (/דוח\s*לפי\s*בעלים|עסקאות\s*לפי\s*בעלים|לידים\s*לפי\s*בעלים/i.test(t)) return true;
  const m = t.match(/עסקאות\s*(?:של|)\s*(.+?)(?:\?|$)/i) || t.match(/לידים\s*(?:של|)\s*(.+?)(?:\?|$)/i);
  if (m) return { ownerName: m[1].trim() };
  return false;
}

/** לפי חודש – "כמה נסגרו החודש", "חודש שעבר" */
function isByMonthQuery(msg: string): "this" | "last" | null {
  const t = msg.trim();
  if (/החודש|חודש\s*נוכחי|this\s*month|נסגרו\s*החודש/i.test(t)) return "this";
  if (/חודש\s*שעבר|החודש\s*שעבר|last\s*month/i.test(t)) return "last";
  return null;
}

/** לפי פייפליין – "כמה לידים בכל פייפליין", "דוח לפי פייפליין" */
function isByPipelineQuery(msg: string): boolean {
  const t = msg.trim();
  return /פייפליין|pipeline|לפי\s*צנרת|בכל\s*צנרת|לידים\s*לפי\s*פייפליין/i.test(t);
}

/** מחזיר את מזהה בעל העסקה (Pipedrive מחזיר לעיתים owner_id ולא user_id) */
function dealOwnerId(d: { user_id?: number; [k: string]: unknown }): number | undefined {
  const uid = d.user_id;
  if (uid != null) return uid;
  const oid = (d as { owner_id?: number }).owner_id;
  return oid;
}

/** "מה אחוז המרה של נציג X", "אחוז המרה של יוסי" – מחזיר את שם הנציג או null */
function parseConversionRateRepName(msg: string): string | null {
  const t = msg.trim();
  const m =
    t.match(/אחוז\s*המרה\s*(?:של\s*)?(?:נציג\s*)?([^\s?.]+(?:\s+[^\s?.]+)*)/i) ||
    t.match(/מה\s*אחוז\s*המרה\s*(?:של\s*)?(?:נציג\s*)?([^\s?.]+(?:\s+[^\s?.]+)*)/i) ||
    t.match(/המרה\s*(?:של\s*)?(?:נציג\s*)?([^\s?.]+(?:\s+[^\s?.]+)*)/i);
  if (m) return m[1].trim();
  return null;
}

/** מחזיר תקופה לחישוב המרה: { days } או null (כל הזמן) */
function parseConversionRatePeriod(msg: string): { days: number; label: string } | null {
  const t = msg.trim();
  const weekMatch = t.match(/שבוע\s+אחרון|אחרון\s+שבוע|השבוע\s+אחרון/i);
  if (weekMatch) return { days: 7, label: "שבוע האחרון" };
  const monthMatch = t.match(/חודש\s+אחרון|אחרון\s+חודש|החודש\s+אחרון/i);
  if (monthMatch) return { days: 30, label: "חודש האחרון" };
  const daysMatch = t.match(/(\d+)\s*ימים?|ב[-־]?(\d+)\s*ימים?/i);
  if (daysMatch) {
    const n = parseInt(daysMatch[1] ?? daysMatch[2], 10);
    if (n >= 1 && n <= 365) return { days: n, label: `${n} הימים האחרונים` };
  }
  return null;
}

function isConversionRateQuery(msg: string): boolean {
  return /אחוז\s*המרה|המרה\s*של\s*נציג|מה\s*אחוז\s*המרה/i.test(msg.trim());
}

// —— שאלות KPI / אנליטיקה (מרשימת השאלות המבוקשת) ——

/** סך המכירות (Won) בחודש הנוכחי – לפי מהות: מכרנו/סגרנו/הכנסות החודש */
function isWonSalesThisMonthQuery(msg: string): boolean {
  const t = msg.trim();
  const month = /חודש|הנוכחי|החודש|החודשי/i.test(t);
  const sales = /סך\s*המכירות|מכירות\s*\(?\s*won\s*\)?|won\s*בחודש|המכירות\s*החודש|כמה\s*מכרנו|מכרנו\s*החודש|הכנסות\s*החודש|סגרנו\s*החודש|מה\s*מכרנו|סה"כ\s*מכירות|נסגרו\s*בהצלחה\s*החודש|זכינו\s*החודש/i.test(t);
  return month && sales;
}

/** אחוז עמידה ביעד / יעד מכירות */
function isSalesTargetQuery(msg: string): boolean {
  const t = msg.trim();
  return /אחוז\s*עמידה\s*ביעד|עמידה\s*ביעד|יעד\s*מכירות|יעד\s*החודשי/i.test(t);
}

/** שווי ממוצע לעסקה (Average Deal Value) */
function isAverageDealValueQuery(msg: string): boolean {
  const t = msg.trim();
  return /שווי\s*ממוצע|עסקאות\s*ממוצע|average\s*deal\s*value|ממוצע\s*לעסקה|ערך\s*ממוצע\s*לעסקה|גודל\s*עסקה\s*ממוצע|ממוצע\s*עסקה|ערך\s*ממוצע|מה\s*הממוצע\s*לעסקה/i.test(t);
}

/** השוואה לאשתקד / תקופה מקבילה */
function isYearOverYearQuery(msg: string): boolean {
  const t = msg.trim();
  return /השוואה\s*לאשתקד|תקופה\s*מקבילה|אשתקד|לעומת\s*שנה\s*קודם|year\s*over\s*year/i.test(t);
}

/** Win Rate כללי של הצוות */
function isTeamWinRateQuery(msg: string): boolean {
  const t = msg.trim();
  return /win\s*rate|וין\s*רייט|אחוז\s*זכייה\s*(?:כללי|של\s*הצוות)?|הצוות\s*win\s*rate|כמה\s*אחוז\s*זכינו|אחוז\s*הצלחה|הצלחה\s*של\s*הצוות|אחוז\s*זכייה\s*כללי|מה\s*ה ?win\s*rate/i.test(t);
}

/** Win Rate לפי מוצר/שירות */
function isWinRateByProductQuery(msg: string): boolean {
  const t = msg.trim();
  return /win\s*rate\s*לפי\s*מוצר|אחוז\s*זכייה\s*לפי\s*סוג\s*מוצר|לפי\s*מוצר\/שירות/i.test(t);
}

/** שווי צינור / Pipeline כולל */
function isPipelineValueQuery(msg: string): boolean {
  const t = msg.trim();
  return /שווי\s*(?:ה)?צינור|צינור\s*כולל|pipeline\s*(?:value|הכולל)?|שווי\s*pipeline|שווי\s*עסקאות\s*פתוחות|כמה\s*כסף\s*בצינור|סה"כ\s*שווי\s*פתוחות|מה\s*שווי\s*הצינור|שווי\s*הפייפליין/i.test(t);
}

/** עסקאות תקועות באותו שלב מעל שבועיים */
function isStuckTwoWeeksQuery(msg: string): boolean {
  const t = msg.trim();
  return /תקועות?\s*באותו\s*שלב|אותו\s*שלב\s*מעל\s*שבועיים|מעל\s*שבועיים\s*בשלב/i.test(t) || (/תקוע|נתקע/i.test(t) && /שבועיים|14\s*יום/i.test(t));
}

/** עסקאות חדשות נפתחו היום/השבוע */
function isNewDealsOpenedQuery(msg: string): boolean {
  const t = msg.trim();
  return /עסקאות\s*חדשות\s*נפתחו|נפתחו\s*היום|נפתחו\s*השבוע|חדשות\s*נפתחו|כמה\s*עסקאות\s*נפתחו|עסקאות\s*חדשות\s*היום|עסקאות\s*חדשות\s*השבוע/i.test(t);
}

/** אחוז גידול במכירות מחודש לחודש */
function isMonthlySalesGrowthQuery(msg: string): boolean {
  const t = msg.trim();
  return /אחוז\s*גידול|גידול\s*מחודש\s*לחודש|מונט\s*למונט|growth\s*מכירות/i.test(t);
}

/** נציג עם Win Rate הגבוה / שווי תיק הגבוה */
function isRepLeaderboardQuery(msg: string): "winrate" | "pipeline" | null {
  const t = msg.trim();
  if (/מי\s*.*\s*win\s*rate|נציג\s*.*\s*win\s*rate|הכי\s*הרבה\s*זכיות|אחוז\s*המרה\s*גבוה|מי\s*הנציג\s*הכי\s*מוצלח|נציג\s*עם\s*הכי\s*הרבה\s*זכיות|מי\s*מוביל\s*באחוז\s*זכייה/i.test(t)) return "winrate";
  if (/נציג\s*שווי\s*תיק|שווי\s*תיק\s*גבוה|מנהל\s*הכי\s*הרבה\s*שווי|פייפליין\s*גבוה\s*נציג|מי\s*מנהל\s*הכי\s*הרבה\s*עסקאות|נציג\s*עם\s*התיק\s*הגדול/i.test(t)) return "pipeline";
  return null;
}

/** סיבת הפסד (Lost Reason) נפוצה */
function isLostReasonQuery(msg: string): boolean {
  const t = msg.trim();
  return /סיבת\s*הפסד|lost\s*reason|הסיבה\s*להפסד|למה\s*מפסידים|הנפוצה\s*החודש|איזה\s*סיבות\s*הפסד|סיבות\s*להפסד\s*עסקאות/i.test(t);
}

/** Weighted Value / Revenue צפוי לסוף רבעון */
function isWeightedForecastQuery(msg: string): boolean {
  const t = msg.trim();
  return /weighted|צפוי\s*לסוף\s*רבעון|revenue\s*צפוי|תחזית\s*שווי/i.test(t);
}

/** עסקאות בשווי גבוה בסכנת סגירה */
function isHighValueAtRiskQuery(msg: string): boolean {
  const t = msg.trim();
  return /שווי\s*גבוה\s*בסכנה|בסכנת\s*סגירה|עסקאות\s*גבוהות\s*בסיכון/i.test(t);
}

/** שלב עם אחוז נטישה גבוה */
function isChurnByStageQuery(msg: string): boolean {
  const t = msg.trim();
  return /אחוז\s*נטישה|שלב\s*נטישה|איזה\s*שלב\s*מפסידים|הכי\s*הרבה\s*הפסד\s*בשלב/i.test(t);
}

/** זמן חיים ממוצע של עסקה / Deal lifecycle */
function isDealLifecycleQuery(msg: string): boolean {
  const t = msg.trim();
  return /זמן\s*חיים\s*ממוצע|ממוצע\s*של\s*עסקה|deal\s*lifecycle|אורך\s*חיים\s*עסקה/i.test(t);
}

/** קצב כניסת לידים אל מול סגירה / Pipeline מאוזן */
function isInflowVsCloseQuery(msg: string): boolean {
  const t = msg.trim();
  return /קצב\s*כניסת|deal\s*inflow|אל\s*מול\s*סגירה|מאוזן\s*בכמות\s*עסקאות/i.test(t);
}

/** מקורות הגעה רווחיים / לידים רווחיים */
function isProfitableSourcesQuery(msg: string): boolean {
  const t = msg.trim();
  return /מקור\s*רווחי|לידים\s*רווחיים|הכי\s*רווחי\s*מקור|מאיזה\s*מקור\s*הכי/i.test(t);
}

/** אחוז המרה מליד לעסקה (Lead-to-Deal) */
function isLeadToDealConversionQuery(msg: string): boolean {
  const t = msg.trim();
  return /אחוז\s*המרה\s*מליד|lead[- ]?to[- ]?deal|ליד\s*לעסקה|המרה\s*מליד|כמה\s*לידים\s*הופכים\s*לעסקאות/i.test(t);
}

/** זיהוי כוונה לפי מילות מפתח – כשאף handler מדויק לא התאים (מענה לפי מהות) */
function matchIntentByKeywords(msg: string): string | null {
  const t = msg.trim().toLowerCase();
  if ((/מכירות|מכרנו|סגרנו|הכנסות|זכינו|נסגרו/.test(t) && /חודש|הנוכחי/.test(t)) || (/כמה|מה\s*סך|מהו\s*סך/.test(t) && /מכירות|הכנסות/.test(t) && /חודש/.test(t))) return "won_sales_month";
  if (/אחוז\s*זכייה|win\s*rate|וין\s*רייט|אחוז\s*הצלחה|כמה\s*אחוז\s*זכינו/.test(t) && !/נציג|מי\s*הנציג|לפי\s*נציג/.test(t)) return "team_win_rate";
  if (/שווי\s*צינור|שווי\s*פתוחות|פייפליין|כמה\s*כסף\s*בצינור|שווי\s*העסקאות\s*הפתוחות/.test(t)) return "pipeline_value";
  if (/ממוצע\s*עסקה|שווי\s*ממוצע|ערך\s*ממוצע|גודל\s*עסקה\s*ממוצע|average\s*deal/.test(t)) return "average_deal_value";
  if (/כמה\s*לידים|כמה\s*עסקאות/.test(t) && /היום|השבוע|אתמול/.test(t)) return "deals_today_week";
  if (/מקורות?\s*הגעה|מאיזה\s*מקור|מקור\s*לידים/.test(t)) return "lead_sources";
  if (/דוח\s*מנהל|סיכום\s*מנהל|מבט\s*על|תמונת\s*מצב/.test(t)) return "manager_summary";
  if (/אחוז\s*המרה\s*של|המרה\s*של\s*נציג/.test(t)) return "conversion_rate";
  return null;
}

type QueryContext = { lastMessages?: Array<{ role: string; content: string }> };

/** עקרון: מענה לפי מהות השאלה – מזהה כוונה ולא רק ניסוח מדויק. מרחיבים דפוסים ו־matchIntentByKeywords כדי לתפוס ניסוחים שונים. */
async function runQuery(
  ctx: ActionContext,
  message: string,
  plan: { actionType?: string; input?: unknown },
  opts?: QueryContext
): Promise<{ text: string; metadata?: unknown }> {
  const lastMessages = opts?.lastMessages ?? [];
  const previousUserContent = lastMessages.slice(1).find((m) => m.role === "user")?.content?.trim() ?? "";
  const isFollowUpSourcesAfterYesterday =
    previousUserContent &&
    /מקורות\s*הגעה|מה\s*המקורות|מקור\s*הגעה/i.test(message) &&
    /לידים\s*אתמול|כמה\s+לידים\s+אתמול|הגיעו\s+אתמול/i.test(previousUserContent);
  if (plan.actionType === "summarize_deal" && plan.input && typeof plan.input === "object" && "dealId" in plan.input) {
    const result = await executeAction(ctx, "summarize_deal", plan.input);
    if (result.ok) {
      const d = result.data as { deal: { id: number; title?: string }; activitiesCount: number; notesCount: number };
      return {
        text: `עסקה #${d.deal.id}: ${d.deal.title ?? "ללא כותרת"}. פעילויות: ${d.activitiesCount}, הערות: ${d.notesCount}.`,
      };
    }
    return { text: result.error };
  }
  if (plan.actionType === "weekly_report" && plan.input) {
    const result = await executeAction(ctx, "weekly_report", plan.input);
    if (result.ok) {
      const d = result.data as { periodDays: number; dealsWithNoActivity: number };
      return { text: `דוח: ${d.periodDays} ימים, עסקאות ללא פעילות: ${d.dealsWithNoActivity}.` };
    }
    return { text: result.error };
  }
  if (plan.actionType === "draft_followup_email" && plan.input) {
    const result = await executeAction(ctx, "draft_followup_email", plan.input);
    if (result.ok) {
      const d = result.data as { draft: string };
      return { text: "טיוטת אימייל:\n\n" + d.draft };
    }
    return { text: result.error };
  }

  // שאילתות כלליות (בלי actionType)
  if (isGreeting(message)) {
    return {
      text:
        "שלום! איך אוכל לעזור? דוגמאות לשאלות:\n" +
        "• סך המכירות (Won) בחודש הנוכחי, אחוז עמידה ביעד\n" +
        "• שווי עסקאות ממוצע (Average Deal Value), Win Rate של הצוות\n" +
        "• שווי הצינור (Pipeline), עסקאות תקועות מעל שבועיים\n" +
        "• כמה לידים היום/השבוע, מקורות הגעה, משפנמה\n" +
        "• דוח מנהלים, דוח לפי בעלים, אחוז המרה של נציג [שם]\n" +
        "• מי הנציג עם Win Rate הגבוה, שווי תיק הגבוה\n" +
        "• רשימת מלאי, חדרים פנויים, סיכום עסקה X",
    };
  }
  function pipedriveErrorText(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("401") || msg.includes("Unauthorized"))
      return "חיבור ל-Pipedrive נכשל: הטוקן לא תקף. עדכן את PIPEDRIVE_API_TOKEN ב-.env מההגדרות ב-Pipedrive.";
    if (msg.includes("403")) return "אין הרשאה לגשת לנתונים. בדוק את הטוקן ב-Pipedrive.";
    if (msg.includes("404")) return "כתובת ה-API לא נמצאה. וודא ש-PIPEDRIVE_DOMAIN תקין או השאר ריק (נשתמש ב-api.pipedrive.com).";
    if (msg.includes("429")) return "יותר מדי בקשות ל-Pipedrive. חכה רגע ונסה שוב.";
    return `שגיאת חיבור ל-Pipedrive: ${msg.slice(0, 120)}. וודא ש-PIPEDRIVE_API_TOKEN מוגדר ב-.env.`;
  }

  // —— תשובות לשאלות KPI / אנליטיקה (גם לפי כוונה – matchIntentByKeywords) ——
  if (isWonSalesThisMonthQuery(message) || matchIntentByKeywords(message) === "won_sales_month") {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const won = deals.filter((d) => (d.status ?? "") === "won");
      const monthStartMs = getStartOfMonthIsraelMs();
      const wonThisMonth = won.filter((d) => dealWonTime(d) >= monthStartMs);
      const sum = wonThisMonth.reduce((s, d) => s + dealValue(d), 0);
      return {
        text: `סך המכירות (Won) בחודש הנוכחי: ${wonThisMonth.length} עסקאות, שווי כולל ${sum.toLocaleString("he-IL")}.\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isSalesTargetQuery(message)) {
    return {
      text: "אחוז עמידה ביעד מחושב מול יעד מכירות מוגדר. ב-Pipedrive אין שדה יעד חודשי מובנה – יש להגדיר יעדים במערכת חיצונית או בשדה מותאם. אפשר לשאול \"סך המכירות Won בחודש הנוכחי\" או \"כמה נסגרו החודש\".",
    };
  }

  if (isAverageDealValueQuery(message) || matchIntentByKeywords(message) === "average_deal_value") {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const won = deals.filter((d) => (d.status ?? "") === "won");
      const open = deals.filter((d) => (d.status ?? "open") === "open");
      const sumWon = won.reduce((s, d) => s + dealValue(d), 0);
      const sumOpen = open.reduce((s, d) => s + dealValue(d), 0);
      const avgWon = won.length ? Math.round(sumWon / won.length) : 0;
      const avgOpen = open.length ? Math.round(sumOpen / open.length) : 0;
      return {
        text: `שווי עסקאות ממוצע (Average Deal Value):\n• עסקאות שזכינו (Won): ${won.length} עסקאות, ממוצע ${avgWon.toLocaleString("he-IL")}\n• עסקאות פתוחות: ${open.length} עסקאות, ממוצע ${avgOpen.toLocaleString("he-IL")}\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isTeamWinRateQuery(message) || matchIntentByKeywords(message) === "team_win_rate") {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const won = deals.filter((d) => (d.status ?? "") === "won");
      const lost = deals.filter((d) => (d.status ?? "") === "lost");
      const closed = won.length + lost.length;
      const rate = closed ? Math.round((won.length / closed) * 100) : 0;
      return {
        text: `Win Rate כללי של הצוות: ${rate}% (${won.length} זכיות מתוך ${closed} עסקאות שנסוגרו – ${won.length} זכייה, ${lost.length} הפסד).\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isPipelineValueQuery(message) || matchIntentByKeywords(message) === "pipeline_value") {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const open = deals.filter((d) => (d.status ?? "open") === "open");
      const sum = open.reduce((s, d) => s + dealValue(d), 0);
      return {
        text: `שווי הצינור (Pipeline) הכולל כרגע: ${sum.toLocaleString("he-IL")} (${open.length} עסקאות פתוחות).\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isStuckTwoWeeksQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const openDeals = deals.filter((d) => (d.status ?? "open") === "open");
      const cutoffMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
      const stuck = openDeals.filter((d) => dealUpdateTime(d) > 0 && dealUpdateTime(d) < cutoffMs);
      return {
        text: `עסקאות פתוחות ללא עדכון מעל שבועיים: ${stuck.length} (סה"כ ${openDeals.length} עסקאות פתוחות).\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isMonthlySalesGrowthQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const won = deals.filter((d) => (d.status ?? "") === "won");
      const thisMonthStart = getStartOfMonthIsraelMs();
      const prevMonthStart = new Date(thisMonthStart);
      prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
      prevMonthStart.setDate(1);
      prevMonthStart.setHours(0, 0, 0, 0);
      const lastMonthStart = prevMonthStart.getTime();
      const lastMonthEnd = thisMonthStart - 1;
      const wonThisMonth = won.filter((d) => dealWonTime(d) >= thisMonthStart);
      const wonLastMonth = won.filter((d) => {
        const t = dealWonTime(d);
        return t >= lastMonthStart && t <= lastMonthEnd;
      });
      const sumThis = wonThisMonth.reduce((s, d) => s + dealValue(d), 0);
      const sumLast = wonLastMonth.reduce((s, d) => s + dealValue(d), 0);
      const growthPct = sumLast ? Math.round(((sumThis - sumLast) / sumLast) * 100) : (sumThis ? 100 : 0);
      return {
        text: `אחוז גידול במכירות מחודש לחודש:\n• החודש: ${wonThisMonth.length} עסקאות, שווי ${sumThis.toLocaleString("he-IL")}\n• חודש שעבר: ${wonLastMonth.length} עסקאות, שווי ${sumLast.toLocaleString("he-IL")}\n• שינוי: ${growthPct}%\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isYearOverYearQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const won = deals.filter((d) => (d.status ?? "") === "won");
      const y = new Date().getFullYear();
      const jan1ThisYearMs = new Date(Date.UTC(y, 0, 1, 0, 0, 0)).getTime();
      const nowMs = Date.now();
      const daysIntoYear = Math.floor((nowMs - jan1ThisYearMs) / (24 * 60 * 60 * 1000));
      const jan1LastYearMs = new Date(Date.UTC(y - 1, 0, 1, 0, 0, 0)).getTime();
      const periodEndLastYear = jan1LastYearMs + daysIntoYear * 24 * 60 * 60 * 1000;
      const wonThisPeriod = won.filter((d) => dealWonTime(d) >= jan1ThisYearMs && dealWonTime(d) <= nowMs);
      const wonLastYearSame = won.filter((d) => {
        const t = dealWonTime(d);
        return t >= jan1LastYearMs && t <= periodEndLastYear;
      });
      const sumThis = wonThisPeriod.reduce((s, d) => s + dealValue(d), 0);
      const sumLast = wonLastYearSame.reduce((s, d) => s + dealValue(d), 0);
      const pct = sumLast ? Math.round(((sumThis - sumLast) / sumLast) * 100) : (sumThis ? 100 : 0);
      return {
        text: `השוואה לאשתקד (תקופה מקבילה – מ-1.1 עד היום):\n• השנה: ${wonThisPeriod.length} עסקאות Won, שווי ${sumThis.toLocaleString("he-IL")}\n• אשתקד (אותו טווח ימים): ${wonLastYearSame.length} עסקאות Won, שווי ${sumLast.toLocaleString("he-IL")}\n• שינוי: ${pct}%\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  const repLeader = isRepLeaderboardQuery(message);
  if (repLeader === "winrate" || repLeader === "pipeline") {
    try {
      const [users, deals] = await Promise.all([
        ctx.pipedrive.listUsers(),
        ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
      ]);
      const byUser: { userId: number; name: string; won: number; lost: number; openValue: number }[] = [];
      for (const u of users) {
        const userDeals = deals.filter((d) => dealOwnerId(d) === u.id);
        const won = userDeals.filter((d) => (d.status ?? "") === "won").length;
        const lost = userDeals.filter((d) => (d.status ?? "") === "lost").length;
        const openValue = userDeals.filter((d) => (d.status ?? "open") === "open").reduce((s, d) => s + dealValue(d), 0);
        byUser.push({
          userId: u.id,
          name: (u.name ?? u.email ?? "נציג " + u.id).trim(),
          won,
          lost,
          openValue,
        });
      }
      if (repLeader === "winrate") {
        const withClosed = byUser.filter((u) => u.won + u.lost > 0);
        const sorted = [...withClosed].sort((a, b) => {
          const rateA = (a.won / (a.won + a.lost)) * 100;
          const rateB = (b.won / (b.won + b.lost)) * 100;
          return rateB - rateA;
        });
        const top = sorted.slice(0, 5);
        const lines = top.map((u, i) => {
          const rate = Math.round((u.won / (u.won + u.lost)) * 100);
          return `${i + 1}. ${u.name}: Win Rate ${rate}% (${u.won} זכיות, ${u.lost} הפסדים)`;
        });
        return { text: `נציגים עם Win Rate גבוה:\n\n${lines.join("\n")}\n\n(נתונים מ-Pipedrive)` };
      }
      const sortedPipeline = [...byUser].sort((a, b) => b.openValue - a.openValue);
      const top = sortedPipeline.slice(0, 5);
      const lines = top.map((u, i) => `${i + 1}. ${u.name}: שווי תיק ${u.openValue.toLocaleString("he-IL")}`);
      return { text: `נציגים עם שווי תיק (Pipeline) גבוה:\n\n${lines.join("\n")}\n\n(נתונים מ-Pipedrive)` };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isLostReasonQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const lost = deals.filter((d) => (d.status ?? "") === "lost");
      const reasonKeys = ["lost_reason", "lost_reason_id"]; // Pipedrive: לעיתים אובייקט עם name או id
      const byReason = new Map<string, number>();
      for (const d of lost) {
        let label = "ללא סיבה";
        for (const key of reasonKeys) {
          const r = (d as Record<string, unknown>)[key];
          if (r != null) {
            if (typeof r === "object" && r !== null) {
              if ("name" in r && (r as { name?: string }).name != null) label = String((r as { name: string }).name);
              else if ("value" in r && (r as { value?: string }).value != null) label = String((r as { value: string }).value);
              else if ("id" in r && (r as { id?: number }).id != null) label = `סיבה #${(r as { id: number }).id}`;
              else label = "ללא סיבה (שדה אובייקט)";
            } else label = String(r);
            break;
          }
        }
        byReason.set(label, (byReason.get(label) ?? 0) + 1);
      }
      const monthStartMs = getStartOfMonthIsraelMs();
      const lostThisMonth = lost.filter((d) => dealUpdateTime(d) >= monthStartMs);
      if (lost.length === 0) {
        return { text: "אין עסקאות Lost במערכת. סיבת הפסד (Lost Reason) מופיעה כשדה בעסקה – ייתכן שהשדה נקרא אחרת ב-Pipedrive (שדה מותאם)." };
      }
      const entries = [...byReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      const lines = entries.map(([name, count]) => `• ${name}: ${count} עסקאות`);
      return {
        text: `סיבת הפסד (Lost Reason) – התפלגות:\n\n${lines.join("\n")}\n\nסה"כ Lost: ${lost.length}. החודש: ${lostThisMonth.length}.\n(אם רואים "ללא סיבה" – ייתכן ששדה סיבת ההפסד ב-Pipedrive נקרא אחרת; ניתן להגדיר שדה מותאם.)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isWeightedForecastQuery(message)) {
    return {
      text: "שווי צפוי (Weighted Value) מחושב לפי הסתברות לכל עסקה. ב-Pipedrive אין שדה Probability מובנה בעסקה – ניתן להשתמש בשדה מותאם ולהרחיב את החישוב. כרגע: שאל \"שווי הצינור הכולל\" לקבלת שווי עסקאות פתוחות.",
    };
  }

  if (isHighValueAtRiskQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const open = deals.filter((d) => (d.status ?? "open") === "open");
      const withValue = open.filter((d) => dealValue(d) > 0).sort((a, b) => dealValue(b) - dealValue(a));
      const top = withValue.slice(0, 10);
      const lines = top.map((d) => `• עסקה #${d.id} – ${(d.title ?? "ללא כותרת").slice(0, 40)}: שווי ${dealValue(d).toLocaleString("he-IL")}`);
      return {
        text: `עסקאות פתוחות בשווי גבוה (לפי שווי):\n\n${lines.length ? lines.join("\n") : "אין עסקאות פתוחות עם שווי."}\n\n(רשימה לפי גודל – מומלץ לבדוק תאריך סגירה משוער ב-Pipedrive.)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isChurnByStageQuery(message)) {
    try {
      const [stages, deals] = await Promise.all([
        ctx.pipedrive.listStages(),
        ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
      ]);
      const lost = deals.filter((d) => (d.status ?? "") === "lost");
      const byStage = new Map<number, number>();
      for (const d of lost) {
        const sid = d.stage_id ?? 0;
        byStage.set(sid, (byStage.get(sid) ?? 0) + 1);
      }
      const stageNames = new Map(stages.map((s) => [s.id, s.name ?? "שלב " + s.id]));
      const entries = [...byStage.entries()]
        .filter(([id]) => id > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      const lines = entries.map(([id, count]) => `• ${stageNames.get(id) ?? id}: ${count} עסקאות Lost`);
      return {
        text: `באיזה שלב יש הכי הרבה הפסדים (Lost):\n\n${lines.length ? lines.join("\n") : "אין מידע על שלב ב-Lost."}\n\nסה"כ Lost: ${lost.length}.\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isDealLifecycleQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const won = deals.filter((d) => (d.status ?? "") === "won");
      const withTimes = won.filter((d) => dealAddTime(d) > 0 && dealWonTime(d) > 0);
      const days = withTimes
        .map((d) => (dealWonTime(d) - dealAddTime(d)) / (24 * 60 * 60 * 1000))
        .filter((d) => d >= 0);
      const avgDays = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;
      return {
        text: `זמן חיים ממוצע של עסקה (מפתיחה לסגירה בהצלחה): ${avgDays} ימים.\n(חושב מ-${days.length} עסקאות Won עם תאריכים תקינים – נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isInflowVsCloseQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const newThisWeek = deals.filter((d) => dealAddTime(d) >= weekStart);
      const won = deals.filter((d) => (d.status ?? "") === "won");
      const wonThisWeek = won.filter((d) => dealWonTime(d) >= weekStart);
      return {
        text: `קצב כניסה אל מול סגירה (השבוע):\n• לידים/עסקאות חדשות שנפתחו: ${newThisWeek.length}\n• עסקאות שנסוגרו בהצלחה (Won): ${wonThisWeek.length}\n\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isProfitableSourcesQuery(message)) {
    try {
      const [sources, deals] = await Promise.all([
        ctx.pipedrive.listLeadSources(),
        ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
      ]);
      const won = deals.filter((d) => (d.status ?? "") === "won");
      const bySource = new Map<number, { count: number; value: number }>();
      for (const d of won) {
        const sid = (d as { lead_source_id?: number }).lead_source_id;
        if (sid != null) {
          const cur = bySource.get(sid) ?? { count: 0, value: 0 };
          bySource.set(sid, { count: cur.count + 1, value: cur.value + dealValue(d) });
        }
      }
      const names = new Map(sources.map((s) => [s.id, s.name ?? "מקור " + s.id]));
      const entries = [...bySource.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 10);
      const lines = entries.map(([id, v]) => `• ${names.get(id)}: ${v.count} עסקאות Won, שווי ${v.value.toLocaleString("he-IL")}`);
      return {
        text: `מקורות הגעה רווחיים (לפי שווי Won):\n\n${lines.length ? lines.join("\n") : "אין מידע על מקור לידים בעסקאות Won."}\n\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isLeadToDealConversionQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const withSource = deals.filter((d) => (d as { lead_source_id?: number }).lead_source_id != null);
      const won = deals.filter((d) => (d.status ?? "") === "won");
      const totalWithSource = withSource.length;
      const wonWithSource = won.filter((d) => (d as { lead_source_id?: number }).lead_source_id != null);
      const pct = totalWithSource ? Math.round((wonWithSource.length / totalWithSource) * 100) : 0;
      return {
        text: `אחוז המרה מליד לעסקה (מבין עסקאות עם מקור הגעה): כ-${pct}% (${wonWithSource.length} Won מתוך ${totalWithSource} עסקאות עם מקור).\nסה"כ Won במערכת: ${won.length}. (המספר מדגמי – לא כל הלידים מופיעים כעסקאות עם מקור.)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isWinRateByProductQuery(message)) {
    return {
      text: "Win Rate לפי מוצר/שירות דורש חיבור עסקאות למוצרים (Deal Products). כרגע החישוב לא מומש – ניתן להרחיב בעתיד עם נתוני מוצרים בעסקאות.",
    };
  }

  if (isNewDealsOpenedQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const todayStart = getStartOfTodayIsraelMs();
      const weekStart = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const addedToday = deals.filter((d) => dealAddTime(d) >= todayStart);
      const addedThisWeek = deals.filter((d) => dealAddTime(d) >= weekStart);
      return {
        text: `עסקאות חדשות שנפתחו:\n• היום: ${addedToday.length}\n• השבוע: ${addedThisWeek.length}\n\n(נתונים מ-Pipedrive)`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isDealsTodayQuery(message) || isDealsWeekQuery(message) || isDealsYesterdayQuery(message) || matchIntentByKeywords(message) === "deals_today_week") {
    try {
      const now = Date.now();
      const todayStartIsrael = getStartOfTodayIsraelMs();
      const yesterdayStartIsrael = todayStartIsrael - 24 * 60 * 60 * 1000;
      const weekStartMs = now - 7 * 24 * 60 * 60 * 1000;

      if (isDealsYesterdayQuery(message)) {
        // לידים אתמול: שליפה לפי add_time עד שעוברים את אתמול – לא מוגבל ל־10k
        const dealsSinceYesterday = await ctx.pipedrive.listDealsAddedSince(yesterdayStartIsrael);
        const addedYesterday = dealsSinceYesterday.filter((d) => {
          const t = dealAddTime(d);
          return t >= yesterdayStartIsrael && t < todayStartIsrael;
        });
        const hint = dealsSinceYesterday.length === 0 && addedYesterday.length === 0 ? "\n(אם יש עסקאות ב-Pipedrive – בדוק חיבור: פתח /api/debug/pipedrive בדפדפן.)" : "";
        return {
          text: `נתונים עדכניים מ-Pipedrive:\nאתמול (לפי שעון ישראל) הגיעו ${addedYesterday.length} לידים.${hint}`,
        };
      }

      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const addedToday = deals.filter((d) => dealAddTime(d) >= todayStartIsrael);
      const addedThisWeek = deals.filter((d) => dealAddTime(d) >= weekStartMs);
      const total = deals.length;
      const limitNote = total >= MAX_DEALS_FETCH ? ` (נטענו עד ${MAX_DEALS_FETCH} עסקאות – ייתכן שיש עוד)` : "";
      const hint = total === 0 ? "\n(אם יש עסקאות ב-Pipedrive – בדוק חיבור: פתח /api/debug/pipedrive בדפדפן.)" : "";
      if (isDealsTodayQuery(message)) {
        return { text: `נתונים עדכניים מ-Pipedrive:\nסה"כ ${total} עסקאות${limitNote}. היום (לפי שעון ישראל) נוספו ${addedToday.length} עסקאות.${hint}` };
      }
      return { text: `נתונים עדכניים מ-Pipedrive:\nסה"כ ${total} עסקאות${limitNote}. השבוע הגיעו ${addedThisWeek.length} לידים.${hint}` };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isWonThisWeekQuery(message) || isWonLastWeekQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const won = deals.filter((d) => (d.status ?? "") === "won");
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;
      const thisWeekStart = now - 7 * oneDay;
      const lastWeekStart = now - 14 * oneDay;
      const wonThisWeek = won.filter((d) => dealWonTime(d) >= thisWeekStart);
      const wonLastWeek = won.filter((d) => {
        const t = dealWonTime(d);
        return t >= lastWeekStart && t < thisWeekStart;
      });
      if (isWonLastWeekQuery(message)) {
        return { text: `נתונים עדכניים מ-Pipedrive:\nעסקאות שזכינו (WON) שבוע שעבר: ${wonLastWeek.length}. סה"כ WON במערכת: ${won.length}.` };
      }
      return { text: `נתונים עדכניים מ-Pipedrive:\nעסקאות שזכינו (WON) השבוע: ${wonThisWeek.length}. סה"כ WON במערכת: ${won.length}.` };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isFollowUpSourcesAfterYesterday) {
    try {
      const [sources, deals] = await Promise.all([
        ctx.pipedrive.listLeadSources(),
        ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
      ]);
      const yesterdayStartIsrael = getStartOfTodayIsraelMs() - 24 * 60 * 60 * 1000;
      const yesterdayEndIsrael = getStartOfTodayIsraelMs();
      const dealsYesterday = deals.filter((d) => {
        const t = dealAddTime(d);
        return t >= yesterdayStartIsrael && t < yesterdayEndIsrael;
      });
      const bySource = new Map<number, number>();
      for (const d of dealsYesterday) {
        const sid = (d as { lead_source_id?: number }).lead_source_id;
        if (sid != null) bySource.set(sid, (bySource.get(sid) ?? 0) + 1);
      }
      if (sources.length === 0) {
        return { text: "לא נמצאו מקורות הגעה בהגדרות Pipedrive." };
      }
      const lines = sources
        .filter((s) => (bySource.get(s.id) ?? 0) > 0)
        .map((s) => `• ${s.name ?? "מקור " + s.id}: ${bySource.get(s.id) ?? 0} לידים`);
      const totalFromSources = dealsYesterday.filter((d) => (d as { lead_source_id?: number }).lead_source_id != null).length;
      return {
        text: `מקורות הגעה של הלידים שאתמול (לפי שעון ישראל), סה"כ ${dealsYesterday.length} לידים:\n\n${lines.length ? lines.join("\n") : "אין מידע על מקור לידים אתמול."}\n\n${totalFromSources} מתוכם עם מקור מוגדר.`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isLeadSourcesQuery(message) || matchIntentByKeywords(message) === "lead_sources") {
    try {
      const [sources, deals] = await Promise.all([
        ctx.pipedrive.listLeadSources(),
        ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
      ]);
      const bySource = new Map<number, number>();
      for (const d of deals) {
        const sid = (d as { lead_source_id?: number }).lead_source_id;
        if (sid != null) bySource.set(sid, (bySource.get(sid) ?? 0) + 1);
      }
      if (sources.length === 0) {
        return { text: "לא נמצאו מקורות הגעה בהגדרות Pipedrive, או שה-API לא תומך בכך." };
      }
      const lines = sources.map((s) => {
        const count = bySource.get(s.id) ?? 0;
        return `• ${s.name ?? "מקור " + s.id}: ${count} עסקאות`;
      });
      return { text: `מקורות הגעה (מ-Pipedrive):\n\n${lines.join("\n")}\n\nסה"כ מקורות: ${sources.length}.` };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isAvailableRoomsAboveQuery(message)) {
    const minRooms = parseAvailableRoomsAbove(message);
    if (minRooms == null) return { text: "לא זיהיתי כמות. נסה: כמה חדרים פנויים מעל 5" };
    try {
      const [fields, products] = await Promise.all([
        ctx.pipedrive.listProductFields(),
        ctx.pipedrive.listProducts(MAX_PRODUCTS_FETCH),
      ]);
      const availableRoomsKey = getAvailableRoomsFieldKey(fields);
      if (!availableRoomsKey) {
        return { text: "לא נמצא שדה 'חדרים פנויים' בהגדרות שדות המוצר ב-Pipedrive." };
      }
      const above = products.filter(
        (p) => getProductCustomNum(p as Record<string, unknown>, availableRoomsKey) >= minRooms
      );
      const totalRooms = above.reduce(
        (sum, p) => sum + getProductCustomNum(p as Record<string, unknown>, availableRoomsKey),
        0
      );
      const lineSep = "─────────────────────────────────────";
      const productLines = above.slice(0, 100).map((p) => {
        const name = (p.name ?? "ללא שם").trim() || "ללא שם";
        const x = getProductCustomNum(p as Record<string, unknown>, availableRoomsKey);
        return "\u202B" + name + "\u202C\nכמות חדרים פנויים : " + x;
      });
      const body = productLines.join("\n\n" + lineSep + "\n\n");
      const more = above.length > 100 ? `\n\n${lineSep}\n\n... ועוד ${above.length - 100} מוצרים.` : "";
      return {
        text: `נתונים עדכניים מ-Pipedrive:\nמוצרים עם חדרים פנויים מעל ${minRooms}: ${above.length} מוצרים, סה"כ ${totalRooms} חדרים פנויים.\n\n${body}${more}`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  const stageCount = isStageCountQuery(message);
  if (stageCount) {
    try {
      const stages = await ctx.pipedrive.listStages();
      const nameLower = stageCount.stageName.toLowerCase().replace(/\s+/g, " ");
      const stage = stages.find(
        (s) => (s.name ?? "").toLowerCase().replace(/\s+/g, " ").includes(nameLower) || nameLower.includes((s.name ?? "").toLowerCase())
      );
      if (!stage) {
        return {
          text: `לא נמצא שלב בשם "${stageCount.stageName}". שמות השלבים במערכת: ${stages.slice(0, 15).map((s) => s.name || "?").join(", ")}.`,
        };
      }
      let deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH, stage.id);
      deals = deals.filter((d) => d.stage_id === stage.id);
      if (stageCount.openOnly) {
        deals = deals.filter((d) => (d.status ?? "open") === "open");
      }
      const label = stageCount.openOnly ? "עסקאות פתוחות" : "לידים/עסקאות";
      return {
        text: `נתונים עדכניים מ-Pipedrive:\nבשלב "${stage.name ?? stageCount.stageName}" יש ${deals.length} ${label}.`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  const stuckDays = isStuckDealsQuery(message);
  if (stuckDays != null) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const openDeals = deals.filter((d) => (d.status ?? "open") === "open");
      const cutoffMs = Date.now() - stuckDays * 24 * 60 * 60 * 1000;
      const stuck = openDeals.filter((d) => dealUpdateTime(d) > 0 && dealUpdateTime(d) < cutoffMs);
      return {
        text: `נתונים עדכניים מ-Pipedrive:\nלידים/עסקאות פתוחות ללא עדכון מעל ${stuckDays} ימים: ${stuck.length} (סה"כ ${openDeals.length} עסקאות פתוחות).`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isFunnelQuery(message)) {
    try {
      const [stages, deals] = await Promise.all([
        ctx.pipedrive.listStages(),
        ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
      ]);
      const openDeals = deals.filter((d) => (d.status ?? "open") === "open");
      const byStage = stages.map((s) => ({
        name: s.name ?? `שלב ${s.id}`,
        count: openDeals.filter((d) => d.stage_id === s.id).length,
      }));
      const lines = byStage.map((s) => `• ${s.name}: ${s.count}`).join("\n\n");
      return {
        text: `נתונים עדכניים מ-Pipedrive – משפנמה (עסקאות פתוחות לפי שלב):\n\n${lines}\n\nסה"כ עסקאות פתוחות: ${openDeals.length}.`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  const wonLost = isWonLostQuery(message);
  if (wonLost) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const status = wonLost;
      const filtered = deals.filter((d) => (d.status ?? "open") === status);
      const monthStartMs = getStartOfMonthIsraelMs();
      const wonThisMonth = filtered.filter((d) => dealWonTime(d) >= monthStartMs);
      const label = status === "won" ? "נסגרו בהצלחה" : status === "lost" ? "הופסדו" : "פתוחות";
      let text = `נתונים עדכניים מ-Pipedrive:\nעסקאות ${label}: ${filtered.length}.`;
      if (status === "won" && wonThisMonth.length !== filtered.length) {
        text += `\nהחודש: ${wonThisMonth.length}.`;
      }
      return { text };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isValueQuery(message)) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const open = deals.filter((d) => (d.status ?? "open") === "open");
      const won = deals.filter((d) => d.status === "won");
      const monthStartMs = getStartOfMonthIsraelMs();
      const wonThisMonth = won.filter((d) => dealWonTime(d) >= monthStartMs);
      const sumOpen = open.reduce((s, d) => s + dealValue(d), 0);
      const sumWonMonth = wonThisMonth.reduce((s, d) => s + dealValue(d), 0);
      return {
        text: `נתונים עדכניים מ-Pipedrive – שווי:\n• שווי עסקאות פתוחות: ${sumOpen.toLocaleString("he-IL")}\n• שווי עסקאות שזכינו בהן החודש: ${sumWonMonth.toLocaleString("he-IL")} (${wonThisMonth.length} עסקאות).`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isManagerSummaryQuery(message) || matchIntentByKeywords(message) === "manager_summary") {
    try {
      const [stages, deals, products] = await Promise.all([
        ctx.pipedrive.listStages(),
        ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
        ctx.pipedrive.listProducts(MAX_PRODUCTS_FETCH),
      ]);
      const open = deals.filter((d) => (d.status ?? "open") === "open");
      const won = deals.filter((d) => d.status === "won");
      const lost = deals.filter((d) => d.status === "lost");
      const monthStartMs = getStartOfMonthIsraelMs();
      const wonThisMonth = won.filter((d) => dealWonTime(d) >= monthStartMs);
      const sumOpen = open.reduce((s, d) => s + dealValue(d), 0);
      const sumWonMonth = wonThisMonth.reduce((s, d) => s + dealValue(d), 0);
      const funnelLines = stages
        .slice(0, 12)
        .map((s) => `  ${s.name ?? s.id}: ${open.filter((d) => d.stage_id === s.id).length}`)
        .join("\n");
      const text =
        `נתונים עדכניים מ-Pipedrive – דוח מנהלים:\n\n` +
        `עסקאות: פתוחות ${open.length} | זכינו ${won.length} | הופסדו ${lost.length}\n` +
        `החודש (נסגרו בהצלחה): ${wonThisMonth.length} עסקאות, שווי ${sumWonMonth.toLocaleString("he-IL")}\n` +
        `שווי עסקאות פתוחות: ${sumOpen.toLocaleString("he-IL")}\n` +
        `מוצרים במלאי: ${products.length}\n\n` +
        `משפנמה (פתוחות לפי שלב):\n${funnelLines}`;
      return { text };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  const byOwner = isByOwnerQuery(message);
  if (byOwner) {
    try {
      const [users, deals] = await Promise.all([
        ctx.pipedrive.listUsers(),
        ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
      ]);
      if (typeof byOwner === "object" && byOwner.ownerName) {
        const name = byOwner.ownerName.toLowerCase();
        const user = users.find(
          (u) =>
            (u.name ?? "").toLowerCase().includes(name) ||
            (u.email ?? "").toLowerCase().includes(name)
        );
        if (!user) {
          return {
            text: `לא נמצא בעלים בשם "${byOwner.ownerName}". משתמשים: ${users.slice(0, 10).map((u) => u.name ?? u.email ?? "?").join(", ")}.`,
          };
        }
        const userDeals = deals.filter((d) => dealOwnerId(d) === user.id);
        const open = userDeals.filter((d) => (d.status ?? "open") === "open");
        const sum = open.reduce((s, d) => s + dealValue(d), 0);
        return {
          text: `נתונים עדכניים מ-Pipedrive – עסקאות של ${user.name ?? user.email ?? user.id}:\nסה"כ ${userDeals.length} עסקאות (${open.length} פתוחות), שווי פתוחות: ${sum.toLocaleString("he-IL")}.`,
        };
      }
      const lines = users.slice(0, 20).map((u) => {
        const userDeals = deals.filter((d) => dealOwnerId(d) === u.id);
        const open = userDeals.filter((d) => (d.status ?? "open") === "open");
        return `• ${u.name ?? u.email ?? "משתמש " + u.id}: ${open.length} פתוחות, סה"כ ${userDeals.length}`;
      });
      return {
        text: `נתונים עדכניים מ-Pipedrive – דוח לפי בעלים:\n\n${lines.join("\n\n")}`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isConversionRateQuery(message) || matchIntentByKeywords(message) === "conversion_rate") {
    const repName = parseConversionRateRepName(message);
    if (!repName) {
      return { text: 'לא זיהיתי שם נציג. נסה: "מה אחוז המרה של נציג יוסי" או "אחוז המרה של דוד".' };
    }
    const period = parseConversionRatePeriod(message);
    try {
      const users = await ctx.pipedrive.listUsers();
      const nameLower = repName.toLowerCase();
      const user = users.find(
        (u) =>
          (u.name ?? "").toLowerCase().includes(nameLower) ||
          (u.name ?? "").toLowerCase().split(/\s+/).some((part) => part.startsWith(nameLower) || nameLower.startsWith(part)) ||
          (u.email ?? "").toLowerCase().includes(nameLower)
      );
      if (!user) {
        return {
          text: `לא נמצא נציג בשם "${repName}". נציגים: ${users.slice(0, 15).map((u) => u.name ?? u.email ?? "?").join(", ")}.`,
        };
      }
      // שימוש ב-listDealsByOwner (GET /deals?user_id=) – מחזיר עסקאות של הנציג ישירות API
      let userDeals = await ctx.pipedrive.listDealsByOwner(user.id, MAX_DEALS_FETCH);
      let won = userDeals.filter((d) => d.status === "won");
      let lost = userDeals.filter((d) => d.status === "lost");
      if (period) {
        const cutoffMs = Date.now() - period.days * 24 * 60 * 60 * 1000;
        won = won.filter((d) => dealWonTime(d) >= cutoffMs);
        lost = lost.filter((d) => dealUpdateTime(d) >= cutoffMs);
      }
      const closed = won.length + lost.length;
      const displayName = user.name ?? user.email ?? "נציג " + user.id;
      const periodLabel = period ? ` (${period.label})` : "";
      if (closed === 0) {
        const totalLabel = period ? ` ב${period.label}` : "";
        return {
          text: `לנציג ${displayName}${totalLabel} אין עסקאות שנסוגרו (זכייה או הפסד). סה"כ עסקאות של הנציג במערכת: ${userDeals.length}.`,
        };
      }
      const rate = Math.round((won.length / closed) * 100);
      return {
        text: `אחוז המרה של ${displayName}${periodLabel}:\n${rate}% (${won.length} זכיות מתוך ${closed} עסקאות שנסוגרו: ${won.length} זכייה, ${lost.length} הפסד). סה"כ עסקאות של הנציג: ${userDeals.length}.`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  const byMonth = isByMonthQuery(message);
  if (byMonth) {
    try {
      const deals = await ctx.pipedrive.listDeals(MAX_DEALS_FETCH);
      const won = deals.filter((d) => d.status === "won");
      let monthStartMs: number;
      let monthEndMs: number;
      if (byMonth === "this") {
        monthStartMs = getStartOfMonthIsraelMs();
        monthEndMs = Date.now();
      } else {
        const thisMonthStart = getStartOfMonthIsraelMs();
        const prev = new Date(thisMonthStart);
        prev.setMonth(prev.getMonth() - 1);
        prev.setDate(1);
        prev.setHours(0, 0, 0, 0);
        monthStartMs = prev.getTime();
        monthEndMs = thisMonthStart - 1;
      }
      const wonInPeriod = won.filter(
        (d) => dealWonTime(d) >= monthStartMs && dealWonTime(d) <= monthEndMs
      );
      const sum = wonInPeriod.reduce((s, d) => s + dealValue(d), 0);
      const label = byMonth === "this" ? "החודש" : "חודש שעבר";
      return {
        text: `נתונים עדכניים מ-Pipedrive:\nעסקאות שנסגרו בהצלחה ${label}: ${wonInPeriod.length}, שווי ${sum.toLocaleString("he-IL")}.`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isByPipelineQuery(message)) {
    try {
      const [pipelines, stages, deals] = await Promise.all([
        ctx.pipedrive.listPipelines(),
        ctx.pipedrive.listStages(),
        ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
      ]);
      const open = deals.filter((d) => (d.status ?? "open") === "open");
      const lines = pipelines.map((pipe) => {
        const stageIds = new Set(stages.filter((s) => s.pipeline_id === pipe.id).map((s) => s.id));
        const count = open.filter((d) => d.stage_id != null && stageIds.has(d.stage_id)).length;
        return `• ${pipe.name ?? "פייפליין " + pipe.id}: ${count} עסקאות פתוחות`;
      });
      return {
        text: `נתונים עדכניים מ-Pipedrive – לפי פייפליין:\n\n${lines.join("\n\n")}\n\nסה"כ עסקאות פתוחות: ${open.length}.`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isDateFilteredInventoryQuery(message)) {
    const dateFilter = parseDateFilterFromMessage(message);
    if (dateFilter && (dateFilter.year != null || dateFilter.month != null)) {
      try {
        const [fields, products] = await Promise.all([
          ctx.pipedrive.listProductFields(),
          ctx.pipedrive.listProducts(MAX_PRODUCTS_FETCH),
        ]);
        const departureKey = getDepartureDateFieldKey(fields);
        const availableRoomsKey = getAvailableRoomsFieldKey(fields);
        const stockKey = getStockQuantityFieldKey(fields);
        const roomTypeKey = getRoomTypeFieldKey(fields);
        if (!departureKey) {
          return {
            text: "סינון לפי תאריך יציאה לא זמין: לא נמצא שדה 'תאריך יציאה' בהגדרות שדות המוצר ב-Pipedrive.",
          };
        }
        if (!availableRoomsKey) {
          return {
            text: "לא נמצא שדה 'חדרים פנויים' בהגדרות שדות המוצר ב-Pipedrive.",
          };
        }
        const filtered = products.filter((p) => {
          const record = p as Record<string, unknown>;
          const dm = getProductDateYearMonth(record, departureKey);
          if (!dm) return false;
          if (dateFilter.year != null && dm.year !== dateFilter.year) return false;
          if (dateFilter.month != null && dm.month !== dateFilter.month) return false;
          return true;
        });
        const totalRooms = filtered.reduce(
          (sum, p) => sum + getProductCustomNum(p as Record<string, unknown>, availableRoomsKey),
          0
        );
        const label =
          dateFilter.month != null && dateFilter.year != null
            ? `חודש ${dateFilter.month}/${dateFilter.year}`
            : dateFilter.year != null
              ? `שנת ${dateFilter.year}`
              : dateFilter.month != null
                ? `חודש ${dateFilter.month}`
                : "";
        const summary = `מלאי לפי תאריך יציאה (${label}): סה"כ ${totalRooms} חדרים פנויים.`;
        if (filtered.length === 0) {
          return { text: `אין מוצרים עם תאריך יציאה ב-${label}. ${summary}` };
        }
        const body = formatInventoryGrouped(
          filtered.map((p) => p as Record<string, unknown> & { name?: string | null }),
          { availableRoomsKey, stockKey, roomTypeKey, departureKey, maxGroups: 50, maxPerGroup: 80 }
        );
        const more = filtered.length > 2500 ? `\n\n... סה"כ ${filtered.length} פריטים.` : "";
        return {
          text: `${summary}\n\n${body}${more}`,
        };
      } catch (e) {
        return { text: pipedriveErrorText(e) };
      }
    }
  }

  if (isTotalAvailableRoomsQuery(message)) {
    try {
      const [fields, products] = await Promise.all([
        ctx.pipedrive.listProductFields(),
        ctx.pipedrive.listProducts(MAX_PRODUCTS_FETCH),
      ]);
      const availableRoomsKey = getAvailableRoomsFieldKey(fields);
      if (!availableRoomsKey) {
        return {
          text:
            "לא נמצא שדה 'חדרים פנויים' בהגדרות שדות המוצר ב-Pipedrive. וודא שיש שדה מותאם בשם 'חדרים פנויים' (או 'Available rooms') במוצרים.",
        };
      }
      const total = products.reduce(
        (sum, p) => sum + getProductCustomNum(p as Record<string, unknown>, availableRoomsKey),
        0
      );
      return {
        text: `בתצוגת המלאי: סה"כ ${total} חדרים פנויים.`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isAvailableRoomsQuery(message)) {
    try {
      const [fields, products] = await Promise.all([
        ctx.pipedrive.listProductFields(),
        ctx.pipedrive.listProducts(MAX_PRODUCTS_FETCH),
      ]);
      const availableRoomsKey = getAvailableRoomsFieldKey(fields);
      if (!availableRoomsKey) {
        return {
          text:
            "לא נמצא שדה 'חדרים פנויים' בהגדרות שדות המוצר ב-Pipedrive. וודא שיש שדה מותאם בשם 'חדרים פנויים' (או 'Available rooms') במוצרים, ושהטוקן יכול לקרוא שדות מוצר.",
        };
      }
      const withAvailable = products.filter((p) => getProductCustomNum(p as Record<string, unknown>, availableRoomsKey) > 0);
      if (withAvailable.length === 0) {
        return { text: "נתונים עדכניים מ-Pipedrive: נכון להיום אין מוצרים/חדרים עם חדרים פנויים (מעל 0)." };
      }
      const stockKey = getStockQuantityFieldKey(fields);
      const roomTypeKey = getRoomTypeFieldKey(fields);
      const departureKey = getDepartureDateFieldKey(fields);
      const body = formatInventoryGrouped(
        withAvailable.map((p) => p as Record<string, unknown> & { name?: string | null }),
        { availableRoomsKey, stockKey, roomTypeKey, departureKey, maxGroups: 50, maxPerGroup: 80 }
      );
      return {
        text: `חדרים פנויים נכון להיום (${withAvailable.length} פריטים):\n\n${body}`,
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isProductsInventoryQuery(message)) {
    try {
      const [fields, products] = await Promise.all([
        ctx.pipedrive.listProductFields(),
        ctx.pipedrive.listProducts(MAX_PRODUCTS_FETCH),
      ]);
      if (products.length === 0) {
        return { text: "נתונים עדכניים: אין מוצרים במאגר כרגע, או שהחיבור נכשל (בדוק PIPEDRIVE_API_TOKEN)." };
      }
      const stockKey = getStockQuantityFieldKey(fields);
      const roomTypeKey = getRoomTypeFieldKey(fields);
      const availableRoomsKey = getAvailableRoomsFieldKey(fields);
      const departureKey = getDepartureDateFieldKey(fields);
      const limitNote = products.length >= MAX_PRODUCTS_FETCH ? ` (מוצגים עד ${MAX_PRODUCTS_FETCH} ראשונים)` : "";
      const body = formatInventoryGrouped(
        products.map((p) => p as Record<string, unknown> & { name?: string | null }),
        { availableRoomsKey, stockKey, roomTypeKey, departureKey, maxGroups: 50, maxPerGroup: 80 }
      );
      const more = products.length > 2500 ? `\n\n... סה"כ ${products.length} פריטים במערכת.` : "";
      return { text: `נתונים עדכניים מ-Pipedrive – רשימת מלאי (${products.length} פריטים${limitNote}):\n\n${body}${more}` };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  if (isDataRelatedQuery(message) || looksLikeQuestion(message)) {
    try {
      const [deals, products] = await Promise.all([
        ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
        ctx.pipedrive.listProducts(MAX_PRODUCTS_FETCH),
      ]);
      const dealsNote = deals.length >= MAX_DEALS_FETCH ? ` (עד ${MAX_DEALS_FETCH} ראשונות)` : "";
      const productsNote = products.length >= MAX_PRODUCTS_FETCH ? ` (עד ${MAX_PRODUCTS_FETCH} ראשונים)` : "";
      return {
        text:
          `נתונים עדכניים מהמאגר (Pipedrive):\n• עסקאות: ${deals.length}${dealsNote}\n• מוצרים: ${products.length}${productsNote}\n\n` +
          "לפרטים: שאל \"כמה לידים היום\", \"כמה עסקאות השבוע\", \"רשימת מלאי\", \"כמה חדרים פנויים\", \"סיכום עסקה X\", \"דוח שבועי\".",
      };
    } catch (e) {
      return { text: pipedriveErrorText(e) };
    }
  }

  try {
    const searchTerm = message.trim().replace(/\?+$/, "").slice(0, 100);
    if (searchTerm.length >= 2) {
      try {
        const searchDeals = await ctx.pipedrive.searchDeals({ term: searchTerm });
        if (searchDeals.length > 0) {
          const sample = searchDeals.slice(0, 5).map((d) => `• ${(d.title ?? "ללא כותרת").trim()}`).join("\n");
          const more = searchDeals.length > 5 ? `\n... ועוד ${searchDeals.length - 5} עסקאות.` : "";
          return {
            text:
              `חיפשתי ב-Pipedrive לפי "${searchTerm}":\nנמצאו ${searchDeals.length} עסקאות רלוונטיות.\n\nדוגמאות:\n${sample}${more}\n\nלפרט על עסקה ספציפית שאל "סיכום עסקה X" (מספר העסקה).`,
          };
        }
      } catch {
        /* search failed, fall through to summary */
      }
    }
    const [deals, products] = await Promise.all([
      ctx.pipedrive.listDeals(MAX_DEALS_FETCH),
      ctx.pipedrive.listProducts(MAX_PRODUCTS_FETCH),
    ]);
    return {
      text:
        `לפי מה שהבנתי – הנה סיכום הנתונים במערכת:\n• עסקאות: ${deals.length}\n• מוצרים: ${products.length}\n\n` +
        "אפשר לשאול בניסוח חופשי (מכירות החודש, Win Rate, שווי צינור, לידים היום/השבוע, מקורות הגעה, דוח מנהלים, אחוז המרה של נציג, רשימת מלאי וכו') – אענה לפי הכוונה. שאלה עם מילים ספציפיות תחפש עסקאות במערכת.",
    };
  } catch {
    return {
      text:
        "הנה סיכום: אפשר לשאול בכל ניסוח על מכירות, Win Rate, שווי צינור, לידים, מקורות הגעה, דוח מנהלים, רשימת מלאי – אענה לפי הכוונה.",
    };
  }
}
