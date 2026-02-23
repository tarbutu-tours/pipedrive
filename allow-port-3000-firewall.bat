@echo off
chcp 65001 >nul
echo מוסיף חוק חומת אש כדי שמחשבים אחרים ברשת יוכלו להתחבר לפורט 3000...
netsh advfirewall firewall add rule name="Pipedrive Sales AI (port 3000)" dir=in action=allow protocol=TCP localport=3000
if %errorlevel% equ 0 (
  echo הושלם. עכשיו הרץ את השרת: pnpm run dev
  echo ואז שלח את הקישור http://[ה-IP-שלך]:3000/chat
) else (
  echo ייתכן שצריך להריץ את הקובץ כ-"מנהל" (לחיצה ימנית - הרץ כמנהל).
)
pause
