@echo off
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ===================================================
echo SENTRY-AI REMOTE EDGE NODE (SECTOR B STREAMER)
echo ===================================================
echo Starting Camera Node on http://0.0.0.0:8080/video ...
echo.

python camera_node.py --port 8080 --source 0
pause
