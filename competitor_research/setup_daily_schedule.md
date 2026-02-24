# הפעלה יומית בשעה 8:00 – תוצאות למייל

## 1. הגדרת מייל (חד־פעמי)

ערוך את הקובץ **`config.json`** בתיקייה `competitor_research`:

- **to** – הכתובת שלך (לשם יישלחו התוצאות).
- **smtp_user** / **smtp_password** – פרטי החשבון שממנו נשלח המייל (למשל Gmail עם "סיסמת אפליקציה").

דוגמה ל-Gmail:

- [Google] יצירת סיסמת אפליקציה: חשבון Google → אבטחה → אימות דו־שלבי → סיסמאות אפליקציה.
- ב-`config.json`:  
  `smtp_host`: `smtp.gmail.com`,  
  `smtp_port`: `587`,  
  `smtp_user`: המייל שלך ב-Gmail,  
  `smtp_password`: סיסמת האפליקציה.

## 2. הרצת סריקה ידנית + שליחת מייל

מכל מקום (לאחר שמגדירים `config.json`):

```bat
cd c:\Users\user\Documents\WORK\competitor_research
python scraper.py
```

או להריץ את הקובץ:

```bat
competitor_research\run_scan.bat
```

אחרי שהסריקה מסתיימת, המייל נשלח אוטומטית לכתובת ב-`config.json`.

## 3. סריקה אוטומטית כל יום בשעה 8:00

### אפשרות א' – יצירת משימה ב־Task Scheduler (מומלץ)

1. פתח **Task Scheduler** (תזמן משימות):
   - Win + R → `taskschd.msc` → Enter.

2. צור משימה חדשה:
   - **Create Basic Task**
   - שם: `CruiseCompetitorScan`
   - Trigger: **Daily**
   - התחלה: **8:00 AM**
   - Action: **Start a program**
   - Program:  
     `c:\Users\user\Documents\WORK\competitor_research\run_scan.bat`
   - Start in (אופציונלי):  
     `c:\Users\user\Documents\WORK\competitor_research`

3. שמור. כל יום בשעה 8:00 תרוץ הסריקה והתוצאות יישלחו למייל שהגדרת ב-`config.json`.

### אפשרות ב' – מהשורת פקודה (PowerShell as Admin)

```powershell
schtasks /create /tn "CruiseCompetitorScan" /tr "c:\Users\user\Documents\WORK\competitor_research\run_scan.bat" /sc daily /st 08:00 /ru "%USERNAME%"
```

- ביטול המשימה:
  ```powershell
  schtasks /delete /tn "CruiseCompetitorScan" /f
  ```

## 4. מה נשלח במייל

- **cruise_comparison.md** – סיכום והשוואה בעברית.
- **results.json** – נתוני הסריקה הגולמיים.

המייל נשלח **אחרי כל הרצה** של `scraper.py` (ידנית או על ידי המשימה היומית).
