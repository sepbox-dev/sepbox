from fastapi.testclient import TestClient
from stellar_sdk import Keypair, TransactionEnvelope

from app.config import get_settings
from app.main import app

client = TestClient(app)


def _get_sep10_auth_headers() -> tuple[Keypair, dict[str, str]]:
    kp = Keypair.random()
    settings = get_settings()
    challenge_xdr = client.get("/auth", params={"account": kp.public_key}).json()["transaction"]
    tx = TransactionEnvelope.from_xdr(challenge_xdr, settings.stellar_network_passphrase)
    tx.sign(kp)
    token = client.post("/auth", json={"transaction": tx.to_xdr()}).json()["token"]
    return kp, {"Authorization": f"Bearer {token}"}


def test_sep12_requires_authentication():
    res = client.get("/sep12/customer")
    assert res.status_code == 401


def test_sep12_new_customer_needs_info():
    _, headers = _get_sep10_auth_headers()
    res = client.get("/sep12/customer", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "NEEDS_INFO"
    assert set(body["fields"].keys()) == {"first_name", "last_name", "email_address"}


def test_sep12_partial_then_complete_kyc_lifecycle():
    _, headers = _get_sep10_auth_headers()

    partial_put = client.put(
        "/sep12/customer",
        json={"first_name": "Ada"},
        headers=headers,
    )
    assert partial_put.status_code == 202
    customer_id = partial_put.json()["id"]

    partial_get = client.get("/sep12/customer", headers=headers)
    assert partial_get.status_code == 200
    assert partial_get.json()["id"] == customer_id
    assert partial_get.json()["status"] == "NEEDS_INFO"
    assert "first_name" in partial_get.json()["provided_fields"]
    assert set(partial_get.json()["fields"].keys()) == {"last_name", "email_address"}

    complete_put = client.put(
        "/sep12/customer",
        json={"last_name": "Lovelace", "email_address": "ada@sepbox.dev"},
        headers=headers,
    )
    assert complete_put.status_code == 202
    assert complete_put.json()["id"] == customer_id

    complete_get = client.get("/sep12/customer", headers=headers)
    assert complete_get.status_code == 200
    assert complete_get.json()["status"] == "ACCEPTED"
    assert "fields" not in complete_get.json()
    assert set(complete_get.json()["provided_fields"].keys()) == {
        "first_name",
        "last_name",
        "email_address",
    }


def test_sep12_rejects_invalid_email():
    _, headers = _get_sep10_auth_headers()
    res = client.put(
        "/sep12/customer",
        json={"email_address": "not-an-email"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "error" in res.json()


def test_sep12_delete_customer_and_block_cross_account_delete():
    kp1, headers1 = _get_sep10_auth_headers()
    _, headers2 = _get_sep10_auth_headers()

    client.put(
        "/sep12/customer",
        json={"first_name": "Chidi", "last_name": "Okoro", "email_address": "chidi@sepbox.dev"},
        headers=headers1,
    )

    forbidden = client.delete(f"/sep12/customer/{kp1.public_key}", headers=headers2)
    assert forbidden.status_code == 403

    deleted = client.delete(f"/sep12/customer/{kp1.public_key}", headers=headers1)
    assert deleted.status_code == 200

    after = client.get("/sep12/customer", headers=headers1)
    assert after.status_code == 200
    assert after.json()["status"] == "NEEDS_INFO"