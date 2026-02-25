# העלאת WEBTARBUTU לרשת – הכל עובד מהענן

אחרי הפריסה:
- **השרת** רץ ברשת (לא אצלך במחשב).
- **לוח הניהול** זמין בכתובת: `https://הכתובת-שלך/admin`.
- **הבוט** עובד באתר תרבותו – הווידג'ט נטען מהשרת ברשת.

---

## שלב 1: העלאת הקוד ל-GitHub

1. אם עדיין לא – צור **מאגר (repository)** ב-GitHub לפרויקט WEBTARBUTU.
2. בדוק ש-**.env לא עולה** ל-Git (הוא ב-.gitignore).
3. דחוף את הקוד:
   ```bash
   cd c:\Users\user\Documents\WORK\WEBTARBUTU
   git add .
   git commit -m "WEBTARBUTU deploy"
   git remote add origin https://github.com/המשתמש-שלך/שם-המאגר.git
   git push -u origin main
   ```
   (החלף למשתמש ולשם המאגר האמיתיים.)

---

## שלב 2: יצירת שירות ב-Render

1. גלוש ל-**https://render.com** והתחבר.
2. **New** → **Web Service**.
3. **Connect** את חשבון ה-GitHub ובחר את **המאגר** של WEBTARBUTU.
4. **Branch:** `main` (או השם של הענף הראשי שלך).
5. **Name:** `webtarbutu` (או כל שם).
6. **Environment:** **Node**.
7. **Build Command:** `npm install`
8. **Start Command:** `npm start`
9. **Instance type:** Free (או Paid אם אתה רוצה שהשרת לא יירדם).

---

## שלב 3: משתני סביבה (Environment Variables)

ב-Render, במסך ה-Web Service: **Environment** → **Add Environment Variable**.

הוסף **בדיוק** את אותם משתנים שיש לך ב-.env (העתק את הערכים):

| Key | הערך (מהקובץ .env שלך) |
|-----|------------------------|
| NODE_ENV | production |
| OPENAI_API_KEY | ... |
| SUPABASE_URL | ... |
| SUPABASE_ANON_KEY | ... |
| PIPEDRIVE_API_TOKEN | ... |
| PIPEDRIVE_DOMAIN | ... |
| MONDAY_API_KEY | (אם יש) |
| MONDAY_BOARD_ID | (אם יש) |
| ALERT_EMAIL | (אם יש) |
| SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS | (אם יש) |
| AGENCY_NAME | תרבותו |
| **TWILIO_ACCOUNT_SID** | ... |
| **TWILIO_AUTH_TOKEN** | ... |
| **TWILIO_WHATSAPP_FROM** | 972... |

**חשוב:** אל תעלה את קובץ .env ל-Git. רק הזן את הערכים ב-Render. את **PORT** אל תגדיר – Render מגדיר אותו אוטומטית.

---

## שלב 4: Deploy

1. לחץ **Create Web Service** (או **Save** אם כבר יצרת).
2. Render יבנה ויעלה את הפרויקט. חכה עד ש-**Status: Live** (ירוק).
3. **כתובת השרת** תופיע בראש הדף, למשל:  
   `https://webtarbutu-xxxx.onrender.com`  
   **העתק את הכתובת** – תשתמש בה בהמשך.

---

## שלב 5: Twilio – Webhook לכתובת ברשת

1. היכנס ל-**Twilio Console** → המספר עם WhatsApp.
2. ב-**"When a message comes in"** הזן:
   ```
   https://webtarbutu-xxxx.onrender.com/webhook/twilio/whatsapp
   ```
   (החלף ל**כתובת האמיתית** מ-Render.)
3. **HTTP:** POST → **Save**.

מעכשיו הודעות וואטסאפ יגיעו לשרת ברשת והבוט יענה.

---

## שלב 6: לוח הניהול ברשת

- פתח בדפדפן:  
  **https://webtarbutu-xxxx.onrender.com/admin**  
  (אותה כתובת מ-Render + `/admin`).
- התחבר manage שיחות, לידים, השתלטות נציג – **הכל מהרשת**, בלי להריץ שום דבר אצלך בבית.

---

## שלב 7: הבוט באתר תרבותו

תן למפתח האתר את הקוד הבא, עם **כתובת השרת האמיתית** מ-Render:

```html
<script>
  window.WEBTARBUTU_API = 'https://webtarbutu-xxxx.onrender.com';
  window.WEBTARBUTU_AGENCY = 'תרבותו';
  window.WEBTARBUTU_WHATSAPP_NUMBER = '972XXXXXXXXX';
</script>
<script src="https://webtarbutu-xxxx.onrender.com/widget.js" async></script>
```

(להחליף `webtarbutu-xxxx.onrender.com` בכתובת מ-Render, ו-`972XXXXXXXXX` במספר הוואטסאפ.)

אחרי שהמפתח יוסיף את זה לאתר – הבוט יופיע באתר ויעבוד **דרך השרת ברשת**.

---

## הערות

- **Free tier ב-Render:** אחרי כמה דקות ללא גלישה השרת יכול "להירדם". הפעלה ראשונה אחרי שינה יכולה לקחת כ־30–50 שניות. אם צריך 24/7 ללא שינה – Instance type בתשלום.
- **אבטחה:** כרגע `/admin` פתוח לכל מי שיודע את הכתובת. בפרודקשן מומלץ להוסיף התחברות (סיסמה או SSO).
- **גיבוי:** ה-.env נשאר רק ב-Render (ובמחשב שלך מקומית). שמור עותק של הערכים במקום בטוח.

---

## סיכום

| מה | איפה |
|----|------|
| שרת + בוט | Render (כתובת כמו https://webtarbutu-xxx.onrender.com) |
| לוח ניהול | https://הכתובת/admin |
| וידג'ט באתר | טעינה מ-הכתובת/widget.js, API באותה כתובת |
| Twilio | Webhook מצביע לכתובת /webhook/twilio/whatsapp |

אחרי שכל השלבים בוצעו – **הכל ברשת**: ניהול המסך והבוט באתר עובדים מהענן, לא מהמחשב בבית.
