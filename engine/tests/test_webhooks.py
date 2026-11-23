import time
import httpx
import pytest
from fastapi.testclient import TestClient
from stellar_sdk import Keypair, TransactionEnvelope

from app import webhooks
from app.config import get_settings
from app.main import app

client = TestClient(app)


def _get_sep10_auth_headers() -> dict[str, str]:
    kp = Keypair.random()
    settings = get_settings()
    challenge_xdr = client.get("/auth", params={"account": kp.public_key}).json()["transaction"]
    tx = TransactionEnvelope.from_xdr(challenge_xdr, settings.stellar_network_passphrase)
    tx.sign(kp)
    token = client.post("/auth", json={"transaction": tx.to_xdr()}).json()["token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def cleanup_subscriptions():
    created_ids: list[str] = []
    yield created_ids
    for sub_id in created_ids:
        client.delete(f"/admin/webhooks/{sub_id}")


def test_hmac_signature_sign_and_verify():
    secret = "whsec_test_signing_key_1234567890"
    raw = b'{"event":"sep24.transaction.updated","id":"tx-1"}'
    now = int(time.time())

    sig = webhooks.sign_webhook_payload(secret, now, raw)
    assert webhooks.verify_webhook_signature(secret, raw, sig) is True
    assert webhooks.verify_webhook_signature(secret, raw + b" ", sig) is False
    assert webhooks.verify_webhook_signature("wrong-secret-key-1234", raw, sig) is False

    old_sig = webhooks.sign_webhook_payload(secret, now - 600, raw)
    assert webhooks.verify_webhook_signature(secret, raw, old_sig, tolerance_seconds=300) is False


def test_webhook_dispatches_signed_payload_on_sep24_advance(monkeypatch, cleanup_subscriptions):
    captured: list[tuple[dict[str, str], bytes]] = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        captured.append((dict(request.headers), request.content))
        return httpx.Response(200, text="accepted")

    monkeypatch.setattr(
        webhooks,
        "get_http_client",
        lambda: httpx.Client(transport=httpx.MockTransport(mock_handler)),
    )

    sub_res = client.post(
        "/admin/webhooks",
        json={"url": "https://wallet.example.test/hooks/sep24"},
    )
    assert sub_res.status_code == 201
    sub = sub_res.json()
    cleanup_subscriptions.append(sub["id"])
    secret = sub["secret"]

    headers = _get_sep10_auth_headers()
    tx_id = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC", "amount": "100"},
        headers=headers,
    ).json()["id"]

    adv = client.post(f"/sep24/transactions/{tx_id}/advance", headers=headers)
    assert adv.status_code == 200
    assert len(captured) == 1

    req_headers, req_body = captured[0]
    sig_header = req_headers["x-sepbox-signature"]
    assert req_headers["x-sepbox-event"] == "sep24.transaction.updated"
    assert webhooks.verify_webhook_signature(secret, req_body, sig_header) is True

    deliveries = client.get("/admin/webhooks/deliveries", params={"transaction_id": tx_id}).json()["deliveries"]
    assert len(deliveries) == 1
    assert deliveries[0]["status"] == "delivered"
    assert deliveries[0]["http_status"] == 200
    assert deliveries[0]["attempts"] == 1


def test_webhook_records_failure_and_supports_replay(monkeypatch, cleanup_subscriptions):
    mode = {"status": 500}

    def mock_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(mode["status"], text="downstream state")

    monkeypatch.setattr(
        webhooks,
        "get_http_client",
        lambda: httpx.Client(transport=httpx.MockTransport(mock_handler)),
    )

    sub = client.post(
        "/admin/webhooks",
        json={"url": "https://wallet.example.test/hooks/flaky"},
    ).json()
    cleanup_subscriptions.append(sub["id"])

    headers = _get_sep10_auth_headers()
    tx_id = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC", "amount": "50"},
        headers=headers,
    ).json()["id"]
    client.post(f"/sep24/transactions/{tx_id}/advance", headers=headers)

    deliveries = client.get("/admin/webhooks/deliveries", params={"transaction_id": tx_id}).json()["deliveries"]
    assert len(deliveries) == 1
    assert deliveries[0]["status"] == "failed"
    assert deliveries[0]["http_status"] == 500
    delivery_id = deliveries[0]["id"]

    mode["status"] = 200
    replayed = client.post(f"/admin/webhooks/deliveries/{delivery_id}/replay")
    assert replayed.status_code == 200
    body = replayed.json()
    assert body["status"] == "delivered"
    assert body["http_status"] == 200
    assert body["attempts"] == 2


def test_webhook_rejects_invalid_url():
    res = client.post("/admin/webhooks", json={"url": "ftp://invalid.example.test/hook"})
    assert res.status_code == 400
    assert "error" in res.json()


def test_webhook_delete_subscription():
    sub = client.post(
        "/admin/webhooks",
        json={"url": "https://wallet.example.test/hooks/temp"},
    ).json()
    del_res = client.delete(f"/admin/webhooks/{sub['id']}")
    assert del_res.status_code == 200

    missing_res = client.delete(f"/admin/webhooks/{sub['id']}")
    assert missing_res.status_code == 404