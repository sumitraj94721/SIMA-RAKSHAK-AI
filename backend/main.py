import asyncio
import json
import logging
import math
import time
from typing import Dict, List, Set, Tuple, Union

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from ultralytics import YOLO

# ==============================================================================
# SENTRY-AI: Tactical Border Surveillance Perimeter Engine (PS ID: SIH26187)
# Multi-Camera CCTV Switching & Real-Time Tactical AI Geofencing Engine
# ==============================================================================

logging.basicConfig(level=logging.INFO, format="%(asctime)s - [%(levelname)s] - %(message)s")
logger = logging.getLogger("SentryAI")

app = FastAPI(
    title="SentryAI Tactical Border Surveillance",
    description="Multi-Camera Tactical AI Perimeter Defense & Zero-Line Geofencing Engine",
    version="2.1.0",
)

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load YOLOv8 model
try:
    model = YOLO("yolov8n.pt")
    logger.info("YOLOv8 model initialized.")
except Exception as e:
    logger.warning(f"Error loading YOLOv8 model locally: {e}. Model will auto-download.")
    model = YOLO("yolov8n.pt")

# ==============================================================================
# MULTI-CAMERA REGISTRY
# ==============================================================================

CAMERA_FEEDS: Dict[str, Dict[str, Union[int, str]]] = {
    "0": {
        "id": "0",
        "source": 0,
        "name": "Sector A (Command Post Webcam)",
        "coordinates": "LAT 34.0836° N / LON 74.7973° E",
        "type": "OPTICAL_SURVEILLANCE",
    },
    "1": {
        "id": "1",
        "source": "http://192.168.1.50:8080/video",
        "name": "Sector B (Perimeter Buffer Node / Phone IP)",
        "coordinates": "LAT 34.0912° N / LON 74.8021° E",
        "type": "BUFFER_ZONE_IR",
    },
}

# ==============================================================================
# WEBSOCKET CONNECTION MANAGER & ALERT STATE
# ==============================================================================

active_connections: Set[WebSocket] = set()
tracked_targets: Dict[str, Dict] = {}

TARGET_CLASSES = {
    0: "person",
    1: "bicycle",
    2: "car",
    3: "motorcycle",
    5: "bus",
    7: "truck",
    24: "backpack",
    26: "handbag",
    28: "suitcase",
    43: "knife",
    76: "scissors",
}

WEAPON_CLASSES = {"knife", "scissors"}
VEHICLE_CLASSES = {"car", "truck", "bus", "motorcycle"}


async def broadcast_alert(alert_payload: dict):
    """Broadcasts tactical threat telemetry to all active WebSocket clients."""
    if not active_connections:
        return
    message = json.dumps(alert_payload)
    disconnected = set()
    for connection in active_connections:
        try:
            await connection.send_text(message)
        except Exception:
            disconnected.add(connection)
    for dead in disconnected:
        active_connections.discard(dead)


# ==============================================================================
# VISION PROCESSING & NIGHT-VISION CLAHE FILTER
# ==============================================================================

def apply_clahe(frame: np.ndarray) -> np.ndarray:
    """Applies Contrast Limited Adaptive Histogram Equalization (CLAHE) for low-light/fog penetration."""
    try:
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        cl = clahe.apply(l_channel)
        merged = cv2.merge((cl, a_channel, b_channel))
        return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
    except Exception:
        return frame


def draw_tactical_hud(
    frame: np.ndarray,
    zero_line_y: int,
    breach_active: bool,
    cam_id: str,
    sector_name: str,
    coords: str,
) -> np.ndarray:
    """Draws tactical border military HUD, Zero-Line boundary, and status telemetry."""
    h, w = frame.shape[:2]

    # Draw Zero Line (Virtual Polygon Geofence)
    line_color = (0, 0, 255) if breach_active else (0, 140, 255)
    cv2.line(frame, (0, zero_line_y), (w, zero_line_y), line_color, 2)

    # Boundary warning markers
    for x in range(0, w, 32):
        cv2.circle(frame, (x, zero_line_y), 3, (0, 0, 255) if breach_active else (0, 220, 255), -1)

    # Zero Line Tag Badge
    tag_text = "ZERO LINE // RESTRICTED ZONE" if not breach_active else "!!! ZERO LINE BREACH ACTIVE !!!"
    cv2.rectangle(frame, (10, zero_line_y - 25), (330, zero_line_y - 5), (10, 15, 30), -1)
    cv2.putText(
        frame,
        tag_text,
        (15, zero_line_y - 10),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (0, 0, 255) if breach_active else (0, 220, 255),
        1,
        cv2.LINE_AA,
    )

    # Top Tactical Header Banner
    cv2.rectangle(frame, (0, 0), (w, 36), (10, 15, 29), -1)
    cv2.line(frame, (0, 36), (w, 36), (0, 255, 180), 1)

    hud_title = f"CAM-{cam_id} // {sector_name.upper()} [CLAHE NIGHT-VISION]"
    cv2.putText(
        frame,
        hud_title,
        (15, 23),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (0, 255, 180),
        1,
        cv2.LINE_AA,
    )

    timestamp = time.strftime("%Y-%m-%d %H:%M:%S UTC")
    cv2.putText(
        frame,
        f"{coords} | {timestamp}",
        (max(15, w - 460), 23),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.4,
        (180, 200, 220),
        1,
        cv2.LINE_AA,
    )

    # Corner brackets (Tactical reticle)
    reticle_len = 20
    for corner in [(12, 46), (w - 12, 46), (12, h - 12), (w - 12, h - 12)]:
        cx, cy = corner
        dx = 1 if cx == 12 else -1
        dy = 1 if cy == 46 else -1
        cv2.line(frame, (cx, cy), (cx + dx * reticle_len, cy), (0, 255, 180), 1)
        cv2.line(frame, (cx, cy), (cx, cy + dy * reticle_len), (0, 255, 180), 1)

    return frame


