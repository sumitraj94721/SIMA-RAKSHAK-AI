import asyncio
from contextlib import asynccontextmanager
import json
import logging
import os
import time
from typing import Dict, List, Optional, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.pipeline import camera_manager, VisionEnhancer
from app.routes import alerts as legacy_alerts
from app.routes import auth as legacy_auth
from app.routes import cameras as legacy_cameras
from app.routes import detection as legacy_detection
from app.routes import face_detection as legacy_face_detection
from app.routes import heatmap as legacy_heatmap

# ==============================================================================
# SENTRY-AI: Tactical Border Surveillance Perimeter Engine (PS ID: SIH26187)
# Production-Hardened Real-Time Multi-Camera AI Defense Platform
# ==============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)s] - [%(name)s] - %(message)s",
)
logger = logging.getLogger("SentryAI.Server")

# Active WebSocket Connections Set & Event Loop Reference
active_connections: Set[WebSocket] = set()
connections_lock = asyncio.Lock()
server_loop: Optional[asyncio.AbstractEventLoop] = None


async def broadcast_alert(payload: dict):
    """Safely broadcasts tactical alert or telemetry packet to all connected WebSocket clients."""
    if not active_connections:
        return
    message = json.dumps(payload)
    disconnected = set()
    
    async with connections_lock:
        for ws in list(active_connections):
            try:
                await ws.send_text(message)
            except Exception:
                disconnected.add(ws)
        for dead in disconnected:
            active_connections.discard(dead)


def broadcast_alert_sync(payload: dict):
    """Thread-safe synchronous bridge for background worker threads to broadcast via event loop."""
    global server_loop
    if server_loop and server_loop.is_running():
        asyncio.run_coroutine_threadsafe(broadcast_alert(payload), server_loop)


async def heartbeat_broadcast_loop():
    """Periodically broadcasts live system telemetry heartbeats to all connected UI clients."""
    while True:
        try:
            await asyncio.sleep(1.5)
            if active_connections:
                status = camera_manager.get_system_status()
                cams = camera_manager.get_all_cameras_telemetry()
                packet = {
                    "event": "SYSTEM_HEARTBEAT",
                    "telemetry": status,
                    "cameras": cams,
                    "timestamp": time.strftime("%H:%M:%S"),
                }
                await broadcast_alert(packet)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.debug(f"Heartbeat loop exception: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global server_loop
    server_loop = asyncio.get_running_loop()
    logger.info("Initializing SENTRY-AI Multi-Camera Pipeline...")
    camera_manager.initialize(alert_broadcaster=broadcast_alert_sync)
    heartbeat_task = asyncio.create_task(heartbeat_broadcast_loop())
    logger.info("SENTRY-AI Tactical Pipeline fully operational.")
    try:
        yield
    finally:
        logger.info("Shutting down SENTRY-AI Pipeline...")
        heartbeat_task.cancel()
        camera_manager.shutdown()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Autonomous Multi-Camera Edge AI Perimeter Defense & Zero-Line Geofencing Engine",
    version=settings.VERSION,
    lifespan=lifespan,
)

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount legacy routes for full backward compatibility
app.include_router(legacy_detection.router)
app.include_router(legacy_cameras.router)
app.include_router(legacy_alerts.router)
app.include_router(legacy_heatmap.router)
app.include_router(legacy_auth.router)
app.include_router(legacy_face_detection.router)


# ==============================================================================
# REST ENDPOINTS
# ==============================================================================

@app.get("/")
def root():
    return {
        "system": settings.PROJECT_NAME,
        "ps_id": settings.PS_ID,
        "version": settings.VERSION,
        "status": "OPERATIONAL",
        "features": [
            "Bounded Low-Latency Frame Pipeline",
            "Multi-Camera Dynamic Switching & Fault Isolation",
            "CLAHE Night/Fog Vision Enhancement (Normal/Night/Auto)",
            "Persistent Multi-Target Tracking & Direction Vectors",
            "Zero-Line Boundary Crossing Geofencing",
            "Alert Deduplication & Evidence Snapshot Recorder",
            "Real-Time Telemetry & WebSocket Heartbeats",
        ],
    }


