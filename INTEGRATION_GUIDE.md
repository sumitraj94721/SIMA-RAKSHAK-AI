# 🚀 Frontend-Backend Integration Guide

## ✅ What Was Done

### 1. **Created API Service** (`frontend/src/api.ts`)
- Centralized API client with typed functions
- Base URL: `http://127.0.0.1:8000`
- Endpoints:
  - `GET /cameras/` - List all camera feeds
  - `GET /heatmap/` - Get heatmap zone data
  - `GET /detect/` - Trigger AI threat detection
  - `GET /` - Health check

### 2. **Updated Frontend** (`frontend/src/App.tsx`)
- **Data Fetching**: Calls real API endpoints instead of mock data
- **Loading States**: Shows loading indicators while fetching data
- **Error Handling**: Displays error messages if backend is unreachable
- **Dynamic Statistics**:
  - "Active Cameras" = number of cameras from API
  - "Critical Alerts" = sum of all camera alerts
  - "Suspicious Events" = average heatmap intensity across zones
- **Real-Time Updates**: Refreshes camera and heatmap data every 4 seconds
- **Smart Demo Alert**: 
  - Calls `/detect/` endpoint to get AI detection results
  - Creates alert based on detection type (None, Weapon, Intrusion)
  - Shows confidence percentage in the alert message

### 3. **Configured CORS** (`backend/app/main.py`)
- Allows requests from Vite dev server (http://localhost:5173)
- Prevents CORS errors when frontend calls backend

---

## 🚀 How to Run

### **Terminal 1: Start Backend**
```bash
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
✅ Backend runs on: `http://127.0.0.1:8000`

### **Terminal 2: Start Frontend**
```bash
cd frontend
npm run dev
```
✅ Frontend runs on: `http://localhost:5173`

### **Visit Dashboard**
Open your browser to: `http://localhost:5173`

---

## 📊 Dashboard Features

| Feature | Source | Update Interval |
|---------|--------|-----------------|
| **Active Cameras** | `/cameras/` endpoint | Every 4 seconds |
| **Critical Alerts** | Sum from camera data | Every 4 seconds |
| **Suspicious Events** | `/heatmap/` average | Every 4 seconds |
| **Live Feed Card** | First camera from `/cameras/` | Every 4 seconds |
| **Threat Score** | First camera threat score | Every 4 seconds |
| **Heatmap Zones** | `/heatmap/` endpoint | Every 4 seconds |
| **Alert Timeline** | Demo alerts + detection results | On trigger |

---

## 🎯 Demo Alert Flow

1. **Click "Trigger demo alert" button**
2. **Frontend calls** `GET /detect/` → Returns random threat + confidence
3. **Alert created** based on detection type:
   - `"None"` → Green (Normal Activity)
   - `"Weapon"` → Red (High Risk)
   - `"Intrusion"` → Yellow (Warning)
4. **Alert appears** in timeline with timestamp and confidence

---

## 📁 File Structure

```
frontend/
├── src/
│   ├── api.ts              ← NEW: API service with all endpoints
│   ├── App.tsx             ← UPDATED: Connected to real API
│   ├── main.tsx
│   └── styles.css
└── package.json

backend/
├── app/
│   ├── main.py             ← UPDATED: CORS configured
│   ├── routes/
│   │   ├── cameras.py      ← GET /cameras/ returns list
│   │   ├── heatmap.py      ← GET /heatmap/ returns zones
│   │   └── detection.py    ← GET /detect/ returns threat detection
│   └── models/
│       └── schemas.py
└── requirements.txt
```

---

## 🔧 API Endpoints Summary

### **GET /cameras/**
Returns list of camera feeds with threat data:
```json
[
  {
    "id": "cam-01",
    "label": "Entrance Lobby",
    "location": "North Wing",
    "status": "Active",
    "threatScore": 32,
    "alerts": 1
  }
]
```

### **GET /heatmap/**
Returns zone intensity data:
```json
[
  {
    "zone": "Zone A",
    "intensity": 72,
    "label": "main corridor"
  }
]
```

### **GET /detect/**
Returns threat detection result:
```json
{
  "threat": "Weapon",
  "confidence": 87
}
```

---

## 🛠️ Customization

### **Change Refresh Interval**
Edit `App.tsx` line 67:
```typescript
}, 4000);  // Change 4000ms (4 seconds) to your desired interval
```

### **Change API Base URL**
Edit `api.ts` line 1:
```typescript
const API_BASE_URL = 'http://127.0.0.1:8000';
```

### **Add More Endpoints**
1. Create new route in `backend/app/routes/`
2. Add router to `app/main.py`
3. Create API function in `frontend/src/api.ts`
4. Use in React component

---

## ⚠️ Troubleshooting

### **"Failed to connect to backend API"**
- ✅ Make sure backend is running on `http://127.0.0.1:8000`
- ✅ Check no firewall is blocking port 8000
- ✅ Verify CORS is enabled in `app/main.py`

### **No cameras/heatmap data**
- ✅ Verify `/cameras/` and `/heatmap/` endpoints return data:
  ```bash
  curl http://127.0.0.1:8000/cameras/
  curl http://127.0.0.1:8000/heatmap/
  ```

### **Alert button not working**
- ✅ Check `/detect/` endpoint works:
  ```bash
  curl http://127.0.0.1:8000/detect/
  ```

---

## 📈 What's Connected

✅ **Cameras List** → Real API data  
✅ **Heatmap Data** → Real API data  
✅ **Statistics** → Calculated from real data  
✅ **Real-Time Refresh** → Every 4 seconds  
✅ **Demo Alert Button** → Calls detection API  
✅ **Loading States** → Shows during fetch  
✅ **Error Handling** → Displays connection errors  
✅ **CORS** → Configured for localhost:5173  

---

## 🎉 Done!

Your dashboard is now **fully connected** to your FastAPI backend with real-time data updates!
