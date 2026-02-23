/**
 * Builds the "available rooms" Excel report from Pipedrive products.
 * Used by the daily scheduled email.
 * סנכרון מלא עם צ'אט – משתמש באותה לוגיקה מ־lib/product-fields.
 */

import * as XLSX from "xlsx";
import type { PipedriveClient } from "../pipedrive/client.js";
import type { Product } from "../pipedrive/client.js";
import {
  getProductCustomNum,
  getAvailableRoomsFieldKey,
  PRODUCTS_FETCH_LIMIT,
} from "../lib/product-fields.js";

export async function buildAvailableRoomsReport(pipedrive: PipedriveClient): Promise<Buffer> {
  const [fields, products] = await Promise.all([
    pipedrive.listProductFields(),
    pipedrive.listProducts(PRODUCTS_FETCH_LIMIT),
  ]);
  const availableRoomsKey = getAvailableRoomsFieldKey(fields);
  const rows = availableRoomsKey
    ? products
        .filter((p) => getProductCustomNum(p as Record<string, unknown>, availableRoomsKey) > 0)
        .map((p) => ({
          "שם": (p.name ?? "ללא שם").trim(),
          "חדרים פנויים": getProductCustomNum(p as Record<string, unknown>, availableRoomsKey),
        }))
    : products.map((p: Product) => ({
        "שם": (p.name ?? "ללא שם").trim(),
        "חדרים פנויים": 0,
      }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "חדרים פנויים");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
