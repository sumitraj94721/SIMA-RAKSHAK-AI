import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from app.main import app

def run_tests():
    print("=" * 60)
    print("RUNNING SENTRY-AI BACKEND HARDENING VALIDATION")
    print("=" * 60)

    with TestClient(app) as client:
        # 1. Root Endpoint
        res = client.get("/")
        assert res.status_code == 200, f"Root failed: {res.text}"
        data = res.json()
        print(f"[PASS] Root Endpoint: {data['system']} v{data['version']}")

        # 2. Health Endpoint
        res = client.get("/health")
        assert res.status_code == 200, f"Health failed: {res.text}"
        data = res.json()
        print(f"[PASS] Health Endpoint: status={data['status']}, uptime={data['uptime']}s, cams={data['cameras_online']}, cpu={data['cpu_usage']}%, mem={data['memory_usage']}%")

        # 3. System Telemetry Endpoint
        res = client.get("/api/system/status")
        assert res.status_code == 200, f"System status failed: {res.text}"
        data = res.json()
        print(f"[PASS] System Telemetry: {len(data['cameras'])} cameras registered, avg_fps={data['system']['avg_inference_fps']}")

        # 4. Cameras Endpoint
        res = client.get("/api/cameras")
        assert res.status_code == 200, f"Cameras list failed: {res.text}"
        cams = res.json()
        print(f"[PASS] Cameras List: {[c['name'] for c in cams]}")

        # 5. Camera Config Dynamic Update
        res = client.post("/api/cameras/0/config", json={"night_vision_mode": "NIGHT_VISION"})
        assert res.status_code == 200, f"Camera config failed: {res.text}"
        data = res.json()
        print(f"[PASS] Camera 0 Config Update: {data['message']}, mode={data['telemetry']['night_vision_mode']}")

        # 6. Mock SOS Dispatch
        res = client.post("/api/mock_sos?cam_id=0")
        assert res.status_code == 200, f"Mock SOS failed: {res.text}"
        data = res.json()
        print(f"[PASS] Mock SOS Dispatch: status={data['status']}, threat={data['alert']['threat']}")

        # 7. Alerts History
        res = client.get("/api/alerts")
        assert res.status_code == 200, f"Alerts history failed: {res.text}"
        alerts = res.json()
        print(f"[PASS] Alerts History: retrieved {len(alerts)} alerts, top alert threat={alerts[0]['threat']}")

        # 8. WebSocket Connection & Handshake
        with client.websocket_connect("/ws/alerts") as ws:
            handshake = ws.receive_json()
            print(f"[PASS] WebSocket Handshake: event={handshake.get('event')}, system={handshake.get('system')}")
            
            # Send Mock SOS over WS
            ws.send_json({"action": "MOCK_SOS", "cam_id": "1"})
            # Give short moment for message processing
            time.sleep(0.5)

        # 9. Legacy routes compatibility
        res = client.get("/cameras/list")
        assert res.status_code == 200, f"Legacy cameras list failed: {res.text}"
        print(f"[PASS] Legacy /cameras/list: {len(res.json())} cameras")

        res = client.get("/heatmap/")
        assert res.status_code == 200, f"Legacy heatmap failed: {res.text}"
        print(f"[PASS] Legacy /heatmap/: {len(res.json())} zones")

    print("=" * 60)
    print("ALL BACKEND VALIDATION CHECKS PASSED!")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
