import json
import logging
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_chaos_state():
    client.post("/admin/chaos/reset")
    yield
    client.post("/admin/chaos/reset")


def test_generates_uuid_request_id_when_header_missing():
    res = client.get("/sep24/info")
    assert res.status_code == 200
    request_id = res.headers.get("x-request-id")
    assert request_id is not None
    parsed = uuid.UUID(request_id)
    assert str(parsed) == request_id


def test_propagates_valid_client_request_id():
    custom_id = "wallet-client-trace-001.abc"
    res = client.get("/sep38/info", headers={"X-Request-ID": custom_id})
    assert res.status_code == 200
    assert res.headers.get("x-request-id") == custom_id


def test_replaces_malformed_request_id_with_fresh_uuid():
    bad_id = "invalid id with spaces\tbad"
    res = client.get("/sep24/info", headers={"X-Request-ID": bad_id})
    assert res.status_code == 200
    returned_id = res.headers.get("x-request-id")
    assert returned_id is not None
    assert returned_id != bad_id
    uuid.UUID(returned_id)


def test_emits_structured_json_access_log(caplog):
    trace_id = "sepbox-log-check-42"
    with caplog.at_level(logging.INFO, logger="sepbox.access"):
        res = client.get("/sep24/info", headers={"X-Request-ID": trace_id})

    assert res.status_code == 200
    access_records = [r for r in caplog.records if r.name == "sepbox.access"]
    assert len(access_records) >= 1

    payload = json.loads(access_records[-1].getMessage())
    assert payload["event"] == "http_request"
    assert payload["request_id"] == trace_id
    assert payload["method"] == "GET"
    assert payload["path"] == "/sep24/info"
    assert payload["status_code"] == 200
    assert payload["duration_ms"] >= 0
    assert payload["chaos_injected"] is False
    assert "timestamp" in payload


def test_chaos_fault_response_retains_request_id_and_flags_log(caplog):
    client.put(
        "/admin/chaos",
        json={"enabled": True, "target_prefix": "/sep24", "error_rate": 1.0, "error_status": 503},
    )
    trace_id = "chaos-trace-503"
    with caplog.at_level(logging.INFO, logger="sepbox.access"):
        res = client.get("/sep24/info", headers={"X-Request-ID": trace_id})

    assert res.status_code == 503
    assert res.headers.get("x-request-id") == trace_id
    assert res.headers.get("x-sepbox-chaos-injected") == "true"

    access_records = [r for r in caplog.records if r.name == "sepbox.access"]
    payload = json.loads(access_records[-1].getMessage())
    assert payload["request_id"] == trace_id
    assert payload["status_code"] == 503
    assert payload["chaos_injected"] is True


def test_cors_exposes_request_id_and_chaos_headers():
    res = client.get("/sep24/info", headers={"Origin": "http://localhost:3000"})
    assert res.status_code == 200
    exposed = res.headers.get("access-control-expose-headers", "").lower()
    assert "x-request-id" in exposed
    assert "x-sepbox-chaos-injected" in exposed