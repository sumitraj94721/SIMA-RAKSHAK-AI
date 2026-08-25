from fastapi import APIRouter
import random

from app.models.schemas import FaceDetectionResult

router = APIRouter(prefix="/detect-face", tags=["face_detection"])

possible_locations = [
    "Main Gate",
    "Parking Entrance",
    "Security Lobby",
    "Loading Dock",
    "Server Room door",
]


@router.get("/", response_model=FaceDetectionResult)
def detect_face() -> FaceDetectionResult:
    """Simulate a face detection result for the live dashboard."""
    face_found = random.random() > 0.35
    confidence = random.randint(65, 98) if face_found else random.randint(12, 40)
    location = random.choice(possible_locations) if face_found else "No face detected"
    message = (
        "Face match estimated with high confidence." if face_found else "No face was visible in the current stream."
    )
    return FaceDetectionResult(
        faceDetected=face_found,
        confidence=confidence,
        location=location,
        message=message,
    )
