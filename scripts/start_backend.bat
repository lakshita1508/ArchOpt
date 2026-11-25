@echo off
setlocal
rem ArchOpt - start the FastAPI backend on http://127.0.0.1:8000
cd /d "%~dp0..\backend"
if not exist .venv\Scripts\python.exe (
  echo [ERROR] backend\.venv not found. Run scripts\run_archopt.bat first ^(it creates the environment^).
  exit /b 1
)
call .venv\Scripts\activate.bat
echo Backend: http://127.0.0.1:8000   API docs: http://127.0.0.1:8000/docs
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
