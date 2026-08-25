import asyncio
from collections import deque
import json
import logging
import math
import os
import platform
import threading
import time
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import cv2
import numpy as np
import psutil
from ultralytics import YOLO

from app.core.config import settings

logger = logging.getLogger("SentryAI.Pipeline")

# ==============================================================================
# TARGET CLASSIFICATION DEFINITIONS
# ==============================================================================
TARGET_CLASSES: Dict[int, str] = {
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
LUGGAGE_CLASSES = {"backpack", "handbag", "suitcase"}


# ==============================================================================
# VISION ENHANCER (CLAHE NIGHT VISION & ADAPTIVE LUMINANCE)
# ==============================================================================
class VisionEnhancer:
    """Provides optimized CLAHE low-light/fog enhancement with NORMAL, NIGHT_VISION, and AUTO modes."""

    @staticmethod
    def apply_clahe(frame: np.ndarray, clip_limit: float = 3.0, tile_grid_size: Tuple[int, int] = (8, 8)) -> np.ndarray:
        try:
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
            l_chan, a_chan, b_chan = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
            cl = clahe.apply(l_chan)
            merged = cv2.merge((cl, a_chan, b_chan))
            return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
        except Exception as e:
            logger.debug(f"CLAHE execution error: {e}")
            return frame

    @classmethod
    def enhance(cls, frame: np.ndarray, mode: str = "AUTO") -> Tuple[np.ndarray, bool]:
        """Returns (enhanced_frame, is_clahe_applied)."""
        mode = (mode or "AUTO").upper()
        if mode == "NORMAL":
            return frame, False
        elif mode == "NIGHT_VISION":
            return cls.apply_clahe(frame), True
        elif mode == "AUTO":
            # Sample center crop for speed
            h, w = frame.shape[:2]
            sample = frame[h // 4 : 3 * h // 4, w // 4 : 3 * w // 4]
            if sample.size == 0:
                sample = frame
            gray = cv2.cvtColor(sample, cv2.COLOR_BGR2GRAY)
            mean_lum = float(np.mean(gray))
            if mean_lum < 85.0:  # Low-light detected
                return cls.apply_clahe(frame), True
            return frame, False
        return frame, False


# ==============================================================================
# EVIDENCE RECORDER (SNAPSHOT STORAGE)
# ==============================================================================
class EvidenceRecorder:
    """Records high-resolution JPEG breach snapshots to disk with metadata index."""

    def __init__(self, evidence_dir: str = settings.EVIDENCE_DIR):
        self.evidence_dir = evidence_dir
        os.makedirs(self.evidence_dir, exist_ok=True)

    def save_snapshot(self, alert_id: str, frame: np.ndarray, metadata: dict) -> Optional[str]:
        try:
            filename = f"{alert_id}.jpg"
            filepath = os.path.join(self.evidence_dir, filename)
            cv2.imwrite(filepath, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            
            meta_path = os.path.join(self.evidence_dir, f"{alert_id}.json")
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)
            
            return f"/api/evidence/{filename}"
        except Exception as e:
            logger.error(f"Failed to record breach snapshot: {e}")
            return None


# ==============================================================================
# PERSISTENT TRACKED TARGET & PERIMETER TRACKER
# ==============================================================================
class TrackedTarget:
    """Maintains continuous target state, centroid history, velocity, and zone transitions."""

    def __init__(self, track_id: int, class_name: str, confidence: float, bbox: Tuple[int, int, int, int]):
        self.track_id = track_id
        self.class_name = class_name
        self.confidence = confidence
        self.bbox = bbox  # (x1, y1, x2, y2)
        
        x1, y1, x2, y2 = bbox
        self.centroid = ((x1 + x2) // 2, (y1 + y2) // 2)
        self.previous_centroid = self.centroid
        
        self.history: deque = deque(maxlen=16)
        self.history.append(self.centroid)
        
        now = time.time()
        self.first_seen = now
        self.last_seen = now
        self.frame_count = 1
        
        self.direction = "STATIONARY"
        self.speed = 0.0  # px / sec
        
        w, h = max(1, x2 - x1), max(1, y2 - y1)
        self.initial_area = float(w * h)
        self.last_area = float(w * h)
        self.rapid_expansion = False
        
        self.zone = "SAFE"
        self.previous_zone = "SAFE"
        self.breach_active = False
        self.breached_once = False
        self.last_alert_time = 0.0

    def update(self, bbox: Tuple[int, int, int, int], confidence: float, class_name: str):
        now = time.time()
        dt = max(0.001, now - self.last_seen)
        self.last_seen = now
        self.frame_count += 1
        self.confidence = confidence
        self.class_name = class_name
        self.bbox = bbox
        
        x1, y1, x2, y2 = bbox
        new_centroid = ((x1 + x2) // 2, (y1 + y2) // 2)
        self.previous_centroid = self.centroid
        self.centroid = new_centroid
        self.history.append(new_centroid)
        
        # Calculate velocity and direction
        dx = self.centroid[0] - self.previous_centroid[0]
        dy = self.centroid[1] - self.previous_centroid[1]
        dist = math.hypot(dx, dy)
        self.speed = dist / dt
        
        if dist < 2.0:
            self.direction = "STATIONARY"
        elif abs(dy) > abs(dx) * 1.2:
            self.direction = "APPROACHING" if dy > 0 else "RECEDING"
        elif abs(dx) > abs(dy) * 1.2:
            self.direction = "LATERAL_EAST" if dx > 0 else "LATERAL_WEST"
        else:
            self.direction = "DIAGONAL"
            
        # Optical expansion check (approaching target area growth)
        w, h = max(1, x2 - x1), max(1, y2 - y1)
        current_area = float(w * h)
        if self.last_area > 0:
            growth = (current_area - self.last_area) / self.last_area
            if growth > 0.15 and self.frame_count >= 3:
                self.rapid_expansion = True
        self.last_area = current_area


class PerimeterTracker:
    """Handles multi-target association, Zero-Line boundary crossing, and debounced alerts."""

    def __init__(self, cam_id: str, sector_name: str, coords: str, evidence_recorder: EvidenceRecorder):
        self.cam_id = str(cam_id)
        self.sector_name = sector_name
        self.coords = coords
        self.evidence_recorder = evidence_recorder
        
        self.tracks: Dict[int, TrackedTarget] = {}
        self.next_track_id = 1
        self.alert_callback: Optional[Callable[[dict], None]] = None
        self.zero_line_ratio = 0.60
        self.lock = threading.Lock()
        self.alert_counter = 100

    def set_alert_callback(self, cb: Callable[[dict], None]):
        self.alert_callback = cb

    def _generate_alert_id(self) -> str:
        self.alert_counter += 1
        return f"ALT-{self.alert_counter:05d}"

    def update_detections(
        self,
        raw_detections: List[Dict[str, Any]],
        frame_shape: Tuple[int, int],
        annotated_frame: np.ndarray,
    ) -> Tuple[List[TrackedTarget], bool]:
        """Associates detections, computes Zero-Line crossing, and triggers deduplicated alerts."""
        height, width = frame_shape[:2]
        zero_line_y = int(height * self.zero_line_ratio)
        warning_line_y = zero_line_y - int(height * 0.14)
        
        current_time = time.time()
        breach_in_frame = False

        with self.lock:
            # Match detections to existing tracks using centroid distance / IoU
            unmatched_dets = []
            used_track_ids = set()

            for det in raw_detections:
                bbox = det["bbox"]
                conf = det["conf"]
                cls_name = det["class_name"]
                yolo_id = det.get("track_id")
                
                matched = False
                # If YOLO provided persistent ID, prioritize it
                if yolo_id is not None and yolo_id in self.tracks:
                    self.tracks[yolo_id].update(bbox, conf, cls_name)
                    used_track_ids.add(yolo_id)
                    matched = True
                else:
                    # Spatial centroid matching fallback
                    cx = (bbox[0] + bbox[2]) // 2
                    cy = (bbox[1] + bbox[3]) // 2
                    best_id = None
                    min_dist = 85.0  # max match threshold in pixels
                    
                    for tid, trk in self.tracks.items():
                        if tid in used_track_ids:
                            continue
                        dist = math.hypot(cx - trk.centroid[0], cy - trk.centroid[1])
                        if dist < min_dist:
                            min_dist = dist
                            best_id = tid
                            
                    if best_id is not None:
                        self.tracks[best_id].update(bbox, conf, cls_name)
                        used_track_ids.add(best_id)
                        matched = True

                if not matched:
                    unmatched_dets.append(det)

            # Register new tracks
            for det in unmatched_dets:
                tid = det.get("track_id")
                if tid is None or tid in self.tracks:
                    tid = self.next_track_id
                    self.next_track_id += 1
                new_track = TrackedTarget(tid, det["class_name"], det["conf"], det["bbox"])
                self.tracks[tid] = new_track
                used_track_ids.add(tid)

            # Evaluate zones and Zero-Line crossings
            active_tracks = []
            for tid, trk in list(self.tracks.items()):
                # Prune stale
                if current_time - trk.last_seen > 2.0:
                    del self.tracks[tid]
                    continue

                active_tracks.append(trk)
                
                # Zone determination based on centroid & bottom boundary
                cy = trk.centroid[1]
                bottom_y = trk.bbox[3]
                
                trk.previous_zone = trk.zone
                if bottom_y >= zero_line_y or cy >= zero_line_y:
                    trk.zone = "RESTRICTED"
                    trk.breach_active = True
                    breach_in_frame = True
                elif cy >= warning_line_y:
                    trk.zone = "WARNING"
                    trk.breach_active = False
                else:
                    trk.zone = "SAFE"
                    trk.breach_active = False

                # Check for state transition & breach event
                is_crossing = (trk.previous_zone != "RESTRICTED" and trk.zone == "RESTRICTED") or (
                    trk.zone == "RESTRICTED" and not trk.breached_once
                )
                
                is_weapon = trk.class_name in WEAPON_CLASSES
                is_approaching_warning = trk.zone == "WARNING" and trk.rapid_expansion
                
                time_since_last_alert = current_time - trk.last_alert_time
                should_alert = False
                severity = "INFO"
                event_name = "PERIMETER_MONITOR"
                
                if is_crossing or is_weapon:
                    severity = "CRITICAL"
                    event_name = "ZERO_LINE_BREACH" if is_crossing else "WEAPON_DETECTED"
                    if time_since_last_alert > settings.ALERT_COOLDOWN_SEC or not trk.breached_once:
                        should_alert = True
                        trk.breached_once = True
                elif is_approaching_warning or trk.zone == "WARNING":
                    severity = "HIGH" if is_approaching_warning else "MEDIUM"
                    event_name = "WARNING_ZONE_INTRUSION"
                    if time_since_last_alert > (settings.ALERT_COOLDOWN_SEC * 1.5):
                        should_alert = True
                elif trk.frame_count == 3 and not trk.breached_once:
                    severity = "LOW"
                    event_name = "TARGET_IDENTIFIED"
                    if time_since_last_alert > settings.ALERT_COOLDOWN_SEC:
                        should_alert = True

                if should_alert and trk.frame_count >= 2:
                    trk.last_alert_time = current_time
                    alert_id = self._generate_alert_id()
                    
                    alert_payload = {
                        "id": alert_id,
                        "cam_id": self.cam_id,
                        "sector": self.sector_name,
                        "threat": f"{trk.class_name.upper()} #{trk.track_id:03d}",
                        "object": trk.class_name,
                        "track_id": trk.track_id,
                        "confidence": round(trk.confidence * 100, 1),
                        "threat_level": severity,
                        "event": event_name,
                        "direction": trk.direction,
                        "zone": trk.zone,
                        "geofence_breach": trk.zone == "RESTRICTED",
                        "optical_expansion": trk.rapid_expansion,
                        "coordinates": self.coords,
                        "timestamp": time.strftime("%H:%M:%S"),
                    }
                    
                    # Capture snapshot for critical events
                    if severity in {"CRITICAL", "HIGH"} and annotated_frame is not None:
                        snapshot_uri = self.evidence_recorder.save_snapshot(alert_id, annotated_frame, alert_payload)
                        alert_payload["evidence_snapshot"] = snapshot_uri

                    if self.alert_callback:
                        self.alert_callback(alert_payload)

            return active_tracks, breach_in_frame


# ==============================================================================
# CAMERA WORKER & BOUNDED LATEST-FRAME PIPELINE
# ==============================================================================
class CameraWorker:
    """Independent background worker for a single camera feed with bounded frame buffer and auto-reconnect."""

    def __init__(
        self,
        cam_id: str,
        source: Union[int, str],
        name: str,
        coords: str,
        cam_type: str = "OPTICAL_SURVEILLANCE",
        yolo_model: Optional[YOLO] = None,
        evidence_recorder: Optional[EvidenceRecorder] = None,
    ):
        self.cam_id = str(cam_id)
        self.source = source
        self.name = name
        self.coords = coords
        self.cam_type = cam_type
        self.yolo_model = yolo_model
        self.evidence_recorder = evidence_recorder or EvidenceRecorder()

        self.status = "CONNECTING"  # ONLINE, DEGRADED, RECONNECTING, OFFLINE
        self.night_vision_mode = settings.NIGHT_VISION_DEFAULT
        self.zero_line_ratio = 0.60
        self.confidence_threshold = settings.YOLO_CONFIDENCE

        self.tracker = PerimeterTracker(self.cam_id, self.name, self.coords, self.evidence_recorder)
        
        # Telemetry stats
        self.capture_fps = 0.0
        self.inference_fps = 0.0
        self.inference_latency_ms = 0.0
        self.dropped_frames = 0
        self.active_tracks_count = 0
        self.breach_count = 0
        self.last_frame_timestamp = 0.0
        self.resolution = "640x480"

        # Bounded frame buffer (size 1) - Low Latency Guarantee
        self._latest_raw_frame: Optional[np.ndarray] = None
        self._latest_annotated_frame: Optional[np.ndarray] = None
        self._latest_jpeg: Optional[bytes] = None
        self._frame_lock = threading.Lock()
        self._new_frame_event = threading.Event()

        self._running = False
        self._capture_thread: Optional[threading.Thread] = None
        self._inference_thread: Optional[threading.Thread] = None
        self._sim_step = 0

    def start(self):
        self._running = True
        self._capture_thread = threading.Thread(target=self._capture_loop, name=f"CapWorker-{self.cam_id}", daemon=True)
        self._inference_thread = threading.Thread(target=self._inference_loop, name=f"InferWorker-{self.cam_id}", daemon=True)
        self._capture_thread.start()
        self._inference_thread.start()
        logger.info(f"CameraWorker {self.cam_id} ({self.name}) started.")

    def stop(self):
        self._running = False
        self._new_frame_event.set()
        logger.info(f"CameraWorker {self.cam_id} stopping...")

    def set_alert_callback(self, cb: Callable[[dict], None]):
        def wrapped_cb(payload: dict):
            if payload.get("geofence_breach"):
                self.breach_count += 1
            if cb:
                cb(payload)
        self.tracker.set_alert_callback(wrapped_cb)

    def _open_capture(self) -> Optional[cv2.VideoCapture]:
        cap = None
        src = self.source
        
        # Convert numeric string to int if applicable
        if isinstance(src, str) and src.isdigit():
            src = int(src)

        try:
            if isinstance(src, int):
                # Try DirectShow on Windows, then standard backend fallback
                if platform.system() == "Windows":
                    cap = cv2.VideoCapture(src, cv2.CAP_DSHOW)
                    if not cap.isOpened():
                        cap.release()
                        cap = cv2.VideoCapture(src)
                else:
                    cap = cv2.VideoCapture(src)
            else:
                cap = cv2.VideoCapture(str(src))

            if cap and cap.isOpened():
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                return cap
        except Exception as e:
            logger.debug(f"Could not open camera {self.cam_id} ({src}): {e}")

        if cap is not None:
            cap.release()
        return None


    def _capture_loop(self):
        """Thread 1: Ultra-fast capture loop updating bounded raw frame buffer."""
        cap = None
        consecutive_failures = 0
        frame_counter = 0
        fps_start = time.time()

        while self._running:
            if cap is None or not cap.isOpened():
                self.status = "RECONNECTING"
                cap = self._open_capture()
                if cap is None or not cap.isOpened():
                    consecutive_failures += 1
                    # Generate synthetic tactical frame during disconnect
                    self._sim_step += 1
                    synthetic = self._generate_synthetic_frame(self._sim_step)
                    with self._frame_lock:
                        self._latest_raw_frame = synthetic
                    self._new_frame_event.set()
                    time.sleep(1.5 if consecutive_failures > 3 else 0.5)
                    continue
                else:
                    consecutive_failures = 0
                    self.status = "ONLINE"
                    logger.info(f"Camera {self.cam_id} successfully connected to source: {self.source}")

            success, frame = cap.read()
            if not success or frame is None or frame.size == 0:
                consecutive_failures += 1
                if consecutive_failures > 5:
                    logger.warning(f"Camera {self.cam_id} stream lost. Reconnecting...")
                    if cap:
                        cap.release()
                    cap = None
                time.sleep(0.05)
                continue

            consecutive_failures = 0
            self.status = "ONLINE"
            self.last_frame_timestamp = time.time()
            h, w = frame.shape[:2]
            self.resolution = f"{w}x{h}"

            # Put into single-slot buffer (drop stale frames automatically)
            with self._frame_lock:
                self._latest_raw_frame = frame
            self._new_frame_event.set()

            frame_counter += 1
            now = time.time()
            if now - fps_start >= 1.0:
                self.capture_fps = round(frame_counter / (now - fps_start), 1)
                frame_counter = 0
                fps_start = now

        if cap:
            cap.release()

    def _inference_loop(self):
        """Thread 2: Real-time inference, vision enhancement, tracking, and tactical HUD generation."""
        frame_counter = 0
        fps_start = time.time()

        while self._running:
            self._new_frame_event.wait(timeout=0.2)
            self._new_frame_event.clear()

            with self._frame_lock:
                if self._latest_raw_frame is None:
                    continue
                frame = self._latest_raw_frame.copy()

            t_start = time.time()
            h, w = frame.shape[:2]
            zero_line_y = int(h * self.zero_line_ratio)

            # 1. Vision Enhancement (CLAHE Night-Vision / Auto)
            enhanced_frame, is_clahe = VisionEnhancer.enhance(frame, self.night_vision_mode)

            # 2. YOLOv8 Object Detection & Persistent Tracking
            raw_detections = []
            if self.yolo_model is not None:
                try:
                    # Run YOLOv8 detection
                    results = self.yolo_model(enhanced_frame, verbose=False, conf=self.confidence_threshold)
                    for r in results:
                        boxes = r.boxes
                        if boxes is None:
                            continue
                        for box in boxes:
                            cls_id = int(box.cls[0].item())
                            conf = float(box.conf[0].item())
                            xyxy = box.xyxy[0].cpu().numpy()
                            x1, y1, x2, y2 = map(int, xyxy)
                            cls_name = TARGET_CLASSES.get(cls_id, self.yolo_model.names.get(cls_id, "unknown"))
                            
                            # Filter surveillance targets
                            if cls_name in TARGET_CLASSES.values():
                                raw_detections.append({
                                    "bbox": (x1, y1, x2, y2),
                                    "conf": conf,
                                    "class_name": cls_name,
                                    "track_id": int(box.id[0].item()) if box.id is not None else None,
                                })
                except Exception as e:
                    logger.debug(f"Inference error on cam {self.cam_id}: {e}")

            # 3. Perimeter Tracking & Zero-Line Geofencing
            active_tracks, breach_active = self.tracker.update_detections(
                raw_detections, frame.shape, frame
            )
            self.active_tracks_count = len(active_tracks)

            # 4. Render Tactical Military HUD & Overlays
            annotated = self._draw_tactical_hud(
                frame, active_tracks, zero_line_y, breach_active, is_clahe
            )

            # 5. JPEG Encoding for MJPEG Stream
            ret, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if ret:
                jpeg_bytes = buffer.tobytes()
                with self._frame_lock:
                    self._latest_annotated_frame = annotated
                    self._latest_jpeg = jpeg_bytes

            # Telemetry metrics
            t_end = time.time()
            self.inference_latency_ms = round((t_end - t_start) * 1000, 1)

            frame_counter += 1
            if t_end - fps_start >= 1.0:
                self.inference_fps = round(frame_counter / (t_end - fps_start), 1)
                frame_counter = 0
                fps_start = t_end

    def _draw_tactical_hud(
        self,
        frame: np.ndarray,
        tracks: List[TrackedTarget],
        zero_line_y: int,
        breach_active: bool,
        is_clahe: bool,
    ) -> np.ndarray:
        """Renders military-grade tactical HUD overlay, Zero-Line, zones, bounding boxes, and telemetry."""
        h, w = frame.shape[:2]
        warning_line_y = zero_line_y - int(h * 0.14)

        # Warning Zone Boundary Line
        cv2.line(frame, (0, warning_line_y), (w, warning_line_y), (0, 180, 255), 1, cv2.LINE_AA)
        for x in range(0, w, 40):
            cv2.circle(frame, (x, warning_line_y), 2, (0, 180, 255), -1)

        # Zero-Line Boundary
        line_color = (0, 0, 255) if breach_active else (0, 140, 255)
        cv2.line(frame, (0, zero_line_y), (w, zero_line_y), line_color, 2, cv2.LINE_AA)
        for x in range(0, w, 30):
            cv2.circle(frame, (x, zero_line_y), 3, (0, 0, 255) if breach_active else (0, 220, 255), -1)

        # Zero-Line Badge
        badge_text = "!!! ZERO LINE BREACH ACTIVE !!!" if breach_active else "ZERO LINE // GEOFENCE RESTRICTED"
        badge_bg = (0, 0, 160) if breach_active else (10, 15, 30)
        cv2.rectangle(frame, (10, zero_line_y - 24), (320, zero_line_y - 4), badge_bg, -1)
        cv2.putText(
            frame,
            badge_text,
            (14, zero_line_y - 9),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (0, 0, 255) if breach_active else (0, 220, 255),
            1,
            cv2.LINE_AA,
        )

        # Render Tracked Targets
        for trk in tracks:
            x1, y1, x2, y2 = trk.bbox
            is_breached = trk.zone == "RESTRICTED"
            is_warn = trk.zone == "WARNING"
            
            box_color = (0, 0, 255) if is_breached else ((0, 180, 255) if is_warn else (0, 245, 155))
            
            # Bounding box & tactical corner brackets
            cv2.rectangle(frame, (x1, y1), (x2, y2), box_color, 2)
            corner = min(14, max(4, (x2 - x1) // 4))
            cv2.line(frame, (x1, y1), (x1 + corner, y1), (255, 255, 255), 2)
            cv2.line(frame, (x1, y1), (x1, y1 + corner), (255, 255, 255), 2)
            cv2.line(frame, (x2, y2), (x2 - corner, y2), (255, 255, 255), 2)
            cv2.line(frame, (x2, y2), (x2, y2 - corner), (255, 255, 255), 2)

            # Centroid & Trajectory Movement Trail
            cv2.circle(frame, trk.centroid, 4, box_color, -1)
            pts = list(trk.history)
            for i in range(1, len(pts)):
                thickness = max(1, int(i * 1.5 / len(pts)))
                cv2.line(frame, pts[i - 1], pts[i], box_color, thickness, cv2.LINE_AA)

            # Target Label
            label = f"{trk.class_name.upper()} #{trk.track_id:03d} {int(trk.confidence * 100)}%"
            if is_breached:
                label += " [BREACH]"
            elif is_warn:
                label += " [WARN]"
            if trk.rapid_expansion:
                label += " [APPROACHING]"

            (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
            cv2.rectangle(frame, (x1, max(38, y1 - 20)), (x1 + lw + 6, max(38, y1)), (10, 15, 28), -1)
            cv2.putText(frame, label, (x1 + 3, max(38, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.40, box_color, 1, cv2.LINE_AA)

        # Top Tactical Military Header Banner
        cv2.rectangle(frame, (0, 0), (w, 36), (10, 15, 29), -1)
        cv2.line(frame, (0, 36), (w, 36), (0, 245, 155), 1)

        nv_str = "CLAHE NIGHT-VISION: ON" if is_clahe else f"VISION: {self.night_vision_mode}"
        hud_left = f"CAM-{self.cam_id} // {self.name.upper()} [{nv_str}]"
        cv2.putText(frame, hud_left, (14, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (0, 245, 155), 1, cv2.LINE_AA)

        time_str = time.strftime("%Y-%m-%d %H:%M:%S UTC")
        hud_right = f"{self.coords} | {time_str}"
        cv2.putText(frame, hud_right, (max(14, w - 480), 23), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (180, 200, 220), 1, cv2.LINE_AA)

        # Corner Reticles
        ret_len = 18
        for cx, cy in [(12, 46), (w - 12, 46), (12, h - 12), (w - 12, h - 12)]:
            dx = 1 if cx == 12 else -1
            dy = 1 if cy == 46 else -1
            cv2.line(frame, (cx, cy), (cx + dx * ret_len, cy), (0, 245, 155), 1)
            cv2.line(frame, (cx, cy), (cx, cy + dy * ret_len), (0, 245, 155), 1)

        # State indicator watermark if not ONLINE
        if self.status != "ONLINE":
            status_tag = f"SENSOR NODE [{self.status}] - RECONNECTING..."
            cv2.rectangle(frame, (w // 2 - 180, h // 2 - 20), (w // 2 + 180, h // 2 + 20), (10, 15, 30), -1)
            cv2.putText(frame, status_tag, (w // 2 - 165, h // 2 + 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 180, 255), 1, cv2.LINE_AA)

        return frame

    def _generate_synthetic_frame(self, step: int, width: int = 640, height: int = 480) -> np.ndarray:
        """Generates synthetic tactical night-vision border feed when camera is reconnecting."""
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        cam_offset = int(self.cam_id) if self.cam_id.isdigit() else 0

        # Terrain gradient
        for y in range(height):
            intensity = int(14 + 24 * (y / height))
            frame[y, :] = (intensity // 2, intensity + cam_offset * 6, intensity // 3)

        # Border wire
        zero_line_y = int(height * self.zero_line_ratio)
        cv2.line(frame, (0, zero_line_y + 8), (width, zero_line_y + 8), (35, 45, 55), 1)

        # Target simulation moving across boundary
        cycle = ((step + cam_offset * 60) % 240) / 240.0
        person_x = int(100 + 440 * math.sin(cycle * math.pi + cam_offset))
        person_y = int(zero_line_y - 70 + 130 * cycle)
        scale = 0.5 + 0.8 * cycle

        pw, ph = int(30 * scale), int(70 * scale)
        px1, py1 = max(0, person_x - pw // 2), max(0, person_y - ph)
        px2, py2 = min(width - 1, px1 + pw), min(height - 1, py1 + ph)

        cv2.ellipse(frame, (person_x, py1 + int(ph * 0.2)), (int(pw * 0.3), int(ph * 0.15)), 0, 0, 360, (60, 180, 70), -1)
        cv2.rectangle(frame, (px1 + 4, py1 + int(ph * 0.35)), (px2 - 4, py2), (50, 160, 60), -1)

        # Sensor noise
        noise = np.random.normal(0, 5, frame.shape).astype(np.int16)
        frame = np.clip(frame.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        return frame

    def get_latest_jpeg(self) -> Optional[bytes]:
        with self._frame_lock:
            return self._latest_jpeg

    def get_telemetry(self) -> dict:
        return {
            "id": self.cam_id,
            "name": self.name,
            "coordinates": self.coords,
            "type": self.cam_type,
            "status": self.status,
            "source": str(self.source),
            "capture_fps": self.capture_fps,
            "inference_fps": self.inference_fps,
            "latency_ms": self.inference_latency_ms,
            "resolution": self.resolution,
            "active_tracks": self.active_tracks_count,
            "breach_count": self.breach_count,
            "night_vision_mode": self.night_vision_mode,
            "zero_line_ratio": self.zero_line_ratio,
            "last_frame_time": self.last_frame_timestamp,
        }


# ==============================================================================
# GLOBAL CAMERA MANAGER & ALERT RING BUFFER
# ==============================================================================
class CameraManager:
    """Singleton orchestrator managing all camera workers, telemetry, and alert dispatching."""

    def __init__(self):
        self.workers: Dict[str, CameraWorker] = {}
        self.evidence_recorder = EvidenceRecorder()
        self.alerts_history: deque = deque(maxlen=100)
        self.yolo_model: Optional[YOLO] = None
        self.alert_broadcaster: Optional[Callable[[dict], None]] = None
        self.start_time = time.time()

    def initialize(self, alert_broadcaster: Optional[Callable[[dict], None]] = None):
        self.alert_broadcaster = alert_broadcaster

        # Initialize YOLOv8 Model safely
        try:
            logger.info(f"Loading YOLOv8 model '{settings.YOLO_MODEL}'...")
            self.yolo_model = YOLO(settings.YOLO_MODEL)
            logger.info("YOLOv8 model initialized successfully.")
        except Exception as e:
            logger.warning(f"Error loading YOLO model: {e}. Downloading default yolov8n.pt...")
            try:
                self.yolo_model = YOLO("yolov8n.pt")
            except Exception as ex:
                logger.error(f"Failed to load fallback YOLO model: {ex}")
                self.yolo_model = None

        # Camera registry configuration
        camera_configs = [
            {
                "id": "0",
                "source": settings.SECTOR_A_SOURCE,
                "name": "Sector A (Command Post Webcam)",
                "coordinates": "LAT 34.0836° N / LON 74.7973° E",
                "type": "OPTICAL_SURVEILLANCE",
            },
            {
                "id": "1",
                "source": settings.SECTOR_B_SOURCE,
                "name": "Sector B (Perimeter Buffer Node / Phone IP)",
                "coordinates": "LAT 34.0912° N / LON 74.8021° E",
                "type": "BUFFER_ZONE_IR",
            },
        ]

        for cfg in camera_configs:
            worker = CameraWorker(
                cam_id=cfg["id"],
                source=cfg["source"],
                name=cfg["name"],
                coords=cfg["coordinates"],
                cam_type=cfg["type"],
                yolo_model=self.yolo_model,
                evidence_recorder=self.evidence_recorder,
            )
            worker.set_alert_callback(self.record_and_broadcast_alert)
            self.workers[cfg["id"]] = worker
            worker.start()

    def shutdown(self):
        for worker in self.workers.values():
            worker.stop()
        self.workers.clear()

    def record_and_broadcast_alert(self, alert_payload: dict):
        self.alerts_history.appendleft(alert_payload)
        if self.alert_broadcaster:
            self.alert_broadcaster(alert_payload)

    def get_worker(self, cam_id: str) -> Optional[CameraWorker]:
        return self.workers.get(str(cam_id))

    def get_all_cameras_telemetry(self) -> List[dict]:
        return [w.get_telemetry() for w in self.workers.values()]

    def get_system_status(self) -> dict:
        now = time.time()
        uptime_sec = int(now - self.start_time)
        online_cams = sum(1 for w in self.workers.values() if w.status == "ONLINE")
        total_tracks = sum(w.active_tracks_count for w in self.workers.values())
        total_breaches = sum(w.breach_count for w in self.workers.values())
        avg_infer_fps = round(
            sum(w.inference_fps for w in self.workers.values()) / max(1, len(self.workers)), 1
        )
        avg_latency = round(
            sum(w.inference_latency_ms for w in self.workers.values()) / max(1, len(self.workers)), 1
        )

        # Real resource metrics
        try:
            cpu_pct = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            mem_pct = mem.percent
        except Exception:
            cpu_pct = 0.0
            mem_pct = 0.0

        return {
            "status": "healthy" if online_cams > 0 else "degraded",
            "uptime_seconds": uptime_sec,
            "cameras_total": len(self.workers),
            "cameras_online": online_cams,
            "active_tracks": total_tracks,
            "total_breaches": total_breaches,
            "avg_inference_fps": avg_infer_fps,
            "avg_latency_ms": avg_latency,
            "cpu_usage_pct": cpu_pct,
            "memory_usage_pct": mem_pct,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC"),
        }

    def get_alerts_history(self, limit: int = 50) -> List[dict]:
        return list(self.alerts_history)[:limit]


# Global singleton instance
camera_manager = CameraManager()
