@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo   הפעלה בלי Docker (רק Node.js)
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [שגיאה] Node.js לא מותקן.
    echo.
    echo הורד והתקן מ־ https://nodejs.org
    echo בחר גרסה LTS. אחרי ההתקנה הפעל מחדש ולחץ שוב על הקובץ.
    echo.
    pause
    exit /b 1
)

echo DATABASE_URL=file:./prisma/dev.db> .env.local
set DATABASE_URL=file:./prisma/dev.db
echo מסד נתונים: קובץ מקומי (SQLite) - אין צורך בהתקנה.
echo.

echo מתקין חבילות...
call npm install
if %errorlevel% neq 0 (
    echo התקנה נכשלה.
    pause
    exit /b 1
)

echo.
echo מכין מסד נתונים...
call npx prisma generate
if %errorlevel% neq 0 (
    echo [שגיאה] prisma generate נכשל.
    pause
    exit /b 1
)
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo [שגיאה] prisma migrate deploy נכשל.
    pause
    exit /b 1
)
call npx prisma db seed
if %errorlevel% neq 0 (
    echo [שגיאה] prisma db seed נכשל.
    pause
    exit /b 1
)

echo.
echo מפעיל שרת...
echo כשמופיע "Server listening" - הדפדפן ייפתח עם לינק כניסה ישירה.
echo לינק כניסה: http://localhost:3000/auth/enter
echo.
echo (לעצירה: לחץ Ctrl+C)
echo.
start /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000/auth/enter"

call npm run dev

pause
