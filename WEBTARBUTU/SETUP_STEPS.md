# הוראות התקנה – צעד אחר צעד

## שלב 1: יצירת הטבלאות ב-Supabase

1. **היכנס ל-Supabase**  
   - גלוש לאתר: https://supabase.com  
   - התחבר לחשבון שלך.

2. **בחר את הפרויקט**  
   - ברשימת הפרויקטים, לחץ על הפרויקט שאליו הכנסת ב-.env את ה-`SUPABASE_URL` וה-`SUPABASE_ANON_KEY`.

3. **פתח את עורך ה-SQL**  
   - בתפריט הצד השמאלי לחץ על **SQL Editor** (או **Database** → **SQL Editor**).

4. **צור שאילתה חדשה**  
   - לחץ על **New query** (או **+ New**).

5. **העתק את כל קוד ה-SQL**  
   - פתח אצלך את הקובץ:  
     `WEBTARBUTU\database\schema.sql`  
   - בחר הכל (Ctrl+A), העתק (Ctrl+C).

6. **הדבק בעורך**  
   - הדבק (Ctrl+V) into the query box in Supabase.

7. **הרץ**  
   - לחץ על **Run** (או Ctrl+Enter).

8. **וודא שהצליח**  
   - אמור להופיע הודעה בסגנון "Success" או שהשאילתה הושלמה ללא שגיאות.  
   - אם יש שגיאה אדומה – העתק את הטקסט של השגיאה ושלח למי שמטפל בקוד.

---

## שלב 2: הרצת השרת במחשב שלך

1. **פתח טרמינל**  
   - ב-VSCode/Cursor: **Terminal** → **New Terminal**  
   - או: חלון **PowerShell** / **Command Prompt**.

2. **עבור לתיקיית הפרויקט**  
   הקלד:
   ```bash
   cd c:\Users\user\Documents\WORK\WEBTARBUTU
   ```
   (אם הפרויקט אצלך בנתיב אחר – החלף לנתיב הנכון.)

3. **התקן חבילות (פעם ראשונה)**  
   ```bash
   npm install
   ```
   חכה עד שההתקנה מסתיימת.

4. **הפעל את השרת**  
   ```bash
   npm start
   ```

5. **בדוק שהשרת רץ**  
   - אמור להופיע משהו בסגנון:
     ```
     WEBTARBUTU server running at http://localhost:3000
     Admin: http://localhost:3000/admin
     ```
   - אם מוגדר Twilio: גם שורה על "WhatsApp: Twilio API".  
   - אם לא מוגדר Twilio: ייתכן שיופיע QR לסריקה (whatsapp-web.js).

6. **בדיקה בדפדפן**  
   - פתח בדפדפן: **http://localhost:3000**  
   - אמור להופיע דף או תשובה מהשרת (למשל health).  
   - **http://localhost:3000/admin** – לוח הניהול.

אם יש שגיאה בטרמינל – העתק את כל השורות של השגיאה ושלח למי שמטפל בקוד.

---

## שלב 3: הגדרת Webhook ב-Twilio (רק אם אתה משתמש ב-Twilio לווואטסאפ)

השרת חייב להיות נגיש מהאינטרנט כדי ש-Twilio יוכל לשלוח אליו הודעות. יש שתי דרכים:

---

### אפשרות א: השרת רץ באינטרנט (Render / Railway / וכו')

1. **העלה את הפרויקט** לשרת (למשל Render) והרץ אותו שם.  
2. **קבל כתובת** לשרת, למשל: `https://webtarbutu.onrender.com`  
3. **היכנס ל-Twilio Console:**  
   https://console.twilio.com  
4. **מצא את המספר עם WhatsApp:**  
   - בתפריט: **Messaging** → **Try it out** → **Send a WhatsApp message**  
   - או: **Phone Numbers** → **Manage** → **Active numbers** – ובחר את המספר שיש לו WhatsApp.  
5. **הגדרת Webhook:**  
   - במסך של המספר (או ב-Sandbox / Sender settings), חפש שדה בסגנון:  
     **"When a message comes in"** / **"A MESSAGE COMES IN"**  
   - ב-**URL** הזן:
     ```
     https://הכתובת-של-השרת-שלך/webhook/twilio/whatsapp
     ```
     לדוגמה: `https://webtarbutu.onrender.com/webhook/twilio/whatsapp`  
   - **HTTP:** בחר **POST**.  
   - שמור (Save).

מעכשיו, כשמישהו שולח הודעה למספר ה-WhatsApp, Twilio ישלח אותה לכתובת הזו והבוט יענה.

---

### אפשרות ב: השרת רץ אצלך על המחשב (localhost) – עם ngrok

1. **הורד ngrok**  
   - גלוש ל: https://ngrok.com/download  
   - הורד והתקן (או השתמש ב-npm: `npm install -g ngrok`).

2. **הרץ את השרת** (בטרמינל אחד):
   ```bash
   cd c:\Users\user\Documents\WORK\WEBTARBUTU
   npm start
   ```
   השאר את זה פתוח.

3. **פתח טרמינל שני** והרץ:
   ```bash
   ngrok http 3000
   ```

4. **העתק את הכתובת**  
   - ב־ngrok יופיעו שורות עם כתובת בסגנון:
     ```
     Forwarding   https://abc123xyz.ngrok-free.app -> http://localhost:3000
     ```
   - העתק את החלק של **https://...ngrok...** (בלי הרווח והחץ).

5. **היכנס ל-Twilio Console** (כמו באפשרות א, שלבים 3–4).

6. **בשדה "When a message comes in"** הזן:
   ```
   https://abc123xyz.ngrok-free.app/webhook/twilio/whatsapp
   ```
   (החלף ל-URL האמיתי שקיבלת מ-ngrok.)  
   **HTTP:** POST.  
   שמור.

**חשוב:** כל פעם שסוגרים ופותחים מחדש את ngrok, הכתובת משתנה. תצטרך לעדכן את ה-URL ב-Twilio או להשתמש בחשבון ngrok עם כתובת קבועה.

---

## סיכום

| שלב | מה עושים | איפה |
|-----|----------|------|
| 1 | להריץ את קוד ה-SQL | Supabase → SQL Editor |
| 2 | `npm install` ואז `npm start` | טרמינל בתיקייה WEBTARBUTU |
| 3 | להגדיר Webhook עם הכתובת של השרת | Twilio Console (רק אם משתמשים ב-Twilio) |

אם משהו לא עובד – תעתיק את הודעת השגיאה (או תצלם מסך) ותשלח.
