"""
SENTRY-AI Remote Edge Camera Node (Sector B / Field Node)
Autonomous Edge Streamer with Auto-Reconnect, FPS Telemetry, and Health Diagnostics.
Designed for Teammate Laptop, Mobile IP Webcam, or Raspberry Pi integration.
"""

import argparse
import asyncio
import json
import logging
import platform
import sys
import threading
import time
from typing import Optional, Union

import cv2
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [EDGE-NODE] - [%(levelname)s] - %(message)s",
)
logger = logging.getLogger("CameraNode")

app = FastAPI(
    title="SENTRY-AI Remote Edge Node",
    description="Low-Latency Edge Video Streamer & Telemetry Node for SIH 2026",
    version="2.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Edge State
class EdgeNodeState:
    def __init__(self):
        self.source: Union[int, str] = 0
        self.node_id = "SECTOR-B-EDGE"
        self.status = "INITIALIZING"
        self.capture_fps = 0.0
        self.resolution = "640x480"
        self.last_frame_time = 0.0
        self.start_time = time.time()
        self.running = True
        self.latest_jpeg: Optional[bytes] = None
        self.frame_lock = threading.Lock()
        self.new_frame_event = threading.Event()

node_state = EdgeNodeState()


def open_camera(source: Union[int, str]) -> Optional[cv2.VideoCapture]:
    src = source
    if isinstance(src, str) and src.isdigit():
        src = int(src)

    try:
        if isinstance(src, int):
            if platform.system() == "Windows":
                cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
            else:
                cap = cv2.VideoCapture(src)
        else:
            cap = cv2.VideoCapture(str(src))

        if cap and cap.isOpened():
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            return cap
    except Exception as e:
        logger.warning(f"Error opening camera source '{source}': {e}")

    return None


def edge_capture_worker():
    """Background frame grabber loop with automatic reconnection."""
    cap = None
    frame_count = 0
    fps_timer = time.time()

    while node_state.running:
        if cap is None or not cap.isOpened():
            node_state.status = "RECONNECTING"
            cap = open_camera(node_state.source)
            if cap is None or not cap.isOpened():
                time.sleep(1.5)
                continue
            else:
                node_state.status = "ONLINE"
                logger.info(f"Edge Camera Node connected to source: {node_state.source}")

        success, frame = cap.read()
        if not success or frame is None or frame.size == 0:
            node_state.status = "DISCONNECTED"
            logger.warning("Frame read failed. Attempting reconnect...")
            if cap:
                cap.release()
            cap = None
            time.sleep(0.5)
            continue

        node_state.status = "ONLINE"
        node_state.last_frame_time = time.time()
        h, w = frame.shape[:2]
        node_state.resolution = f"{w}x{h}"

        # Burn lightweight timestamp overlay
        ts = time.strftime("%Y-%m-%d %H:%M:%S UTC")
        cv2.putText(frame, f"[EDGE NODE] {ts}", (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 245, 155), 1, cv2.LINE_AA)

        # Encode single-slot JPEG buffer
        ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ret:
            with node_state.frame_lock:
                node_state.latest_jpeg = buf.tobytes()
            node_state.new_frame_event.set()

        frame_count += 1
        now = time.time()
        if now - fps_timer >= 1.0:
            node_state.capture_fps = round(frame_count / (now - fps_timer), 1)
            frame_count = 0
            fps_timer = now

    if cap:
        cap.release()


@app.get("/")
def root():
    return {
        "service": "SENTRY-AI Remote Edge Node",
        "node_id": node_state.node_id,
        "status": node_state.status,
        "capture_fps": node_state.capture_fps,
        "resolution": node_state.resolution,
        "uptime": int(time.time() - node_state.start_time),
    }


@app.get("/health")
@app.get("/status")
def health():
    return {
        "status": node_state.status,
        "node_id": node_state.node_id,
        "fps": node_state.capture_fps,
        "resolution": node_state.resolution,
        "uptime_seconds": int(time.time() - node_state.start_time),
        "source": str(node_state.source),
    }


async def edge_stream_generator():
    boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
    while node_state.running:
        with node_state.frame_lock:
            jpeg = node_state.latest_jpeg
        if jpeg is not None:
            yield boundary + jpeg + b"\r\n"
        await asyncio.sleep(0.035)


@app.get("/video")
@app.get("/video_feed")
def video_feed():
    return StreamingResponse(
        edge_stream_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


def main():
    parser = argparse.ArgumentParser(description="SENTRY-AI Edge Node Streamer")
    parser.add_argument("--source", default="0", help="Camera source (0, 1, or RTSP/HTTP URL)")
    parser.add_argument("--port", type=int, default=8080, help="Port to listen on (default 8080)")
    parser.add_argument("--host", default="0.0.0.0", help="Host address (default 0.0.0.0)")
    args = parser.parse_args()

    node_state.source = int(args.source) if args.source.isdigit() else args.source
    
    # Start background capture thread
    t = threading.Thread(target=edge_capture_worker, daemon=True)
    t.start()

    logger.info(f"Starting SENTRY-AI Edge Node on http://{args.host}:{args.port}/video")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
