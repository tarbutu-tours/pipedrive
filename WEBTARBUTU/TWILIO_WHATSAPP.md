# חיבור הבוט ל-Twilio WhatsApp

כשמשתמשים ב-**Twilio** עם המספר הרשמי הקיים, הבוט מקבל ושולח הודעות דרך ה-API. אין סריקת QR ואין מגבלת 4 מכשירים.

## 1. משתני סביבה (.env)

הוסף:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_FROM=972501234567
```

- **Account SID** ו-**Auth Token** – מ-[Twilio Console](https://console.twilio.com)
- **TWILIO_WHATSAPP_FROM** – המספר שממנו שולחים (קידומת 972 בלי 0)

## 2. הגדרת Webhook ב-Twilio

1. ב-[Twilio Console](https://console.twilio.com) → **Messaging** → **Try it out** → **Send a WhatsApp message**  
   או: **Phone Numbers** → בחר את המספר עם WhatsApp
2. תחת **A MESSAGE COMES IN** (Inbound) הגדר:
   - **Webhook URL:** `https://הכתובת-של-השרת-שלך/webhook/twilio/whatsapp`
   - Method: **POST**
3. שמור.

כשמישהו שולח הודעה למספר ה-WhatsApp, Twilio ישלח את ההודעה לכתובת הזו, והבוט יענה אוטומטית.

## 3. הרצה

```bash
npm start
```

אם Twilio מוגדר – לא יופיע QR. הבוט פעיל דרך Twilio.

## 4. הערה

- **האפליקציה הקיימת** שמשתמשת באותו מספר – אם היא רק **שולחת**, היא יכולה להמשיך. אם היא גם מקבלת webhook, צריך להחליף את כתובת ה-webhook ב-Twilio לכתובת של WEBTARBUTU (כפי שמתואר למעלה).
