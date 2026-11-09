@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Copy the new GitHub token first (it starts with github_pat_), then run this file.
echo.
powershell -NoProfile -Command "$t = (Get-Clipboard -Raw); if ($t) { $t = $t.Trim() }; if (-not $t -or -not $t.StartsWith('github_pat_')) { Write-Host 'The clipboard has no github_pat_ token. Copy the token and run this file again.'; exit 1 }; $t | npx.cmd wrangler secret put GITHUB_TOKEN"
echo.
pause
