# דיפלוי ל-Render – מה לעשות צעד־אחר־צעד

עקוב אחרי הרשימה הזו **לפי הסדר**. כל מה שכתוב "להעתיק" – העתק והדבק כמו שזה.

---

## שלב 0: Git במחשב

אם אין לך Git:
- הורד מהאתר: https://git-scm.com/download/win
- התקן (Next עד הסוף)
- **סגור ופתח מחדש** את Cursor / Terminal

ב-Terminal (או Git Bash) הרץ:
```bash
git --version
```
אם מופיע מספר גרסה – אפשר להמשיך.

---

## שלב 1: העלאת הקוד ל-GitHub

### 1.1 יצירת Repository ב-GitHub

1. פתח בדפדפן: **https://github.com**
2. התחבר לחשבון (או צור חשבון).
3. לחץ על **"+"** למעלה מימין → **"New repository"**.
4. **Repository name:** `pipedrive-sales-ai` (או שם אחר שאתה רוצה).
5. **Public.**
6. **אל תסמן** "Add a README file".
7. לחץ **"Create repository"**.

### 1.2 דחיפת הקוד מהמחשב

פתח **Terminal** (או Git Bash) והרץ את הפקודות האלה **אחת אחרי השנייה**.  
(החלף את `YOUR_USERNAME` ו-`YOUR_REPO` בשם המשתמש והרפו האמיתיים שלך ב-GitHub.)

```bash
cd c:\Users\user\Documents\WORK\pipedrive-sales-ai
```

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Ready for Render deploy"
```

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
```
(דוגמה: אם המשתמש `john` והרפו `pipedrive-sales-ai`, אז:  
`git remote add origin https://github.com/john/pipedrive-sales-ai.git`)

```bash
git branch -M main
```

```bash
git push -u origin main
```

אם יבקש **Username** ו-**Password**:  
- Username = שם המשתמש ב-GitHub  
- Password = **לא** סיסמת החשבון, אלא **Personal Access Token**:  
  - GitHub → Settings → Developer settings → Personal access tokens → Generate new token  
  - סמן scope כמו `repo`  
  - העתק את הטוקן והדבק כ-Password  

אחרי ש-`git push` מצליח – הקוד נמצא ב-GitHub.

---

## שלב 2: יצירת SESSION_SECRET

ב-Terminal בתיקיית הפרויקט הרץ:

```bash
npm run generate-secret
```

יופיע שורה ארוכה של תווים (למשל `a1b2c3d4e5...`). **העתק את כל השורה** – תשתמש בה בשלב 4 כ-`SESSION_SECRET`.

---

## שלב 3: Render – כניסה וחיבור GitHub

1. פתח: **https://dashboard.render.com**
2. אם אין חשבון – **Sign Up** → **Continue with GitHub** (נוח).
3. אחרי כניסה: לחץ **"New +"** (כפתור כחול) → **"Blueprint"**.
4. **Connect a repository:**  
   - אם GitHub לא מחובר: **Configure account** / **Connect GitHub** → אשר גישה.  
   - בחר את הרפו **pipedrive-sales-ai** (או השם שנתת) → **Connect**.
5. Render יזהה את `render.yaml` ויציג **Web Service** + **PostgreSQL**.  
   לחץ **"Apply"** או **"Create"** כדי ליצור את שני השירותים.

---

## שלב 4: הזנת משתני סביבה ב-Render

1. ב-Dashboard לחץ על שירות ה-**Web** (למשל **pipedrive-chat**).
2. בתפריט הצד: **Environment** (או **Environment Variables**).
3. **Add Environment Variable** / **Add Variable** והוסף **בדיוק** את אלה:

| Key | Value |
|-----|--------|
| `SESSION_SECRET` | הערך שהעתקת מ-`npm run generate-secret` |
| `PIPEDRIVE_API_TOKEN` | הטוקן מ-Pipedrive (מהדשבורד: Settings → API) |
| `PIPEDRIVE_DOMAIN` | `https://api.pipedrive.com` (או הדומיין של החברה שלך) |
| `ANTHROPIC_API_KEY` | (אופציונלי) המפתח מ-Anthropic |

**חשוב:**  
- `DATABASE_URL` **לא** מוסיפים ידנית – Render ממלא אותו אוטומטית כי הוא מחובר ל-PostgreSQL מה-Blueprint.  
- אחרי הוספת משתנים לחץ **Save Changes**.

---

## שלב 5: Deploy

1. באותו שירות (ה-Web):
   - אם יש **Manual Deploy** → **Deploy latest commit**.  
   - או פשוט **Save** אחרי שינוי Environment – Render יתחיל דיפלוי אוטומטית.
2. עבור ל-**Logs** וחכה כמה דקות.  
   - Build: `npm install`, `prisma generate`, `npm run build`  
   - Start: `prisma migrate deploy`, `prisma db seed`, `node dist/server.js`
3. כשהסטטוס **Live** (ירוק) – למעלה יופיע **URL**, למשל:  
   `https://pipedrive-chat.onrender.com`

---

## שלב 6: כניסה לאפליקציה

1. פתח את ה-URL בדפדפן.
2. משתמש ברירת מחדל (אחרי ה-seed):
   - **אימייל:** `admin@local.dev`
   - **סיסמה:** `Admin123!`
3. מומלץ מיד להחליף סיסמה או ליצור משתמש חדש.

---

## אם משהו נכשל

- **Build נכשל:** בדוק ב-**Logs** איזו פקודה נכשלה. וודא ש-`npm run build` עובר אצלך מקומית.
- **האפליקציה לא עולה:** ב-Logs וודא ש-`prisma migrate deploy` ו-`prisma db seed` רצו בלי שגיאה.
- **אין DATABASE_URL:** וודא ש-PostgreSQL נוצר מה-Blueprint וששם ה-DB הוא `pipedrive-db` כמו ב-`render.yaml`.

---

**סיכום:**  
Git → GitHub → Render Blueprint → Environment (SESSION_SECRET, PIPEDRIVE_*) → Deploy → כניסה עם `admin@local.dev` / `Admin123!`.
