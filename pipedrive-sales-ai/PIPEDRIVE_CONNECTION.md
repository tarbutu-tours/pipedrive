# חיבור החשבון שלך ב-Pipedrive

כדי שהאפליקציה תעבוד עם **המשתמש והעסקאות שלך** ב-Pipedrive, צריך להגדיר שני ערכים בקובץ `.env`.

## שלב 1: יצירת קובץ `.env`

בתיקיית הפרויקט (ליד `package.json`):

```bash
copy .env.example .env
```

(ב-Windows. ב-Mac/Linux: `cp .env.example .env`)

## שלב 2: קבלת ה-API Token מ-Pipedrive

1. היכנס ל-**Pipedrive** עם המשתמש שלך.
2. לחץ על **הגדרות** (איקון גלגל שיניים) → **העדפות אישיות** → **API**  
   או גלוש ישירות ל: **https://app.pipedrive.com/settings/api**
3. תחת **Personal API token** – העתק את הטוקן (או צור חדש אם צריך).
4. **חשוב:** אל תשתף את הטוקן; הוא נותן גישה לנתוני החשבון שלך.

## שלב 3: מילוי הערכים ב-`.env`

פתח את הקובץ `.env` ועדכן:

```env
# הטוקן שהעתקת משלב 2
PIPEDRIVE_API_TOKEN=הטוקן_שלך_כאן

# כתובת ה-API – אפשר באחת משתי הצורות:
# א) הדומיין של החברה שלך (כמו שמופיע בדפדפן):
PIPEDRIVE_DOMAIN=https://yourcompany.pipedrive.com

# ב) או הכתובת הרשמית (לעתים קרובות עובד כך):
PIPEDRIVE_DOMAIN=https://api.pipedrive.com
```

- החלף `הטוקן_שלך_כאן` בטוקן האמיתי שהעתקת.
- אם אתה נכנס ל-Pipedrive בכתובת כמו `https://mycompany.pipedrive.com`, אפשר לשים ב-domain בדיוק את זה (עם השם של החברה שלך).
- אם לא בטוח – נסה קודם `https://api.pipedrive.com`.

## שלב 4: הפעלה מחדש

אחרי שמירת `.env`:

- אם האפליקציה רצה: עצור (Ctrl+C) והפעל שוב:
  ```bash
  npm run dev
  ```
- אם אתה משתמש ב-Docker:
  ```bash
  docker-compose down
  docker-compose up --build
  ```

מעכשיו כל הפעולות (עסקאות, הערות, פעילויות, שלבים) יבוצעו **בחשבון Pipedrive שלך** – והכתיבה רק אחרי שאתה לוחץ "אשר" בממשק.
