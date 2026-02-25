# כפתור "צור קשר בווואטסאפ" (בלי בוט)

כפתור צף אחד – לוחצים ונפתח וואטסאפ לכתיבה למספר המשרד.  
אין בוט, אין חיבור WhatsApp Web, אין מגבלת 4 מכשירים.

## קבצים

- **whatsapp-button.js** – הסקריפט (מציג רק את הכפתור).
- **whatsapp-button-demo.html** – דף דוגמה.

## הטמעה באתר (תרבותו / כל דומיין)

בסוף ה-`<body>` של הדף, או ב-header/footer גלובלי:

```html
<script>window.WEBTARBUTU_WHATSAPP_NUMBER = '972501234567';</script>
<script src="https://הדומיין-שלכם/whatsapp-button.js" async></script>
```

- להחליף **972501234567** במספר הוואטסאפ של המשרד (קידומת מדינה 972, בלי 0 בתחילת המספר).
- **src** – אם הכפתור מוגש מאותו שרת (למשל tarbutu.co.il), להשתמש בנתיב לקובץ, למשל:  
  `https://tarbutu.co.il/whatsapp-button.js`  
  או אם משרתים מ-WEBTARBUTU:  
  `https://כתובת-השרת/widget.js` → לא; לכפתור בלבד משתמשים ב-**whatsapp-button.js** והעלאה לאתר או הגשה מאותו דומיין.

## בדיקה מקומית

להריץ `npm start` ב-WEBTARBUTU ולפתוח:

**http://localhost:3000/whatsapp-button-demo.html**

---

אחרי שזה עובד, אפשר לטפל בנפרד בבוט (וואטסאפ + וידג'ט).
