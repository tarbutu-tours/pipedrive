# Competitor Research – שייט מאורגן (2 חברות)

גריפה והשוואה של **מנו ספנות** ו-**קרוזתור** (בשביל הזהב).  
אחרי כל סריקה התוצאות נשלחות למייל; אפשר להגדיר סריקה אוטומטית כל יום ב-8:00.

## קבצים

- `targets.json` – רשימת כתובות ואתרים
- `scraper.py` – סקריפט גריפה (Playwright + stealth), חילוץ, השוואה ושליחת מייל
- `config.json` – כתובת לשליחת תוצאות + הגדרות SMTP (ערוך לפי config.example.json)
- `results.json` – נתונים גולמיים ומבנה חילוץ
- `cruise_comparison.md` – סיכום והשוואה בעברית
- `run_scan.bat` – הרצת הסריקה (לשימוש ידני או מתזמן)
- `setup_schedule.bat` – יצירת משימה יומית ב-8:00 (הרץ כ־Administrator)
- `setup_daily_schedule.md` – הוראות מפורטות למייל ולתזמון

## שליחת תוצאות למייל

1. העתק את `config.example.json` ל-`config.json` (או ערוך את `config.json`).
2. הזן את **המייל שלך** ב-`email.to` ואת פרטי SMTP (למשל Gmail + סיסמת אפליקציה).
3. בכל הרצה של `python scraper.py` (או `run_scan.bat`) התוצאות יישלחו אוטומטית למייל.

## סריקה כל יום בשעה 8:00

- הרץ **`setup_schedule.bat`** בלחיצה ימנית → **Run as administrator** (פעם אחת).  
  או עקוב אחרי ההוראות ב-**`setup_daily_schedule.md`**.

## הרצה (כש-Python זמין)

```bash
cd competitor_research
pip install -r requirements.txt
playwright install chromium
python scraper.py
```

אחרי ההרצה יתעדכנו `results.json` ו-`cruise_comparison.md` ויישלח מייל (אם הוגדר config.json).

## מה נחלץ

לכל חברה: מסלול/משך, מחיר זוגי/מרפסת, טיול מובטח, הנחות (הרשמה מוקדמת/רגע אחרון), כלול – טיפים, סיורי חוף, מדריך ישראלי, כשר.

## הערה

דפי הבית של מנו דורשים בחירת תאריך/משך כדי להציג רשימת הפלגות; קרוזתור מציגה קישורים לטיולים. להשוואת מחירים מלאה מומלץ להרחיב את הסקריפט לכניסה לעמודי טיול בודדים.
