/**
 * Builds the "available rooms" Excel report from Pipedrive products.
 * Used by the daily scheduled email.
 * סנכרון מלא עם צ'אט – משתמש באותה לוגיקה מ־lib/product-fields.
 */
import type { PipedriveClient } from "../pipedrive/client.js";
export declare function buildAvailableRoomsReport(pipedrive: PipedriveClient): Promise<Buffer>;
//# sourceMappingURL=available-rooms-report.d.ts.map