@echo off
cd /d "%~dp0"

echo Stopping old processes...

:: Kill Node.js on port 3001 (server)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Kill Vite on ports 5173-5179
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 :5174 :5175 :5176 :5177 :5178 :5179" ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Start Docker containers (PostgreSQL + Redis) if not running
docker compose ps --status running 2>nul | findstr "iota-place-db" >nul 2>&1
if errorlevel 1 (
    echo Starting PostgreSQL + Redis...
    docker compose up -d postgres redis
) else (
    echo PostgreSQL + Redis already running.
)

echo Starting IOTA Place...
npm run dev
