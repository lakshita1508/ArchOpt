@echo off
setlocal
rem ArchOpt - one-click setup and launch (Windows).
set "ROOT=%~dp0.."
cd /d "%ROOT%"

echo === ArchOpt: checking prerequisites ===
set "PY=python"
where python >nul 2>nul || (where py >nul 2>nul && set "PY=py -3")
%PY% --version >nul 2>nul || (echo [ERROR] Python 3.10+ not found. Install from https://www.python.org/downloads/ ^(tick "Add to PATH"^). & exit /b 1)
where node >nul 2>nul || (echo [ERROR] Node.js 18+ not found. Install from https://nodejs.org/ & exit /b 1)
where npm  >nul 2>nul || (echo [ERROR] npm not found. Reinstall Node.js. & exit /b 1)
%PY% --version
node --version

echo.
echo === Backend environment ===
if not exist backend\.venv\Scripts\python.exe (
  %PY% -m venv backend\.venv || (echo [ERROR] Could not create virtual environment. & exit /b 1)
)
call backend\.venv\Scripts\activate.bat
python -m pip install --upgrade pip >nul
python -m pip install -r backend\requirements.txt || (echo [ERROR] pip install failed. Check your internet connection. & exit /b 1)

echo.
echo === C++ engine ===
set "ENGINE_OK="
if exist engine\build\archopt_engine.exe set "ENGINE_OK=1"
if exist engine\build\Release\archopt_engine.exe set "ENGINE_OK=1"
if not defined ENGINE_OK (
  echo Engine not built yet - building now.
  call scripts\build_engine.bat
  if errorlevel 1 (
    echo.
    echo [ERROR] The C++ engine could not be built, so LIVE optimisation will be unavailable.
    echo         Install CMake + MinGW-w64 ^(or Visual Studio Build Tools^) and run scripts\build_engine.bat.
    echo         The app can still start in DEMO mode ^(sample projects only^).
    choice /m "Continue in demo mode anyway"
    if errorlevel 2 exit /b 1
  )
) else (
  echo Engine found.
)

echo.
echo === Frontend dependencies ===
if not exist frontend\node_modules (
  pushd frontend
  call npm install || (popd & echo [ERROR] npm install failed. & exit /b 1)
  popd
)

echo.
echo === Database ===
pushd backend
python -c "from app.database.session import init_db; init_db(); print('Database ready: backend/archopt.db')" || (popd & echo [ERROR] Database initialisation failed. & exit /b 1)
popd

echo.
echo === Starting servers in separate windows ===
start "ArchOpt Backend"  cmd /k "%ROOT%\scripts\start_backend.bat"
start "ArchOpt Frontend" cmd /k "%ROOT%\scripts\start_frontend.bat"
echo.
echo Open http://localhost:3000   Login: vikramgupta / 12345678
timeout /t 8 >nul
start http://localhost:3000
endlocal
