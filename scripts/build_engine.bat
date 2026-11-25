@echo off
setlocal
rem ArchOpt - build the C++20 optimisation engine (MinGW-w64 g++ or MSVC, via CMake).
cd /d "%~dp0..\engine"
where cmake >nul 2>nul
if errorlevel 1 (
  echo [ERROR] CMake was not found on PATH. Install CMake from https://cmake.org/download/ and re-open this window.
  exit /b 1
)
set "GEN="
where g++ >nul 2>nul
if not errorlevel 1 (
  where mingw32-make >nul 2>nul
  if not errorlevel 1 set "GEN=MinGW Makefiles"
  where ninja >nul 2>nul
  if not errorlevel 1 set "GEN=Ninja"
)
if "%GEN%"=="" (
  where cl >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] No C++ compiler found. Install MinGW-w64 ^(g++ + mingw32-make^) or run this from a
    echo         "x64 Native Tools Command Prompt for VS" so that cl.exe is on PATH.
    exit /b 1
  )
  echo Using MSVC.
  cmake -S . -B build -DCMAKE_BUILD_TYPE=Release || goto :fail
  cmake --build build --config Release || goto :fail
) else (
  echo Using generator: %GEN%
  cmake -S . -B build -G "%GEN%" -DCMAKE_BUILD_TYPE=Release || goto :fail
  cmake --build build || goto :fail
)
if exist build\archopt_tests.exe (build\archopt_tests.exe) else if exist build\Release\archopt_tests.exe (build\Release\archopt_tests.exe)
if errorlevel 1 goto :fail
echo.
echo Engine built and C++ tests passed.
exit /b 0
:fail
echo.
echo [ERROR] Engine build or tests failed. See messages above.
exit /b 1
