from fastapi import APIRouter, HTTPException
from typing import List
from app.models.schemas import CameraFeed

# In-memory storage for cameras (fake database)
cameras_db: List[CameraFeed] = [
    CameraFeed(
        id="cam-01",
        label="Entrance Lobby",
        location="North Wing",
        status="Active",
        threatScore=32,
        alerts=1,
    ),
    CameraFeed(
        id="cam-02",
        label="Parking Entrance",
        location="South Gate",
        status="Watch",
        threatScore=58,
        alerts=3,
    ),
    CameraFeed(
        id="cam-03",
        label="Loading Dock",
        location="West Yard",
        status="Critical",
        threatScore=84,
        alerts=5,
    ),
]

router = APIRouter(prefix="/cameras", tags=["cameras"])


@router.get("/", response_model=List[CameraFeed])
def read_cameras() -> List[CameraFeed]:
    """Retrieve all cameras from the in-memory database."""
    if not cameras_db:
        raise HTTPException(status_code=404, detail="No cameras found")
    return cameras_db


@router.post("/", response_model=CameraFeed)
def create_camera(camera: CameraFeed) -> CameraFeed:
    """Add a new camera to the in-memory database."""
    # Check for duplicate ID
    if any(c.id == camera.id for c in cameras_db):
        raise HTTPException(status_code=400, detail="Camera with this ID already exists")
    cameras_db.append(camera)
    return camera
