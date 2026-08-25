# ⚡ Quick Start Guide - Frontend-Backend Integration

## 📋 Files Modified/Created

| File | Status | Changes |
|------|--------|---------|
| `frontend/src/api.ts` | ✨ NEW | API service with typed endpoints |
| `frontend/src/App.tsx` | 📝 UPDATED | Connected to API, added loading/error states |
| `backend/app/main.py` | 📝 UPDATED | CORS configured for localhost:5173 |

---

## 🚀 Start Here (3 Steps)

### **Step 1: Start Backend (Terminal 1)**
```bash
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
**Expected Output:**
```
Uvicorn running on http://127.0.0.1:8000
Press CTRL+C to quit
```

### **Step 2: Start Frontend (Terminal 2)**
```bash
cd frontend
npm run dev
```
**Expected Output:**
```
VITE v... ready in ... ms
Local: http://localhost:5173/
```

### **Step 3: Open Dashboard**
- Click the link or visit: **http://localhost:5173/**
- You should see real camera data loading!

---

## ✅ How to Know It's Working

### **✓ Success Indicators:**
- [ ] Dashboard loads without errors
- [ ] "Active Cameras" shows 3 (from backend)
- [ ] "Critical Alerts" shows sum of camera alerts (1+3+5 = 9)
- [ ] Heatmap displays 4 zones with intensity values
- [ ] Data refreshes every 4 seconds (watch the numbers change)
- [ ] "Trigger demo alert" button works and creates new alerts
- [ ] No red error message at the top

### **✗ If Something's Wrong:**
```
Error: "Failed to connect to backend API"
→ Make sure backend is running on http://127.0.0.1:8000

Error: CORS issues in console
→ Backend CORS is already configured, check ports

No data showing up
→ Try refreshing the page (Ctrl+R)
→ Check browser console (F12) for errors
```

---

## 🔌 API Endpoints Reference

**Base URL:** `http://127.0.0.1:8000`

### **1. Get All Cameras**
```
GET /cameras/
Response: [{id, label, location, status, threatScore, alerts}, ...]
```

### **2. Get Heatmap Data**
```
GET /heatmap/
Response: [{zone, intensity, label}, ...]
```

### **3. Trigger AI Detection**
```
GET /detect/
Response: {threat: "None|Weapon|Intrusion", confidence: 50-100}
```

### **4. Health Check**
```
GET /
Response: {message: "SentriAI API is running 🚀"}
```

---

## 📊 Real-Time Data Flow

```
┌─────────────────┐
│  Frontend React │
└────────┬────────┘
         │ useEffect + setInterval (every 4 seconds)
         ▼
┌─────────────────────────┐
│  api.ts Service Layer   │
│  - getCameras()         │
│  - getHeatmap()         │
│  - triggerDetection()   │
└────────┬────────────────┘
         │ fetch('http://127.0.0.1:8000/...')
         ▼
┌───────────────────────────────┐
│  FastAPI Backend              │
│  ├─ /cameras/                 │
│  ├─ /heatmap/                 │
│  └─ /detect/                  │
└───────────────────────────────┘
```

---

## 🎨 Dashboard Components & Data Sources

| Component | Data From | Refreshes |
|-----------|-----------|-----------|
| **Active Cameras Stat** | `/cameras/` count | Every 4s |
| **Critical Alerts Stat** | Sum from `/cameras/` | Every 4s |
| **Suspicious Events Stat** | Avg of `/heatmap/` | Every 4s |
| **Live Feed Card** | First camera from `/cameras/` | Every 4s |
| **Threat Score** | `feeds[0].threatScore` | Every 4s |
| **Status Badge** | `feeds[0].status` | Every 4s |
| **Heatmap Zones** | `/heatmap/` data | Every 4s |
| **Alert Timeline** | Demo alerts + detection API | On button click |

---

## 🔧 Customization Options

### **Change Refresh Rate (every 4 seconds)**
**File:** `frontend/src/App.tsx` (Line 67)
```typescript
}, 4000);  // milliseconds: 1000=1s, 3000=3s, 5000=5s
```

### **Change API Base URL**
**File:** `frontend/src/api.ts` (Line 1)
```typescript
const API_BASE_URL = 'http://127.0.0.1:8000';
```

### **Allow Different Frontend Port**
**File:** `backend/app/main.py` (Line 12)
```python
allow_origins=[
    "http://localhost:5173",      # Vite default
    "http://127.0.0.1:5173",      # Alternative
    "http://localhost:3000",      # Express/Next.js
    # Add your URL here
],
```

---

## 🧪 Quick Tests

### **Test Backend is Running:**
```bash
curl http://127.0.0.1:8000/
```
Should return: `{"message":"SentriAI API is running 🚀"}`

### **Test Cameras Endpoint:**
```bash
curl http://127.0.0.1:8000/cameras/
```
Should return list of cameras

### **Test Detection Endpoint:**
```bash
curl http://127.0.0.1:8000/detect/
```
Should return threat detection result

### **Test from Browser Console:**
```javascript
fetch('http://127.0.0.1:8000/cameras/')
  .then(r => r.json())
  .then(data => console.log(data))
```

---

## 📚 Key Technologies

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** FastAPI + Python
- **Communication:** Fetch API + REST
- **Real-time:** setInterval polling (4 seconds)
- **State:** React hooks (useState, useEffect, useMemo)

---

## 🎉 You're All Set!

Your dashboard is now **live** and pulling real data from your backend. 

**Next Steps:**
- [ ] Verify both servers running
- [ ] Check dashboard loads data
- [ ] Test "Trigger demo alert" button
- [ ] Monitor real-time data refresh

---

## 💡 Pro Tips

✅ Use browser DevTools (F12) → Network tab to watch API calls  
✅ Check Console (F12) for any JavaScript errors  
✅ Backend logs will show all incoming requests  
✅ Both servers must be running simultaneously  
✅ Keep ports 8000 (backend) and 5173 (frontend) available  

---

**Questions? Check INTEGRATION_GUIDE.md for detailed documentation!**
