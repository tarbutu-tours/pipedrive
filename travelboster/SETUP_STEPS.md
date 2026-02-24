# צעד־אחר־צעד: מה להשלים כדי שהאגנט יעבוד

## שלב 1: הרצה ראשונית של הפרויקט

1. פתח טרמינל בתיקיית הפרויקט.
2. הרץ:
   ```bash
   cd travelboster
   npm install
   ```
3. וודא שאין שגיאות. אחר כך:
   ```bash
   npm run build
   npm start
   ```
4. בדפדפן גלוש ל־`http://localhost:3000/health` – אמור להופיע `{"status":"ok","service":"travelboster-agent"}`.
5. עצור את השרת (Ctrl+C) – נמשיך להגדרות.

---

## שלב 2: קובץ `.env` (משתני סביבה)

1. בתיקייה `travelboster` הרץ (יוצר `.env` אוטומטית אם חסר):
   ```bash
   npm run prepare-env
   ```
   או העתק ידנית: `copy .env.example .env` (Windows) / `cp .env.example .env` (Mac/Linux).
2. פתח את `.env` בעורך.
3. **מלא את הערכים הבאים** (בלי סוגריים):

   | משתנה | מאיפה לקחת | דוגמה |
   |--------|-------------|--------|
   | `PIPEDRIVE_API_TOKEN` | Pipedrive → Settings → Personal preferences → API | מחרוזת ארוכה |
   | `TB_CLIENT_ID` | TravelBooster – פרטי האפליקציה / Developer portal | מחרוזת |
   | `TB_CLIENT_SECRET` | אותו מקום ב־TravelBooster | מחרוזת |

4. **TB_REDIRECT_URI** – חייב להיות **בדיוק** כמו שרשמת ב־TravelBooster:
   - לפיתוח מקומי: `http://localhost:3000/tb/callback`
   - לשרת באינטרנט: `https://הדומיין-שלך.com/tb/callback`
5. שמור את הקובץ.  
   אחרי שמירת הטוקן של Pipedrive:
   - **בדיקת טוקן:** פתח **GET http://localhost:3000/pipedrive/test** – אם הטוקן תקין תקבל `{"ok":true,"message":"Pipedrive token is valid"}`.
   - **בדיקת שדות:** פתח **GET http://localhost:3000/pipedrive/fields-check** – יוצג אילו שדות נדרשים (דיל + אדם) קיימים ב־Pipedrive ואילו חסרים; אם שדה קיים אבל עם מפתח API אחר, יוצג המפתח להגדרה ב־.env.

---

## שלב 3: Pipedrive – שדות מותאמים (Custom fields)

1. היכנס ל־Pipedrive → **Settings** ( גלגל שיניים).
2. **Deal fields** (שדות לדילים):
   - וודא שיש שדות עם השמות (או דומים) והסוגים:
     - Selected Tour Code (טקסט)
     - Departure Date (תאריך)
     - Variant (טקסט/רשימה)
     - Total Price (מספר/כסף)
     - Currency (טקסט/רשימה)
     - **TravelFile Approval Status** – רשימה: Pending, Approved, Cancelled
     - **TravelFile System Status** – רשימה: Not Sent, Creating, Created, Failed
     - **TravelBooster Booking ID** – טקסט
     - **TravelFile Number** – טקסט
     - **TravelBooster Error Message** – טקסט ארוך
   - אם אין – צור אותם. **רשם את ה־API key** של כל שדה (במסך העריכה של השדה).
3. **Person fields** (שדות לאנשים/נוסעים):
   - וודא שיש:
     - **ID/Passport** (או Passport Number) – טקסט
     - **Date of Birth** – תאריך
   - רשם את ה־API keys.
4. אם ה־API keys ב־Pipedrive שונים מהברירת מחדל, אפשר להגדיר ב־`.env` משתנים אופציונליים, למשל:
   - `PIPEDRIVE_DEAL_FIELD_SELECTED_TOUR_CODE=המפתח_אצלך`
   - `PIPEDRIVE_PERSON_FIELD_ID_PASSPORT=המפתח_אצלך`
   רשימה מלאה מופיעה ב־`.env.example` (בסוף הקובץ).

---

## שלב 4: Webhook ב־Pipedrive

1. ב־Pipedrive: **Settings** → **Integrations** → **Webhooks**  
   (או Developer Hub → Webhooks – תלוי בגרסה).
