# קורא את הטוקן מקובץ GIT_TOKEN.txt ומריץ git push
# הרץ: .\push-to-github.ps1

# Look for GIT_TOKEN.txt in repo root (WORK) or in pipedrive-sales-ai
$tokenFile = Join-Path $PSScriptRoot "GIT_TOKEN.txt"
if (-not (Test-Path $tokenFile)) {
    $tokenFile = Join-Path $PSScriptRoot "pipedrive-sales-ai\GIT_TOKEN.txt"
}
if (-not (Test-Path $tokenFile)) {
    Write-Host "GIT_TOKEN.txt not found. Create it in WORK or pipedrive-sales-ai and paste your GitHub token." -ForegroundColor Red
    exit 1
}

$token = (Get-Content -Path $tokenFile -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($token) -or $token -eq "PASTE_YOUR_TOKEN_HERE") {
    Write-Host "Put your real token in GIT_TOKEN.txt (replace PASTE_YOUR_TOKEN_HERE)." -ForegroundColor Red
    exit 1
}

Set-Location $PSScriptRoot
$url = "https://tarbutu-tours:$token@github.com/tarbutu-tours/pipedrive.git"
& git remote set-url origin $url
& git push -u origin main
