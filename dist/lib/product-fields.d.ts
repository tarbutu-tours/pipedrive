/**
 * לוגיקה משותפת למלאי מוצרים – סנכרון מלא בין צ'אט, דוחות ואקסל.
 * כל השימושים בשדות מותאמים (חדרים פנויים, כמות במלאי) עוברים מכאן.
 */
import type { ProductFieldMeta } from "../pipedrive/client.js";
/** מכסה אחידה לשליפת מוצרים בכל המקומות (צ'אט, דוח אקסל) */
export declare const PRODUCTS_FETCH_LIMIT = 2000;
/** תוויות לשדה "חדרים פנויים" – התאמה לעברית ואנגלית */
export declare const AVAILABLE_ROOMS_LABELS: readonly ["חדרים פנויים", "Available rooms", "available rooms"];
/** תוויות לשדה "כמות במלאי" */
export declare const STOCK_QUANTITY_LABELS: readonly ["כמות במלאי", "Quantity in stock", "quantity in stock"];
/** תוויות לשדה "סוג חדר" */
export declare const ROOM_TYPE_LABELS: readonly ["סוג חדר", "Room type", "room type"];
/** תוויות לשדה "תאריך יציאה" */
export declare const DEPARTURE_DATE_LABELS: readonly ["תאריך יציאה", "Departure date", "Exit date", "exit date"];
/**
 * מחזיר את מפתח השדה (API key) לפי שם השדה ב-Pipedrive.
 * תואם לעברית ואנגלית.
 */
export declare function findProductFieldKey(fields: ProductFieldMeta[], ...labels: string[]): string | null;
/** מחזיר ערך מספרי משדה מותאם במוצר */
export declare function getProductCustomNum(p: Record<string, unknown>, fieldKey: string | null): number;
/** מחזיר ערך טקסטואלי משדה מותאם במוצר */
export declare function getProductCustomStr(p: Record<string, unknown>, fieldKey: string | null): string;
/** מחזיר מפתח שדה "חדרים פנויים" */
export declare function getAvailableRoomsFieldKey(fields: ProductFieldMeta[]): string | null;
/** מחזיר מפתח שדה "כמות במלאי" */
export declare function getStockQuantityFieldKey(fields: ProductFieldMeta[]): string | null;
/** מחזיר מפתח שדה "סוג חדר" */
export declare function getRoomTypeFieldKey(fields: ProductFieldMeta[]): string | null;
/** מחזיר מפתח שדה "תאריך יציאה" */
export declare function getDepartureDateFieldKey(fields: ProductFieldMeta[]): string | null;
/**
 * מחזיר שנה וחודש מתאריך בשדה מותאם (לסינון לפי תאריך יציאה).
 * תומך ב-YYYY-MM-DD, timestamp, או מחרוזת תאריך שניתן לפרסור.
 */
export declare function getProductDateYearMonth(p: Record<string, unknown>, fieldKey: string | null): {
    year: number;
    month: number;
} | null;
/**
 * מחזיר timestamp לתאריך בשדה (למיון כרונולוגי).
 * מחזיר Infinity אם אין תאריך – כדי שיישארו בסוף במיון עולה.
 */
export declare function getProductDateSortable(p: Record<string, unknown>, fieldKey: string | null): number;
//# sourceMappingURL=product-fields.d.ts.map