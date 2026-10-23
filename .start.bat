@echo off
cd /d "%~dp0"

echo ========================================
echo   Starting CLBWZZZ...
echo   Server: http://localhost:3001
echo   Client: http://localhost:5173
echo ========================================

start "CLBWZZZ SERVER" cmd /k "cd /d "%~dp0" && npm run dev:server"
start "CLBWZZZ CLIENT" cmd /k "cd /d "%~dp0" && npx vite"

exit