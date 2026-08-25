@echo off
set "ROOT=%~dp0"
set "BACKEND_DIR=%ROOT%backend"
set "VENV_PY=%ROOT%.venv\Scripts\python.exe"

cd /d "%BACKEND_DIR%"

if exist "%VENV_PY%" (
  "%VENV_PY%" -c "import fastapi, uvicorn" >nul 2>nul
  if errorlevel 1 (
    echo Python environment is unavailable. Falling back to Node backend...
  ) else (
    "%VENV_PY%" -m uvicorn main:app --reload
    goto :eof
  )
)

where python >nul 2>nul
if %errorlevel%==0 (
  python -m uvicorn main:app --reload
  goto :eof
)

where node >nul 2>nul
if %errorlevel%==0 (
  echo Starting Node fallback backend on port 8000...
  node server.mjs
  goto :eof
)

echo Neither Python nor Node backend runtime is available.
pause
