@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   מפעיל את האפליקציה...
echo ========================================
echo.
cd /d "%~dp0"

where docker >nul 2>nul
if %errorlevel% neq 0 (
    echo [שגיאה] Docker לא מותקן או לא במסלול.
    echo.
    echo אפשרות 1: התקן Docker מ־ https://www.docker.com/products/docker-desktop/
    echo.
    echo אפשרות 2: הרץ בלי Docker - לחץ פעמיים על:
    echo            הפעל_בלי_Docker.bat
    echo            נדרש רק Node.js מ־ https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo מריץ Docker... חכה עד שיופיע "Server listening".
echo.
docker-compose up --build

pause