@app.get("/health")
def get_health():
    """Lightweight health check endpoint providing live uptime, cameras, and system load."""
    status = camera_manager.get_system_status()
    return {
        "status": status["status"],
        "service": "SENTRY-AI",
        "uptime": status["uptime_seconds"],
        "cameras_online": status["cameras_online"],
        "active_tracks": status["active_tracks"],
        "total_breaches": status["total_breaches"],
        "inference_fps": status["avg_inference_fps"],
        "cpu_usage": status["cpu_usage_pct"],
        "memory_usage": status["memory_usage_pct"],
        "timestamp": status["timestamp"],
    }


@app.get("/api/system/status")
def get_system_telemetry():
    """Returns detailed real-time telemetry for all cameras and system metrics."""
    return {
        "system": camera_manager.get_system_status(),
        "cameras": camera_manager.get_all_cameras_telemetry(),
        "recent_alerts": camera_manager.get_alerts_history(limit=10),
    }


@app.get("/api/cameras")
def get_cameras_telemetry():
    """Returns real-time telemetry for all configured surveillance cameras."""
    return camera_manager.get_all_cameras_telemetry()


@app.get("/api/cameras/{cam_id}")
def get_single_camera_telemetry(cam_id: str):
    """Returns telemetry for a specific camera channel."""
    worker = camera_manager.get_worker(cam_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Camera '{cam_id}' not found")
    return worker.get_telemetry()


class CameraConfigUpdate(BaseModel):
    night_vision_mode: Optional[str] = None  # NORMAL, NIGHT_VISION, AUTO
    zero_line_ratio: Optional[float] = None
    confidence_threshold: Optional[float] = None


@app.post("/api/cameras/{cam_id}/config")
def update_camera_config(cam_id: str, cfg: CameraConfigUpdate):
    """Dynamically updates runtime parameters for a specific camera feed."""
    worker = camera_manager.get_worker(cam_id)
    if not worker:
        raise HTTPException(status_code=404, detail=f"Camera '{cam_id}' not found")
    
    if cfg.night_vision_mode is not None:
        worker.night_vision_mode = cfg.night_vision_mode.upper()
    if cfg.zero_line_ratio is not None:
        worker.zero_line_ratio = max(0.2, min(0.9, float(cfg.zero_line_ratio)))
        worker.tracker.zero_line_ratio = worker.zero_line_ratio
    if cfg.confidence_threshold is not None:
        worker.confidence_threshold = max(0.1, min(0.95, float(cfg.confidence_threshold)))

    return {
        "message": f"Camera {cam_id} configuration updated",
        "telemetry": worker.get_telemetry(),
    }


@app.get("/cameras/list")
def get_cameras_list():
    """Backward-compatible camera listing endpoint."""
    return [
        {
            "id": cam["id"],
            "name": cam["name"],
            "coordinates": cam["coordinates"],
            "type": cam["type"],
            "status": cam["status"],
            "capture_fps": cam["capture_fps"],
            "inference_fps": cam["inference_fps"],
        }
        for cam in camera_manager.get_all_cameras_telemetry()
    ]


@app.get("/api/alerts")
def get_alerts_history(limit: int = 50):
    """Retrieves recent deduplicated incident alerts and breach records."""
    return camera_manager.get_alerts_history(limit=limit)


@app.get("/api/evidence/{filename}")
def get_evidence_snapshot(filename: str):
    """Streams captured breach evidence snapshot image."""
    filepath = os.path.join(settings.EVIDENCE_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Evidence snapshot not found")
    return FileResponse(filepath, media_type="image/jpeg")


# ==============================================================================
# VIDEO STREAM GENERATOR & MJPEG ENDPOINT
# ==============================================================================

async def mjpeg_stream_generator(cam_id: str):
    """Streams MJPEG frames with zero-lag bounded buffer and connection isolation."""
    worker = camera_manager.get_worker(cam_id)
    boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"

    try:
        while True:
            if worker:
                jpeg_bytes = worker.get_latest_jpeg()
                if jpeg_bytes is not None:
                    yield boundary + jpeg_bytes + b"\r\n"
            await asyncio.sleep(0.035)  # ~28-30 FPS stream rate
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.debug(f"Stream consumer disconnected for cam {cam_id}: {e}")


@app.get("/video_feed/{cam_id}")
async def video_feed(cam_id: str = "0"):
    """Streams low-latency annotated MJPEG video feed for specified camera ID."""
    return StreamingResponse(
        mjpeg_stream_generator(str(cam_id)),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ==============================================================================
# WEBSOCKET & SOS DEMO DISPATCH
# ==============================================================================

@app.websocket("/ws/alerts")
async def websocket_alerts(websocket: WebSocket):
    """Resilient WebSocket endpoint broadcasting real-time threat telemetry and heartbeats."""
    await websocket.accept()
    async with connections_lock:
        active_connections.add(websocket)
    logger.info(f"Tactical Command Client connected. Total active clients: {len(active_connections)}")

    # Send initial handshake packet
    try:
        handshake = {
            "event": "HANDSHAKE_ESTABLISHED",
            "system": settings.PROJECT_NAME,
            "status": "ONLINE",
            "telemetry": camera_manager.get_system_status(),
            "cameras": camera_manager.get_all_cameras_telemetry(),
            "timestamp": time.strftime("%H:%M:%S"),
        }
        await websocket.send_text(json.dumps(handshake))
    except Exception:
        pass

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                action = msg.get("action")
                if action == "MOCK_SOS":
                    target_cam = str(msg.get("cam_id", "0"))
                    worker = camera_manager.get_worker(target_cam)
                    sector_name = worker.name if worker else f"Sector {target_cam}"
                    mock_alert = {
                        "id": f"SOS-{int(time.time() * 1000) % 100000:05d}",
                        "cam_id": target_cam,
                        "sector": sector_name,
                        "threat": "ARMED_INTRUSION_SOS",
                        "object": "person",
                        "track_id": 99,
                        "confidence": 99.4,
                        "threat_level": "CRITICAL",
                        "event": "ZERO_LINE_BREACH",
                        "direction": "APPROACHING",
                        "zone": "RESTRICTED",
                        "geofence_breach": True,
                        "optical_expansion": True,
                        "coordinates": worker.coords if worker else "LAT 34.0836° N",
                        "timestamp": time.strftime("%H:%M:%S"),
                    }
                    camera_manager.record_and_broadcast_alert(mock_alert)
            except Exception as ex:
                logger.debug(f"WebSocket client message error: {ex}")
    except WebSocketDisconnect:
        async with connections_lock:
            active_connections.discard(websocket)
        logger.info("Tactical Command Client disconnected.")
    except Exception as e:
        async with connections_lock:
            active_connections.discard(websocket)
        logger.warning(f"WebSocket error: {e}")


@app.post("/api/mock_sos")
async def trigger_mock_sos(cam_id: str = "0"):
    """Manual trigger endpoint for mock emergency SOS dispatch demonstration."""
    worker = camera_manager.get_worker(str(cam_id))
    sector_name = worker.name if worker else f"Sector {cam_id}"
    mock_alert = {
        "id": f"SOS-{int(time.time() * 1000) % 100000:05d}",
        "cam_id": str(cam_id),
        "sector": sector_name,
        "threat": "CRITICAL_INTRUDER_SOS",
        "object": "person",
        "track_id": 99,
        "confidence": 99.8,
        "threat_level": "CRITICAL",
        "event": "ZERO_LINE_BREACH",
        "direction": "APPROACHING",
        "zone": "RESTRICTED",
        "geofence_breach": True,
        "optical_expansion": True,
        "coordinates": worker.coords if worker else "LAT 34.0836° N",
        "timestamp": time.strftime("%H:%M:%S"),
    }
    camera_manager.record_and_broadcast_alert(mock_alert)
    return {"status": "SOS_DISPATCHED", "alert": mock_alert}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

