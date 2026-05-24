from typing import Any
from pydantic import BaseModel, field_validator
from datetime import datetime


def _str(v: Any) -> str | None:
    return str(v) if v is not None else None


class ImageResponse(BaseModel):
    id: str
    folder_id: str
    filename: str
    original_name: str | None
    thumbnail_path: str | None
    file_size: int | None
    width: int | None
    height: int | None
    mime_type: str | None
    date_taken: datetime | None
    camera_model: str | None
    gps_latitude: float | None
    gps_longitude: float | None
    location_name: str | None
    caption_ai: str | None
    processing_status: str | None = None
    user_notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", "folder_id", mode="before")
    @classmethod
    def coerce_str(cls, v: Any) -> str:
        return str(v)


class ImageDetailResponse(ImageResponse):
    lens_model: str | None
    focal_length: str | None
    aperture: str | None
    shutter_speed: str | None
    iso: int | None
    gps_altitude: float | None
    exif_raw: dict | None
    categories: list["CategoryBrief"] = []
    persons: list["PersonBrief"] = []
    tags: list[str] = []


class CategoryBrief(BaseModel):
    id: str
    name: str
    slug: str
    confidence: float

    @field_validator("id", mode="before")
    @classmethod
    def coerce_str(cls, v: Any) -> str:
        return str(v)


class PersonBrief(BaseModel):
    id: str
    name: str | None
    confidence: float

    @field_validator("id", mode="before")
    @classmethod
    def coerce_str(cls, v: Any) -> str:
        return str(v)


class ImageUpdateRequest(BaseModel):
    user_notes: str | None = None
    folder_id: str | None = None
    category_ids: list[str] | None = None


class BatchOperationRequest(BaseModel):
    image_ids: list[str]
    action: str  # categorize, tag, delete, move
    category_ids: list[str] | None = None
    tag_ids: list[str] | None = None
    folder_id: str | None = None
