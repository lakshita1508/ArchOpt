@echo off
setlocal
rem ArchOpt - start the Next.js frontend on http://localhost:3000
cd /d "%~dp0..\frontend"
if not exist node_modules (
  echo node_modules missing - running npm install...
  call npm install || (echo [ERROR] npm install failed. & exit /b 1)
)
echo Frontend: http://localhost:3000
call npm run dev
