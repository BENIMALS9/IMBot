"""Tests for image model relationships and cascade behavior."""

import uuid

import pytest

from app.models.image import Image
from app.models.person import Person, ImagePerson
from app.models.category import Category, ImageCategory
from app.models.tag import Tag, ImageTag


class TestImageModel:
    def test_image_defaults(self):
        img_id = uuid.uuid4()
        img = Image(
            id=img_id,
            user_id=uuid.uuid4(),
            folder_id=uuid.uuid4(),
            filename="test.jpg",
            file_path="/data/images/test.jpg",
            processing_status="pending",
        )
        assert img.id == img_id
        assert img.processing_status == "pending"
        assert img.file_size is None
        assert img.caption_ai is None

    def test_image_exif_fields(self):
        img = Image(
            user_id=uuid.uuid4(),
            folder_id=uuid.uuid4(),
            filename="test.jpg",
            file_path="/data/images/test.jpg",
            camera_model="Sony A7M4",
            iso=400,
            gps_latitude=30.25,
            gps_longitude=120.17,
        )
        assert img.camera_model == "Sony A7M4"
        assert img.iso == 400
        assert img.gps_latitude == 30.25


class TestPersonModel:
    def test_person_creation(self):
        person = Person(
            user_id=uuid.uuid4(),
            name=None,
            slug="face_abc12345",
            face_embedding=[0.1, 0.2, 0.3],
            is_verified=False,
            is_hidden=False,
            image_count=0,
        )
        assert person.name is None
        assert person.slug == "face_abc12345"
        assert person.is_verified is False
        assert person.is_hidden is False
        assert person.image_count == 0

    def test_person_verified(self):
        person = Person(
            user_id=uuid.uuid4(),
            name="张三",
            is_verified=True,
            image_count=5,
        )
        assert person.name == "张三"
        assert person.is_verified is True
        assert person.image_count == 5


class TestImagePerson:
    def test_image_person_association(self):
        ip = ImagePerson(
            image_id=uuid.uuid4(),
            person_id=uuid.uuid4(),
            face_bbox={"x": 10, "y": 20, "w": 50, "h": 60},
            confidence=0.85,
        )
        assert ip.confidence == 0.85
        assert ip.face_bbox["x"] == 10
        assert ip.face_bbox["w"] == 50


class TestCategoryModel:
    def test_category_tree(self):
        parent = Category(
            user_id=uuid.uuid4(),
            name="风景",
            slug="landscape",
            level=0,
        )
        child = Category(
            user_id=uuid.uuid4(),
            name="山水",
            slug="landscape-mountain",
            parent_id=parent.id,
            level=1,
        )
        assert child.parent_id == parent.id
        assert child.level == 1


class TestTagModel:
    def test_tag_creation(self):
        tag = Tag(
            user_id=uuid.uuid4(),
            name="日落",
            slug="sunset",
        )
        assert tag.name == "日落"
        assert tag.slug == "sunset"
