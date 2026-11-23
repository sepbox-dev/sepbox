import time
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_chaos_between_tests():
    client.post("/admin/chaos/reset")
    yield
    client.post("/admin/chaos/reset")


def test_chaos_disabled_by_default():
    cfg = client.get("/admin/chaos").json()
    assert cfg["enabled"] is False
    assert client.get("/sep24/info").status_code == 200


def test_chaos_injects_http_errors_while_protecting_control_plane():
    put_res = client.put(
        "/admin/chaos",
        json={
            "enabled": True,
            "target_prefix": "/sep24",
            "error_rate": 1.0,
            "error_status": 503,
            "error_message": "Simulated anchor outage",
        },
    )
    assert put_res.status_code == 200

    faulted = client.get("/sep24/info")
    assert faulted.status_code == 503
    assert faulted.headers.get("x-sepbox-chaos-injected") == "true"
    assert faulted.json()["chaos_injected"] is True

    # Control plane and non-matching routes remain healthy
    assert client.get("/health").status_code == 200
    assert client.get("/admin/chaos").status_code == 200
    assert client.get("/sep38/info").status_code == 200

    stats = client.get("/admin/chaos").json()["stats"]
    assert stats["injected_errors"] == 1


def test_chaos_injects_corrupt_json_payload():
    client.put(
        "/admin/chaos",
        json={
            "enabled": True,
            "target_prefix": "/sep38",
            "corrupt_json": True,
        },
    )

    res = client.get("/sep38/info")
    assert res.status_code == 200
    assert res.headers.get("x-sepbox-chaos-injected") == "true"
    with pytest.raises(ValueError):
        res.json()


def test_chaos_injects_latency():
    client.put(
        "/admin/chaos",
        json={
            "enabled": True,
            "target_prefix": "/sep24",
            "latency_ms": 80,
            "error_rate": 0.0,
        },
    )

    start = time.perf_counter()
    res = client.get("/sep24/info")
    elapsed_ms = (time.perf_counter() - start) * 1000.0

    assert res.status_code == 200
    assert res.headers.get("x-sepbox-chaos-latency-ms") == "80"
    assert elapsed_ms >= 60.0


def test_chaos_reset_restores_normal_traffic():
    client.put(
        "/admin/chaos",
        json={"enabled": True, "target_prefix": "/sep", "error_rate": 1.0, "error_status": 500},
    )
    assert client.get("/sep24/info").status_code == 500

    reset = client.post("/admin/chaos/reset")
    assert reset.status_code == 200
    assert reset.json()["enabled"] is False
    assert reset.json()["stats"]["injected_errors"] == 0
    assert client.get("/sep24/info").status_code == 200