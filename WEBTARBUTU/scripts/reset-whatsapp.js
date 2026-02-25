/**
 * מוחק את שמירת חיבור ה-WhatsApp ואת המטמון.
 * אחרי הרצה – הריצו npm start ומופיע QR חדש (וקובץ וורד חדש).
 */
import { rmSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const authPath = path.join(root, '.wwebjs_auth');
const cachePath = path.join(root, '.wwebjs_cache');

let deleted = false;
if (existsSync(authPath)) {
  rmSync(authPath, { recursive: true });
  console.log('נמחק: .wwebjs_auth');
  deleted = true;
}
if (existsSync(cachePath)) {
  rmSync(cachePath, { recursive: true });
  console.log('נמחק: .wwebjs_cache');
  deleted = true;
}

if (deleted) {
  console.log('\nחיבור וואטסאפ אופס. הריצו עכשיו: npm start');
  console.log('יופיע QR חדש וייווצר קובץ whatsapp-qr-document.docx');
} else {
  console.log('לא נמצאו תיקיות חיבור – הרצו npm start ויופיע QR.');
}