def process_detections(
    frame: np.ndarray,
    clahe_frame: np.ndarray,
    zero_line_y: int,
    cam_id: str,
    sector_name: str,
    loop: asyncio.AbstractEventLoop,
) -> Tuple[np.ndarray, bool]:
    """Runs YOLOv8 perimeter inference, optical expansion check, and geofence tracking for specific cam."""
    global tracked_targets

    results = model(clahe_frame, verbose=False, conf=0.30)
    current_time = time.time()
    breach_in_frame = False

    for r in results:
        boxes = r.boxes
        if boxes is None:
            continue

        for box in boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            xyxy = box.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = map(int, xyxy)
            w = max(1, x2 - x1)
            h = max(1, y2 - y1)
            area = float(w * h)
            center_x = (x1 + x2) // 2
            center_y = (y1 + y2) // 2

            class_name = TARGET_CLASSES.get(cls_id, model.names.get(cls_id, "unknown"))

            is_weapon = class_name in WEAPON_CLASSES
            is_person = class_name == "person"
            is_vehicle = class_name in VEHICLE_CLASSES
            is_luggage = class_name in {"backpack", "handbag", "suitcase"}

            if not (is_weapon or is_person or is_vehicle or is_luggage):
                continue

            # Geofence breach check (Zero-Line Boundary Crossing)
            geofence_breach = y2 >= zero_line_y or center_y >= zero_line_y
            if geofence_breach:
                breach_in_frame = True

            # Unique spatial key per cam
            grid_x = center_x // 60
            grid_y = center_y // 60
            target_key = f"cam{cam_id}_{class_name}_{grid_x}_{grid_y}"

            if target_key not in tracked_targets:
                tracked_targets[target_key] = {
                    "count": 1,
                    "last_area": area,
                    "last_seen": current_time,
                    "alerted": False,
                    "rapid_expansion": False,
                }
            else:
                target_data = tracked_targets[target_key]
                target_data["count"] += 1
                target_data["last_seen"] = current_time

                # Optical Expansion Check
                prev_area = target_data.get("last_area", area)
                if prev_area > 0:
                    area_growth = (area - prev_area) / prev_area
                    if area_growth > 0.18 and target_data["count"] >= 2:
                        target_data["rapid_expansion"] = True
                target_data["last_area"] = area

            target_state = tracked_targets[target_key]
            persistence_count = target_state["count"]
            rapid_expansion = target_state.get("rapid_expansion", False)

            # Determine Threat Level
            if is_weapon or geofence_breach or (rapid_expansion and (is_person or is_vehicle)):
                threat_level = "CRITICAL"
            else:
                threat_level = "WARNING"

            # Draw Tactical Bounding Box
            color = (0, 0, 255) if threat_level == "CRITICAL" else (0, 220, 255)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

            corner_len = min(15, w // 4, h // 4)
            cv2.line(frame, (x1, y1), (x1 + corner_len, y1), (255, 255, 255), 2)
            cv2.line(frame, (x1, y1), (x1, y1 + corner_len), (255, 255, 255), 2)
            cv2.line(frame, (x2, y2), (x2 - corner_len, y2), (255, 255, 255), 2)
            cv2.line(frame, (x2, y2), (x2, y2 - corner_len), (255, 255, 255), 2)

            # Telemetry label
            label = f"{class_name.upper()} {int(conf * 100)}% [{threat_level}]"
            if rapid_expansion:
                label += " [APPROACHING]"
            if geofence_breach:
                label += " [ZERO-LINE BREACH]"

            (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.44, 1)
            cv2.rectangle(frame, (x1, max(36, y1 - 20)), (x1 + lw + 8, max(36, y1)), (15, 20, 35), -1)
            cv2.putText(
                frame,
                label,
                (x1 + 4, max(36, y1 - 6)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                color,
                1,
                cv2.LINE_AA,
            )

            # Broadcast verified threat telemetry tagged with active cam_id & sector
            if persistence_count >= 3 and not target_state["alerted"]:
                target_state["alerted"] = True
                alert_payload = {
                    "cam_id": str(cam_id),
                    "sector": sector_name,
                    "threat": class_name.upper(),
                    "confidence": round(conf * 100, 1),
                    "threat_level": threat_level,
                    "geofence_breach": bool(geofence_breach),
                    "optical_expansion": bool(rapid_expansion),
                    "timestamp": time.strftime("%H:%M:%S"),
                }
                asyncio.run_coroutine_threadsafe(broadcast_alert(alert_payload), loop)

    # Prune stale tracks
    stale_keys = [k for k, v in tracked_targets.items() if current_time - v["last_seen"] > 2.5]
    for k in stale_keys:
        del tracked_targets[k]

    return frame, breach_in_frame


def generate_synthetic_border_frame(sim_step: int, cam_id: str, width: int = 640, height: int = 480) -> np.ndarray:
    """Generates synthetic tactical night-vision border feed when physical/IP camera is unavailable."""
    frame = np.zeros((height, width, 3), dtype=np.uint8)
    cam_offset = int(cam_id) if cam_id.isdigit() else 0

    # Synthetic terrain background
    for y in range(height):
        intensity = int(16 + 26 * (y / height))
        tint = (intensity // 2, intensity + (cam_offset * 10), intensity // 3)
        frame[y, :] = tint

    # Border wire simulation
    zero_line_y = int(height * 0.6)
    cv2.line(frame, (0, zero_line_y + 10), (width, zero_line_y + 10), (35, 45, 55), 1)

    # Target entity simulation
    cycle = ((sim_step + cam_offset * 60) % 240) / 240.0
    person_x = int(120 + 380 * math.sin(cycle * math.pi + cam_offset))
    person_y = int(zero_line_y - 75 + 120 * cycle)
    scale = 0.5 + 0.8 * cycle

    pw, ph = int(30 * scale), int(70 * scale)
    px1, py1 = max(0, person_x - pw // 2), max(0, person_y - ph)
    px2, py2 = min(width - 1, px1 + pw), min(height - 1, py1 + ph)

    cv2.ellipse(frame, (person_x, py1 + int(ph * 0.2)), (int(pw * 0.3), int(ph * 0.15)), 0, 0, 360, (60, 180, 70), -1)
    cv2.rectangle(frame, (px1 + 4, py1 + int(ph * 0.35)), (px2 - 4, py2), (50, 160, 60), -1)

    # Realistic sensor noise
    noise = np.random.normal(0, 6, frame.shape).astype(np.int16)
    frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    return frame


def video_stream_generator(cam_id: str):
    """Streams MJPEG video feed for requested cam_id with CLAHE enhancement & YOLOv8 detections."""
    loop = asyncio.get_event_loop()
    cam_info = CAMERA_FEEDS.get(
        str(cam_id),
        {
            "id": str(cam_id),
            "source": int(cam_id) if cam_id.isdigit() else str(cam_id),
            "name": f"Sector {cam_id} (Perimeter Stream)",
            "coordinates": "LAT 34.0836° N / LON 74.7973° E",
        },
    )

    cam_source = cam_info.get("source", 0)
    sector_name = cam_info.get("name", f"Sector {cam_id}")
    coords = cam_info.get("coordinates", "LAT 34.0836° N / LON 74.7973° E")

    cap = None
    use_synthetic = False

    try:
        if isinstance(cam_source, int) or (isinstance(cam_source, str) and cam_source.isdigit()):
            cap = cv2.VideoCapture(int(cam_source))
        else:
            cap = cv2.VideoCapture(str(cam_source))

        if not cap or not cap.isOpened():
            logger.warning(f"Camera {cam_id} source '{cam_source}' unavailable. Using Synthetic Simulator.")
            use_synthetic = True
    except Exception as e:
        logger.warning(f"Failed to open camera {cam_id}: {e}. Using Synthetic Simulator.")
        use_synthetic = True

    sim_step = 0

    try:
        while True:
            sim_step += 1
            if not use_synthetic and cap is not None and cap.isOpened():
                success, frame = cap.read()
                if not success:
                    frame = generate_synthetic_border_frame(sim_step, cam_id)
            else:
                frame = generate_synthetic_border_frame(sim_step, cam_id)
                time.sleep(0.04)

            h, w = frame.shape[:2]
            zero_line_y = int(h * 0.6)

            # 1. CLAHE Contrast & Low-Light Enhancement
            clahe_enhanced = apply_clahe(frame)

            # 2. YOLOv8 Detections & Zero-Line Geofence Tracking
            annotated_frame, breach_active = process_detections(
                frame, clahe_enhanced, zero_line_y, cam_id, sector_name, loop
            )

            # 3. Tactical Military HUD Overlay
            tactical_frame = draw_tactical_hud(
                annotated_frame, zero_line_y, breach_active, cam_id, sector_name, coords
            )

            # 4. MJPEG Encoding
            ret, buffer = cv2.imencode(".jpg", tactical_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ret:
                continue

            frame_bytes = buffer.tobytes()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
            )
    finally:
        if cap is not None:
            cap.release()


# ==============================================================================
# REST & WEBSOCKET ENDPOINTS
# ==============================================================================

@app.get("/")
def root():
    return {
        "system": "SENTRY-AI Tactical Border Surveillance Perimeter Engine",
        "ps_id": "SIH26187",
        "status": "OPERATIONAL",
        "features": [
            "Multi-Camera Dynamic Switching",
            "CLAHE Night/Fog Vision Enhancement",
            "Zero-Line Virtual Geofencing",
            "Optical Expansion Trajectory Check",
            "Real-time WebSocket Threat Telemetry",
        ],
    }


@app.get("/cameras/list")
def get_cameras_list():
    """Returns the list of configured surveillance cameras and sectors."""
    return [
        {
            "id": k,
            "name": v.get("name", f"Camera {k}"),
            "coordinates": v.get("coordinates", "LAT 34.0836° N / LON 74.7973° E"),
            "type": v.get("type", "SURVEILLANCE"),
        }
        for k, v in CAMERA_FEEDS.items()
    ]


@app.get("/video_feed/{cam_id}")
async def video_feed(cam_id: str = "0"):
    """Streams annotated MJPEG video feed for the specified camera ID."""
    return StreamingResponse(
        video_stream_generator(str(cam_id)),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """WebSocket endpoint broadcasting real-time threat telemetry tagged with active cam_id."""
    await websocket.accept()
    active_connections.add(websocket)
    logger.info(f"Tactical Command Client connected. Total active clients: {len(active_connections)}")

    # Initial handshake telemetry
    try:
        await websocket.send_text(
            json.dumps({
                "cam_id": "0",
                "sector": "Sector A (Command Post Webcam)",
                "threat": "PERIMETER_MONITOR_ONLINE",
                "confidence": 100.0,
                "threat_level": "WARNING",
                "geofence_breach": False,
                "timestamp": time.strftime("%H:%M:%S"),
            })
        )
    except Exception:
        pass

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                if msg.get("action") == "MOCK_SOS":
                    target_cam = str(msg.get("cam_id", "0"))
                    sector_name = CAMERA_FEEDS.get(target_cam, {}).get("name", "Sector A (Command Post Webcam)")
                    mock_alert = {
                        "cam_id": target_cam,
                        "sector": sector_name,
                        "threat": "ARMED_INTRUSION_SOS",
                        "confidence": 98.6,
                        "threat_level": "CRITICAL",
                        "geofence_breach": True,
                        "optical_expansion": True,
                        "timestamp": time.strftime("%H:%M:%S"),
                    }
                    await broadcast_alert(mock_alert)
            except Exception:
                pass
    except WebSocketDisconnect:
        active_connections.discard(websocket)
        logger.info("Tactical Command Client disconnected.")
    except Exception as e:
        active_connections.discard(websocket)
        logger.warning(f"WebSocket connection error: {e}")


@app.post("/api/mock_sos")
async def trigger_mock_sos(cam_id: str = "0"):
    """Manual trigger endpoint for mock emergency SOS dispatch demonstration."""
    sector_name = CAMERA_FEEDS.get(str(cam_id), {}).get("name", "Sector A (Command Post Webcam)")
    mock_alert = {
        "cam_id": str(cam_id),
        "sector": sector_name,
        "threat": "CRITICAL_INTRUDER_SOS",
        "confidence": 99.4,
        "threat_level": "CRITICAL",
        "geofence_breach": True,
        "optical_expansion": True,
        "timestamp": time.strftime("%H:%M:%S"),
    }
    await broadcast_alert(mock_alert)
    return {"status": "SOS_DISPATCHED", "alert": mock_alert}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)