"""Tests for persons API endpoints."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest


class TestListPersons:
    async def test_list_persons(self, client, mock_db):
        person = MagicMock()
        person.id = uuid.UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")
        person.name = "小明"
        person.slug = "face_abc12345"
        person.face_thumbnail = "/path/to/face.jpg"
        person.image_count = 3
        person.is_verified = True

        result = MagicMock()
        result.scalars.return_value.all.return_value = [person]
        mock_db.execute = AsyncMock(return_value=result)

        resp = await client.get("/api/persons")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "小明"
        assert data[0]["image_count"] == 3


class TestUpdatePerson:
    async def test_update_person_name(self, client, mock_db, sample_person_id):
        person = MagicMock()
        person.id = uuid.UUID(sample_person_id)
        person.user_id = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        person.name = "旧名字"
        person.is_verified = False
        mock_db.get = AsyncMock(return_value=person)
        mock_db.commit = AsyncMock()

        resp = await client.put(f"/api/persons/{sample_person_id}", params={"name": "新名字"})

        assert resp.status_code == 200
        assert resp.json()["message"] == "updated"

    async def test_update_nonexistent_person(self, client, mock_db):
        mock_db.get = AsyncMock(return_value=None)

        resp = await client.put("/api/persons/ffffffff-ffff-ffff-ffff-ffffffffffff", params={"name": "x"})

        assert resp.status_code == 404

    async def test_merge_persons(self, client, mock_db, sample_person_id):
        from_person = MagicMock()
        from_person.id = uuid.UUID("dddddddd-dddd-dddd-dddd-dddddddddddd")
        from_person.name = "源人物"
        from_person.image_count = 2
        from_person.user_id = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

        to_person = MagicMock()
        to_person.id = uuid.UUID(sample_person_id)
        to_person.name = "目标人物"
        to_person.image_count = 3
        to_person.user_id = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

        mock_db.get = AsyncMock(side_effect=[to_person, from_person])
        mock_db.commit = AsyncMock()
        mock_db.delete = AsyncMock()

        # Mock the execute used in the merge loop — scalars() must return an iterable
        ip1 = MagicMock()
        ip2 = MagicMock()
        exec_result = MagicMock()
        exec_result.scalars.return_value = [ip1, ip2]
        mock_db.execute = AsyncMock(return_value=exec_result)

        resp = await client.put(
            f"/api/persons/{sample_person_id}",
            params={"merge_from_id": "dddddddd-dddd-dddd-dddd-dddddddddddd"},
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["message"] == "updated"


class TestDeletePerson:
    async def test_delete_person(self, client, mock_db, sample_person_id):
        person = MagicMock()
        person.id = uuid.UUID(sample_person_id)
        person.user_id = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        person.name = "待删除"
        mock_db.get = AsyncMock(return_value=person)

        # Mock the scalars() iterator for the delete loop
        scalars_mock = MagicMock()
        scalars_mock.return_value = []  # empty — no ImagePerson records
        result_mock = MagicMock()
        result_mock.scalars = scalars_mock
        mock_db.execute = AsyncMock(return_value=result_mock)
        mock_db.delete = AsyncMock()
        mock_db.commit = AsyncMock()

        resp = await client.delete(f"/api/persons/{sample_person_id}")

        assert resp.status_code == 200
        assert resp.json() == {"message": "deleted"}
