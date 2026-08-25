import os
from typing import List, Union
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "SENTRY-AI Tactical Border Surveillance"
    VERSION: str = "2.2.0"
    PS_ID: str = "SIH26187"

    # YOLO Configuration
    YOLO_MODEL: str = os.getenv("YOLO_MODEL", "yolov8n.pt")
    YOLO_CONFIDENCE: float = float(os.getenv("YOLO_CONFIDENCE", "0.35"))
    INFERENCE_FPS: int = int(os.getenv("INFERENCE_FPS", "15"))

    # Pipeline & Camera
    CAMERA_TIMEOUT: float = float(os.getenv("CAMERA_TIMEOUT", "5.0"))
    SECTOR_A_SOURCE: Union[int, str] = os.getenv("SECTOR_A_SOURCE", "0")
    SECTOR_B_SOURCE: str = os.getenv("SECTOR_B_SOURCE", "http://127.0.0.1:8080/video")
    
    # Alert & Tracking
    ALERT_COOLDOWN_SEC: float = float(os.getenv("ALERT_COOLDOWN_SEC", "6.0"))
    NIGHT_VISION_DEFAULT: str = os.getenv("NIGHT_VISION_DEFAULT", "AUTO")  # NORMAL, NIGHT_VISION, AUTO
    
    # Storage
    EVIDENCE_DIR: str = os.getenv("EVIDENCE_DIR", "breach_evidence")

    # Security & CORS
    CORS_ORIGINS: List[str] = ["*"]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

