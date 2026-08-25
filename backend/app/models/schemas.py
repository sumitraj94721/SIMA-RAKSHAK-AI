from pydantic import BaseModel


class CameraFeed(BaseModel):
    """Pydantic model for camera feed data."""
    id: str
    label: str
    location: str
    status: str
    threatScore: int
    alerts: int


class HeatmapPoint(BaseModel):
    """Pydantic model for heatmap zone intensity data."""
    zone: str
    intensity: int
    label: str


class AlertEvent(BaseModel):
    id: str
    type: str
    location: str
    severity: str
    confidence: int
    timestamp: str
    message: str


class FaceDetectionResult(BaseModel):
    faceDetected: bool
    confidence: int
    location: str
    message: str


class DetectionResponse(BaseModel):
    status: str
    message: str
    faces_detected: int
    confidence: float
    timestamp: str
    image: str
