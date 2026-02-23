# קורא את הטוקן מקובץ GIT_TOKEN.txt ומריץ git push
# הרץ: .\push-to-github.ps1

$tokenFile = Join-Path $PSScriptRoot "GIT_TOKEN.txt"
if (-not (Test-Path $tokenFile)) {
    Write-Host "לא נמצא GIT_TOKEN.txt - צור את הקובץ והדבק שם את הטוקן" -ForegroundColor Red
    exit 1
}

$token = (Get-Content -Path $tokenFile -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($token) -or $token -eq "PASTE_YOUR_TOKEN_HERE") {
    Write-Host "הדבק את הטוקן ב-GIT_TOKEN.txt (מחק את PASTE_YOUR_TOKEN_HERE והדבק את הטוקן)" -ForegroundColor Red
    exit 1
}

Set-Location $PSScriptRoot
$url = "https://tarbutu-tours:$token@github.com/tarbutu-tours/pipedrive.git"
& git remote set-url origin $url
& git push -u origin main