2. **הוסף Webhook**.
3. **Subscription**: בחר אירוע שמעדכן דיל – בדרך כלל **"Deal – updated"** או **"deal.updated"**.
4. **Endpoint URL**:
   - **אם השרת רץ רק אצלך במחשב:**  
     השתמש ב־ngrok (או דומה):
     - התקן ngrok, הרץ: `ngrok http 3000`
     - העתק את ה־URL שניתן (למשל `https://xxxx.ngrok.io`)
     - ה־URL ל־webhook: `https://xxxx.ngrok.io/webhooks/pipedrive`
   - **אם השרת על שרת באינטרנט:**  
     `https://הדומיין-שלך/webhooks/pipedrive`
5. שמור. Pipedrive אמור לשלוח בדיקה; אם יש שגיאה – בדוק שה־URL נגיש מהאינטרנט.

---

## שלב 5: TravelBooster – OAuth (פעם אחת)

1. הפעל את השרת:
   ```bash
   npm start
   ```
2. בדפדפן גלוש ל־:
   ```
   http://localhost:3000/tb/auth
   ```
   (אם אתה על שרת: `https://הדומיין-שלך/tb/auth`)
3. תועבר ל־TravelBooster להתחברות – התחבר עם המשתמש שאיתו רשומה האפליקציה.
4. אחרי האישור תועבר חזרה ל־`/tb/callback` ותראה הודעה שהטוקן נשמר.
5. הטוקן נשמר ב־`travelboster/src/store/tb-token.json`. מהרגע הזה האגנט יכול לקרוא ל־TravelBooster. אם הטוקן יפוג – תצטרך לחזור על שלב 5.

---

## שלב 6: בדיקה קצרה

1. ב־Pipedrive: צור דיל טסט (או השתמש בדיל קיים).
2. מלא את השדות: Tour Code, Departure Date, Variant, Total Price, Currency.
3. הוסף **משתתף** (Participant) – person עם **ID/Passport** ו־**Date of Birth**.
4. סמן את הדיל כ־**WON**.
5. בדוק:
   - נוצרה פעילות "Approve TravelBooster TravelFile".
   - שדה **TravelFile Approval Status** על **Pending**.
6. שנה את **TravelFile Approval Status** ל־**Approved**.
7. (אם יש webhook) האגנט ירוץ; אחרי כמה שניות בדוק:
   - **TravelFile System Status** = Created
   - **TravelBooster Booking ID** ו־**TravelFile Number** מולאים.
   - קובץ `travelboster/src/store/audit.json` מכיל רשומה חדשה.

אם משהו לא עובד – בדוק:
- לוגים בטרמינל של השרת.
- ב־Pipedrive: שהשדות קיימים ושהערכים לא ריקים.
- ש־OAuth ל־TravelBooster בוצע (שלב 5) וש־tb-token.json קיים.

---

## קישורים שימושיים

- **Pipedrive – API Token:**  
  https://app.pipedrive.com/settings/api (או: Settings → Personal preferences → API)
- **Pipedrive – Webhooks:**  
  https://app.pipedrive.com/settings/webhooks (או: Settings → Integrations → Webhooks)
- **בדיקת מוכנות (בלי לחשוף סיסמאות):**  
  אחרי `npm start` – פתח בדפדפן: http://localhost:3000/setup  
  יוצג אם חסר טוקן Pipedrive, פרטי TB, או טוקן TravelBooster.

---

## סיכום – רשימת וי

- [ ] `npm install` ו־`npm run build` עוברים
- [ ] `npm run prepare-env` (או העתקת `.env.example` ל־`.env`)
- [ ] קובץ `.env` מלא: PIPEDRIVE_API_TOKEN, TB_CLIENT_ID, TB_CLIENT_SECRET, TB_REDIRECT_URI
- [ ] GET /setup מציג ready: true אחרי מילוי .env + OAuth
- [ ] שדות הדיל והאדם קיימים ב־Pipedrive (כולל Approval Status, System Status, Booking ID, TravelFile Number, Error Message)
- [ ] Webhook רשום ומצביע ל־`/webhooks/pipedrive` עם URL נגיש מהאינטרנט
- [ ] OAuth ל־TravelBooster בוצע פעם אחת (`/tb/auth` → התחברות → callback)
- [ ] בדיקה עם דיל WON + Approved והמשתתפים ממולאים
