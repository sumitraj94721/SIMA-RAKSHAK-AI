# SentriAI

A hackathon-ready smart surveillance prototype for AI-powered safety and security.

## What it is
SentriAI is a polished demo of a modern security control center with live feed simulation, intelligent alert timeline, and heatmap analytics.

## Features
- Real-time camera feed dashboard UI
- Dynamic threat alert timeline
- Color-coded security status and priority badges
- Heatmap analytics for suspicious activity
- Backend API for live feed metadata and sensor-style heatmap updates

## Run locally
### Backend
1. Open a terminal in `backend`
2. Create a Python environment and install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If PowerShell prevents script activation, use the direct Python executable instead of `Activate.ps1`.

3. Start the API server:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
1. Open a terminal in `frontend`
2. Install packages (Node.js and npm are required):

```powershell
npm install
```

3. Start the UI:

```powershell
npm run dev
```

4. Open the browser at the address shown by Vite (usually `http://localhost:5173`).

## Notes
- The backend returns simulated camera feed metadata and heatmap activity.
- The frontend showcases a demo-ready security dashboard with strong visual polish.
