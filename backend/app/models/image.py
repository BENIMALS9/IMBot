import uuid
from datetime import datetime

from sqlalchemy import String, Integer, BigInteger, Float, Boolean, DateTime, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.core.database import Base


class Image(Base):
    __tablename__ = "images"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    folder_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("folders.id", ondelete="CASCADE"), nullable=False)

    # File info
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    original_name: Mapped[str | None] = mapped_column(String(500))
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    thumbnail_path: Mapped[str | None] = mapped_column(String(1000))
    file_size: Mapped[int | None] = mapped_column(BigInteger)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    mime_type: Mapped[str | None] = mapped_column(String(100))
    file_hash: Mapped[str | None] = mapped_column(String(64))

    # EXIF / metadata
    date_taken: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    camera_model: Mapped[str | None] = mapped_column(String(200))
    lens_model: Mapped[str | None] = mapped_column(String(200))
    focal_length: Mapped[str | None] = mapped_column(String(50))
    aperture: Mapped[str | None] = mapped_column(String(50))
    shutter_speed: Mapped[str | None] = mapped_column(String(50))
    iso: Mapped[int | None] = mapped_column(Integer)
    gps_latitude: Mapped[float | None] = mapped_column(Float)
    gps_longitude: Mapped[float | None] = mapped_column(Float)
    gps_altitude: Mapped[float | None] = mapped_column(Float)
    location_name: Mapped[str | None] = mapped_column(String(500))
    exif_raw: Mapped[dict | None] = mapped_column(JSONB)

    # AI generated
    clip_embedding: Mapped[list[float] | None] = mapped_column(Vector(768))
    caption_ai: Mapped[str | None] = mapped_column(Text)
    processing_status: Mapped[str | None] = mapped_column(String(20), default="pending")

    # User input
    user_notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    folder: Mapped["Folder"] = relationship(back_populates="images")
    categories: Mapped[list["ImageCategory"]] = relationship(back_populates="image", cascade="all, delete-orphan")
    persons: Mapped[list["ImagePerson"]] = relationship(back_populates="image", cascade="all, delete-orphan")
    tags: Mapped[list["ImageTag"]] = relationship(back_populates="image", cascade="all, delete-orphan")
    processing_tasks: Mapped[list["ProcessingTask"]] = relationship(back_populates="image", cascade="all, delete-orphan")
