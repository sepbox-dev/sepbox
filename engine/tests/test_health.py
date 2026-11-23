from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert data["stellar_network"] == "Test SDF Network ; September 2015"
    assert data["anchor_signing_public_key"].startswith("G")
    assert len(data["anchor_signing_public_key"]) == 56

