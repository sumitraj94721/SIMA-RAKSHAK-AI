from fastapi import APIRouter
from typing import List

from app.models.schemas import HeatmapPoint

router = APIRouter(prefix="/heatmap", tags=["heatmap"])


@router.get("/", response_model=List[HeatmapPoint])
def read_heatmap() -> List[HeatmapPoint]:
    return [
        HeatmapPoint(zone="Zone A", intensity=72, label="main corridor"),
        HeatmapPoint(zone="Zone B", intensity=50, label="vehicle access"),
        HeatmapPoint(zone="Zone C", intensity=86, label="storage bay"),
        HeatmapPoint(zone="Zone D", intensity=40, label="service entrance"),
    ]
