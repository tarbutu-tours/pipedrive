@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ========================================
echo   בדיקה - איפה זה נכשל
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [שגיאה] Node.js לא מותקן. התקן מ־ https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node: 
node -v
echo.

echo DATABASE_URL=file:./prisma/dev.db> .env.local

echo --- שלב 1: npm install ---
call npm install
if %errorlevel% neq 0 (
    echo [נכשל] npm install
    pause
    exit /b 1
)
echo [OK] התקנה הסתיימה.
echo.
pause

echo --- שלב 2: prisma generate ---
call npx prisma generate
if %errorlevel% neq 0 (
    echo [נכשל] prisma generate
    pause
    exit /b 1
)
echo [OK]
echo.
pause

echo --- שלב 3: prisma migrate deploy ---
call npx prisma migrate deploy
if %errorlevel% neq 0 (
    echo [נכשל] prisma migrate deploy
    pause
    exit /b 1
)
echo [OK]
echo.
pause

echo --- שלב 4: prisma db seed ---
call npx prisma db seed
if %errorlevel% neq 0 (
    echo [נכשל] prisma db seed
    pause
    exit /b 1
)
echo [OK]
echo.
pause

echo --- שלב 5: npm run dev (השרת) ---
echo אם מופיע "Server listening" - הצלחנו. אם יש שגיאה - העתק אותה.
echo.
call npm run dev

pause
