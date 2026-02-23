# Push to GitHub using token from GIT_TOKEN.txt
# Run from: cd ...\pipedrive-sales-ai  then  .\push-to-github.ps1

$scriptDir = $PSScriptRoot
Set-Location $scriptDir

if (-not (Test-Path "package.json")) {
    Write-Host "Error: Run this script from pipedrive-sales-ai folder" -ForegroundColor Red
    Write-Host "cd c:\Users\user\Documents\WORK\pipedrive-sales-ai" -ForegroundColor Yellow
    exit 1
}

$tokenFile = Join-Path $scriptDir "GIT_TOKEN.txt"
if (-not (Test-Path $tokenFile)) {
    Write-Host "Error: GIT_TOKEN.txt not found. Create it and paste your token." -ForegroundColor Red
    exit 1
}

$token = (Get-Content -Path $tokenFile -Raw -Encoding UTF8).Trim()
if ([string]::IsNullOrWhiteSpace($token) -or $token -eq "PASTE_YOUR_TOKEN_HERE") {
    Write-Host "Error: Paste your GitHub token in GIT_TOKEN.txt (replace PASTE_YOUR_TOKEN_HERE)" -ForegroundColor Red
    exit 1
}

& git remote set-url origin "https://github.com/tarbutu-tours/pipedrive.git"
$urlWithToken = "https://tarbutu-tours:$token@github.com/tarbutu-tours/pipedrive.git"
& git remote set-url origin $urlWithToken
# Merge remote with local (allows unrelated histories from separate init/upload)
& git pull origin main --allow-unrelated-histories --no-edit
& git push -u origin main
