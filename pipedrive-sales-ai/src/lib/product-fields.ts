/**
 * לוגיקה משותפת למלאי מוצרים – סנכרון מלא בין צ'אט, דוחות ואקסל.
 * כל השימושים בשדות מותאמים (חדרים פנויים, כמות במלאי) עוברים מכאן.
 */

import type { ProductFieldMeta } from "../pipedrive/client.js";

/** מכסה אחידה לשליפת מוצרים בכל המקומות (צ'אט, דוח אקסל) */
export const PRODUCTS_FETCH_LIMIT = 2000;

/** תוויות לשדה "חדרים פנויים" – התאמה לעברית ואנגלית */
export const AVAILABLE_ROOMS_LABELS = [
  "חדרים פנויים",
  "Available rooms",
  "available rooms",
] as const;

/** תוויות לשדה "כמות במלאי" */
export const STOCK_QUANTITY_LABELS = [
  "כמות במלאי",
  "Quantity in stock",
  "quantity in stock",
] as const;

/** תוויות לשדה "סוג חדר" */
export const ROOM_TYPE_LABELS = [
  "סוג חדר",
  "Room type",
  "room type",
] as const;

/** תוויות לשדה "תאריך יציאה" */
export const DEPARTURE_DATE_LABELS = [
  "תאריך יציאה",
  "Departure date",
  "Exit date",
  "exit date",
] as const;

/**
 * מחזיר את מפתח השדה (API key) לפי שם השדה ב-Pipedrive.
 * תואם לעברית ואנגלית.
 */
export function findProductFieldKey(
  fields: ProductFieldMeta[],
  ...labels: string[]
): string | null {
  const normalized = labels.map((l) => l.trim().toLowerCase());
  for (const f of fields) {
    const name = ((f.name ?? f.field_name) ?? "").toString().trim().toLowerCase();
    if (!name) continue;
    if (normalized.some((n) => name.includes(n) || n.includes(name))) {
      const key = (f.key ?? f.field_key ?? (f as { code?: string }).code)?.toString();
      if (key && key.length > 10) return key;
    }
  }
  return null;
}

/** מחזיר ערך מספרי משדה מותאם במוצר */
export function getProductCustomNum(
  p: Record<string, unknown>,
  fieldKey: string | null
): number {
  if (!fieldKey) return 0;
  const v = p[fieldKey];
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") return parseInt(v, 10) || 0;
  return 0;
}

/** מחזיר ערך טקסטואלי משדה מותאם במוצר */
export function getProductCustomStr(
  p: Record<string, unknown>,
  fieldKey: string | null
): string {
  if (!fieldKey) return "";
  const v = p[fieldKey];
  if (v == null) return "";
  return String(v).trim();
}

/** מחזיר מפתח שדה "חדרים פנויים" */
export function getAvailableRoomsFieldKey(fields: ProductFieldMeta[]): string | null {
  return findProductFieldKey(fields, ...AVAILABLE_ROOMS_LABELS);
}

/** מחזיר מפתח שדה "כמות במלאי" */
export function getStockQuantityFieldKey(fields: ProductFieldMeta[]): string | null {
  return findProductFieldKey(fields, ...STOCK_QUANTITY_LABELS);
}

/** מחזיר מפתח שדה "סוג חדר" */
export function getRoomTypeFieldKey(fields: ProductFieldMeta[]): string | null {
  return findProductFieldKey(fields, ...ROOM_TYPE_LABELS);
}

/** מחזיר מפתח שדה "תאריך יציאה" */
export function getDepartureDateFieldKey(fields: ProductFieldMeta[]): string | null {
  return findProductFieldKey(fields, ...DEPARTURE_DATE_LABELS);
}

/**
 * מחזיר שנה וחודש מתאריך בשדה מותאם (לסינון לפי תאריך יציאה).
 * תומך ב-YYYY-MM-DD, timestamp, או מחרוזת תאריך שניתן לפרסור.
 */
export function getProductDateYearMonth(
  p: Record<string, unknown>,
  fieldKey: string | null
): { year: number; month: number } | null {
  if (!fieldKey) return null;
  const v = p[fieldKey];
  if (v == null) return null;
  let date: Date;
  if (typeof v === "number") {
    date = new Date(v < 1e12 ? v * 1000 : v);
  } else if (typeof v === "string") {
    const trimmed = v.trim();
    const iso = /^\d{4}-\d{2}-\d{2}/.exec(trimmed);
    if (iso) {
      date = new Date(trimmed);
    } else {
      date = new Date(trimmed);
    }
    if (Number.isNaN(date.getTime())) return null;
  } else {
    return null;
  }
  if (Number.isNaN(date.getTime())) return null;
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/**
 * מחזיר timestamp לתאריך בשדה (למיון כרונולוגי).
 * מחזיר Infinity אם אין תאריך – כדי שיישארו בסוף במיון עולה.
 */
export function getProductDateSortable(
  p: Record<string, unknown>,
  fieldKey: string | null
): number {
  if (!fieldKey) return Infinity;
  const v = p[fieldKey];
  if (v == null) return Infinity;
  let date: Date;
  if (typeof v === "number") {
    date = new Date(v < 1e12 ? v * 1000 : v);
  } else if (typeof v === "string") {
    date = new Date((v as string).trim());
  } else {
    return Infinity;
  }
  if (Number.isNaN(date.getTime())) return Infinity;
  return date.getTime();
}
