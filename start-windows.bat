@echo off
REM LinguaLink Play: one-click start on Windows.
REM Double-click this file. It starts a local server and opens the browser.
cd /d "%~dp0"

echo.
echo LinguaLink Play is starting at http://localhost:8080
echo Keep this window open while playing. Close it to stop the games.
echo.

where node >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:8080"
  node server.mjs
  goto :eof
)
REM Fallback: Python also works now (the camera library is a .js file in v2).
where py >nul 2>nul
if %errorlevel%==0 ( start "" "http://localhost:8080" & py -m http.server 8080 & goto :eof )
where python >nul 2>nul
if %errorlevel%==0 ( start "" "http://localhost:8080" & python -m http.server 8080 & goto :eof )

echo Node.js (recommended) or Python is needed to run a local server.
echo Install Node.js from https://nodejs.org (LTS), then run this again.
pause
