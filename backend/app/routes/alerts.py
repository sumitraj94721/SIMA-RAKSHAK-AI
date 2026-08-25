from datetime import datetime
from fastapi import APIRouter
from typing import List
import random

from app.models.schemas import AlertEvent

router = APIRouter(prefix="/alerts", tags=["alerts"])

alert_types = [
    "Unauthorized entry",
    "Loitering",
    "Suspicious object",
    "Restricted perimeter alert",
]

alert_locations = [
    "North Wing entrance",
    "South Gate parking",
    "Loading Dock",
    "Server Room",
    "Control Tower",
    "Delivery Bay",
]

severity_levels = ["low", "medium", "high"]

messages = {
    "Unauthorized entry": "Unverified individual was detected inside a secured zone.",
    "Loitering": "Prolonged presence was observed near an access point.",
    "Suspicious object": "An unattended package triggered the AI detector.",
    "Restricted perimeter alert": "Movement was detected inside a locked perimeter.",
}


def build_alert() -> AlertEvent:
    alert_type = random.choice(alert_types)
    severity = random.choice(severity_levels)
    confidence = random.randint(68, 98) if severity == "high" else random.randint(45, 90)
    location = random.choice(alert_locations)
    return AlertEvent(
        id=f"alert-{int(datetime.utcnow().timestamp() * 1000)}-{random.randint(10, 99)}",
        type=alert_type,
        location=location,
        severity=severity,
        confidence=confidence,
        timestamp=datetime.utcnow().isoformat(timespec="seconds") + "Z",
        message=messages[alert_type],
    )


@router.get("/", response_model=List[AlertEvent])
def read_alerts() -> List[AlertEvent]:
    """Generate a small batch of simulated alerts for the dashboard."""
    return [build_alert() for _ in range(random.randint(1, 3))]
