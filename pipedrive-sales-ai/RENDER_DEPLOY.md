# העלאת הצ'אט ל-Render

הפרויקט מוכן לפריסה ב-[Render](https://dashboard.render.com/). יש שתי דרכים.

---

## אופציה 1: פריסה עם Blueprint (מומלץ)

1. **דחיפה ל-Git**
   - וודא שהפרויקט ב-Git (GitHub / GitLab) ושהוא מעודכן:
   ```bash
   git add .
   git commit -m "Prepare for Render deploy"
   git push
   ```

2. **חיבור Render**
   - היכנס ל־[https://dashboard.render.com/](https://dashboard.render.com/)
   - **New +** → **Blueprint**
   - חבר את חשבון ה-Git ובחר את הרפו של הפרויקט
   - Render יזהה את `render.yaml` ויציע ליצור:
     - Web Service (האפליקציה)
     - PostgreSQL (מסד הנתונים)

3. **הזנת משתנים ב-Dashboard**
   אחרי שה-Blueprint נוצר, עבור ל-**Web Service** → **Environment** והוסף:
   - `SESSION_SECRET` – מחרוזת אקראית ארוכה (למשל סיסמה חזקה)
   - `PIPEDRIVE_API_TOKEN` – הטוקן מ־[Pipedrive API](https://app.pipedrive.com/settings/api)
   - `PIPEDRIVE_DOMAIN` – אם לא הוגדר: `https://api.pipedrive.com` או הדומיין של החברה (למשל `https://tarbutu.pipedrive.com`)
   - `ANTHROPIC_API_KEY` – (אופציונלי) אם משתמשים ב-Anthropic

4. **Deploy**
   - שמירת ה-Environment תפעיל Deploy אוטומטי
   - בסיום תקבל כתובת כמו: `https://pipedrive-chat.onrender.com`

5. **משתמש ראשון**
   - האפליקציה רצה עם PostgreSQL. אם יש seed (משתמש ברירת מחדל), הוא יורץ ב־`migrate deploy` רק אם ה-seed מוגדר. אחרת יש ליצור משתמש דרך הממשק או דרך Prisma Studio / API.

---

## אופציה 2: פריסה ידנית (בלי Blueprint)

1. **יצירת PostgreSQL**
   - Dashboard → **New +** → **PostgreSQL**
   - בחר **Free** (או תוכנית אחרת), Region (למשל Frankfurt)
   - אחרי היצירה: **Info** → העתק את **Internal Database URL**

2. **יצירת Web Service**
   - **New +** → **Web Service**
   - חבר את הרפו ובחר את הפרויקט
   - **Settings:**
     - **Build Command:** `npm install && npx prisma generate && npm run build`
     - **Start Command:** `npx prisma migrate deploy && npx prisma db seed && node dist/server.js`
     - **Instance Type:** Free (או אחר)

3. **משתני סביבה (Environment)**
   הוסף ב-**Environment**:
   - `DATABASE_URL` = ה-Internal Database URL שהעתקת
   - `NODE_ENV` = `production`
   - `SESSION_SECRET` = מחרוזת אקראית ארוכה
   - `PIPEDRIVE_API_TOKEN` = הטוקן מ-Pipedrive
   - `PIPEDRIVE_DOMAIN` = `https://api.pipedrive.com` (או דומיין החברה)
   - `ANTHROPIC_API_KEY` = (אופציונלי)

4. **Deploy**
   - **Save** → Render יריץ Build ואז Start.

---

## אם הבנייה נכשלת

- **Build:** וודא ש־`npm run build` עובר אצלך מקומית (`npm run build`).
- **Prisma:** וודא ש־`DATABASE_URL` מוגדר ושהוא חיבור Postgres תקין.
- **Start:** אם השרת לא עולה – בדוק **Logs** ב-Render. וודא ש־`npx prisma migrate deploy` הצליח (יש מיגרציה תואמת ל-PostgreSQL בתיקיית `prisma/migrations`).

---

## שינוי מ-SQLite ל-PostgreSQL מקומית

אם עד עכשיו השתמשת ב-SQLite מקומית, ה-schema עודכן ל-PostgreSQL. להרצה מקומית עם Postgres:

- התקן Postgres או השתמש ב-Docker, והגדר ב־`.env`:
  `DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DBNAME"`
- הרץ:
  ```bash
  npx prisma migrate deploy
  npm run dev
  ```
