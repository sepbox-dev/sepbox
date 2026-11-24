import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_state():
    client.post("/admin/chaos/reset")
    client.delete("/admin/traffic")
    yield
    client.post("/admin/chaos/reset")
    client.delete("/admin/traffic")


def test_traffic_inspector_captures_requests_and_ignores_self():
    assert client.get("/sep24/info").status_code == 200
    assert client.get("/sep38/info").status_code == 200

    log = client.get("/admin/traffic").json()
    assert log["count"] == 2
    paths = [event["path"] for event in log["events"]]
    assert paths == ["/sep38/info", "/sep24/info"]
    assert all(event["chaos_injected"] is False for event in log["events"])
    assert all(event["duration_ms"] >= 0 for event in log["events"])
    assert all("application/json" in event["content_type"] for event in log["events"])

    # Polling /admin/traffic must not add itself to the ring buffer
    second_poll = client.get("/admin/traffic").json()
    assert second_poll["count"] == 2


def test_traffic_inspector_ignores_admin_polling_and_options_preflight():
    assert client.get("/admin/overview").status_code == 200
    assert client.get("/admin/webhooks").status_code == 200
    assert client.get("/admin/webhooks/deliveries").status_code == 200
    client.options("/sep24/info")

    log = client.get("/admin/traffic").json()
    assert log["count"] == 0


def test_traffic_inspector_flags_chaos_injected_responses():
    client.put(
        "/admin/chaos",
        json={"enabled": True, "target_prefix": "/sep24", "error_rate": 1.0, "error_status": 503},
    )

    faulted = client.get("/sep24/info")
    assert faulted.status_code == 503

    filtered = client.get("/admin/traffic", params={"prefix": "/sep24"}).json()
    assert filtered["count"] == 1
    event = filtered["events"][0]
    assert event["status_code"] == 503
    assert event["chaos_injected"] is True


def test_admin_overview_reports_live_counts_and_anchor_state():
    res = client.get("/admin/overview")
    assert res.status_code == 200
    body = res.json()
    assert body["anchor"]["signing_public_key"].startswith("G")
    assert "sep24_transactions" in body["counts"]
    assert "webhook_deliveries" in body["counts"]
    assert body["chaos"]["enabled"] is False