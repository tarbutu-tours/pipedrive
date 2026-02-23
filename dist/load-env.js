/**
 * חייב לרוץ לפני כל ייבוא שקורא מ־process.env (כולל config).
 * ב־ESM ה-imports רצים קודם, לכן ייבוא זה חייב להיות הראשון ב־server.ts.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config({ path: path.join(projectRoot, ".env.local"), override: true });
const dbUrl = process.env.DATABASE_URL ?? "";
if (dbUrl.startsWith("file:./") || dbUrl.startsWith("file:.")) {
    const rel = dbUrl.slice(dbUrl.indexOf("file:") + 5).replace(/^\.\/?/, "");
    process.env.DATABASE_URL = "file:" + path.join(projectRoot, rel);
}
//# sourceMappingURL=load-env.js.map