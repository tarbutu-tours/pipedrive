# Render – מה לבדוק אם אתה מקבל Not Found

## 0. כתובת נכונה
- השירות שלך: **https://pipedrive-k6m6.onrender.com** (לפי ה-Dashboard).
- תמיד לפתוח עם **https://** בתחילת הכתובת.

## 0א. משתני סביבה (Environment)
- **DATABASE_URL** – חובה. אם ב-Render יש רק **DATABASE_URI**, הוסף משתנה **DATABASE_URL** עם **אותו ערך** (מחרוזת החיבור ל-Postgres).  
  (הקוד תומך גם ב-DATABASE_URI כ-fallback, אבל Prisma דורש DATABASE_URL.)
- **SESSION_SECRET** – חובה (מחרוזת אקראית לס sessions).
- **PIPEDRIVE_API_TOKEN** – לפי הצורך.
- אין צורך ב-**port** (אות קטנה) – Render מגדיר **PORT** אוטומטית.

## 1. סוג השירות
- ב-Dashboard → השירות **pipedrive-chat** → **Settings**
- **Environment** צריך להיות: **Docker** (לא Node או Static Site).

## 2. Root Directory
- אם **Root Directory** ריק – Render משתמש בשורש ה-repo (ה-Dockerfile שב-WORK).
- אם **Root Directory** = `pipedrive-sales-ai` – Render נכנס רק לתיקייה הזו. אז חייב להיות **Dockerfile** בתוך `pipedrive-sales-ai` (ויש שם אחד). ה-Dockerfile שבשורש ה-repo לא ייראה.

## 3. Logs אחרי Deploy
- **Logs** (בצד שמאל) → אחרי שה-build מסתיים, מופיעות שורות כמו:
  - `Prisma schema loaded...`
  - `No pending migrations...`
  - `The seed command has been executed.`
  - `"msg":"Server listening"`
- אם יש **שגיאה אדומה** או **Exited with status 1** – האפליקציה לא עולה. תעתיק את השגיאה.

## 4. בדיקת כתובות
- **https://pipedrive-k6m6.onrender.com/health**  
  אמור להחזיר: `{"status":"ok","db":"connected"}`  
  אם גם זה Not Found – כנראה שהשירות לא רץ או ש-Root Directory/סוג שירות לא נכונים.
- **https://pipedrive-k6m6.onrender.com/**  
  (חשוב: עם **https://** בהתחלה) – אמור להציג דף כניסה.

## 5. Deploy אחרי שינוי קוד
- אחרי כל push: **Manual Deploy** → **Clear build cache & deploy**.
- חכה עד **Live** (ירוק) ואז נסה שוב את הכתובות למעלה.
