import time
import jwt
import pytest
from fastapi.testclient import TestClient
from stellar_sdk import Keypair, TransactionEnvelope

from app.config import get_anchor_keypair, get_settings
from app.main import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# SEP-10 Auth Edge Cases
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "malformed_account",
    [
        "NOT_A_VALID_KEY",
        "G" + "A" * 54,  # Invalid checksum
        "SB3KUB37I34L2ZPM7Y265ZPB6CMA54FOPX6M3Z67T2G3G6C5P2444ZMS",  # Secret seed instead of public G key
        "12345",
        "GABC123",
        "malformed_account_string",
    ],
)
def test_sep10_get_auth_rejects_malformed_accounts(malformed_account: str):
    res = client.get("/auth", params={"account": malformed_account})
    assert res.status_code == 400
    body = res.json()
    assert "error" in body
    assert body["error"] == "Invalid Stellar Ed25519 public key"


def test_sep10_post_auth_rejects_unsigned_challenge():
    user_kp = Keypair.random()
    challenge_res = client.get("/auth", params={"account": user_kp.public_key})
    assert challenge_res.status_code == 200
    challenge_xdr = challenge_res.json()["transaction"]

    # Reject unsigned challenge via JSON payload
    res_json = client.post("/auth", json={"transaction": challenge_xdr})
    assert res_json.status_code == 400
    assert "error" in res_json.json()

    # Reject unsigned challenge via form-encoded payload
    res_form = client.post(
        "/auth",
        data={"transaction": challenge_xdr},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert res_form.status_code == 400
    assert "error" in res_form.json()


def test_sep10_post_auth_rejects_wrong_keypair_signer():
    user_kp = Keypair.random()
    attacker_kp = Keypair.random()
    settings = get_settings()

    challenge_res = client.get("/auth", params={"account": user_kp.public_key})
    assert challenge_res.status_code == 200
    challenge_xdr = challenge_res.json()["transaction"]

    tx_env = TransactionEnvelope.from_xdr(
        challenge_xdr,
        network_passphrase=settings.stellar_network_passphrase,
    )
    # Sign challenge with attacker keypair instead of user keypair
    tx_env.sign(attacker_kp)

    res = client.post("/auth", json={"transaction": tx_env.to_xdr()})
    assert res.status_code == 400
    body = res.json()
    assert "error" in body


# ---------------------------------------------------------------------------
# SEP-38 Indicative Price Validation Edge Cases
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    ("sell_asset", "buy_asset"),
    [
        ("iso4217:EUR", "iso4217:USD"),  # Unsupported sell asset
        ("iso4217:USD", "iso4217:JPY"),  # Unsupported buy asset
        ("stellar:UNKNOWN", "iso4217:USD"),  # Unregistered custom asset
        ("iso4217:USD", "iso4217:USD"),  # Identical sell and buy assets
    ],
)
def test_sep38_get_price_rejects_unsupported_asset_pairs(sell_asset: str, buy_asset: str):
    res = client.get(
        "/sep38/price",
        params={
            "sell_asset": sell_asset,
            "buy_asset": buy_asset,
            "sell_amount": "100",
            "context": "sep24",
        },
    )
    assert res.status_code == 400
    assert "error" in res.json()


@pytest.mark.parametrize(
    "invalid_amount",
    [
        "0",
        "-1",
        "-100.50",
        "abc",
        "10.0.0",
    ],
)
def test_sep38_get_price_rejects_non_positive_and_invalid_sell_amounts(invalid_amount: str):
    usdc = f"stellar:USDC:{get_anchor_keypair().public_key}"
    res = client.get(
        "/sep38/price",
        params={
            "sell_asset": "iso4217:USD",
            "buy_asset": usdc,
            "sell_amount": invalid_amount,
            "context": "sep24",
        },
    )
    assert res.status_code == 400
    assert "error" in res.json()


@pytest.mark.parametrize(
    "invalid_amount",
    [
        "0",
        "-1",
        "-50.25",
        "invalid",
    ],
)
def test_sep38_get_price_rejects_non_positive_and_invalid_buy_amounts(invalid_amount: str):
    usdc = f"stellar:USDC:{get_anchor_keypair().public_key}"
    res = client.get(
        "/sep38/price",
        params={
            "sell_asset": "iso4217:USD",
            "buy_asset": usdc,
            "buy_amount": invalid_amount,
            "context": "sep24",
        },
    )
    assert res.status_code == 400
    assert "error" in res.json()


# ---------------------------------------------------------------------------
# SEP-24 Interactive Deposit Auth Edge Cases
# ---------------------------------------------------------------------------

def test_sep24_deposit_interactive_rejects_missing_or_malformed_auth_header():
    # Completely missing Authorization header
    res_missing = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC"},
    )
    assert res_missing.status_code == 401
    assert res_missing.json()["detail"] == "Missing or invalid Authorization header"

    # Non-Bearer scheme (e.g. Basic auth)
    res_basic = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC"},
        headers={"Authorization": "Basic dXNlcjpwYXNz"},
    )
    assert res_basic.status_code == 401
    assert res_basic.json()["detail"] == "Missing or invalid Authorization header"

    # Empty Bearer prefix
    res_empty = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC"},
        headers={"Authorization": "Bearer "},
    )
    assert res_empty.status_code == 401


def test_sep24_deposit_interactive_rejects_invalid_bearer_tokens():
    settings = get_settings()
    now = int(time.time())

    # Invalid token string
    res_invalid = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC"},
        headers={"Authorization": "Bearer not.a.valid.jwt.token"},
    )
    assert res_invalid.status_code == 401
    assert res_invalid.json()["detail"] == "Invalid authentication token"

    # Expired token
    expired_payload = {
        "iss": f"http://{settings.anchor_home_domain}/auth",
        "sub": Keypair.random().public_key,
        "iat": now - 7200,
        "exp": now - 3600,
    }
    expired_token = jwt.encode(expired_payload, settings.jwt_secret, algorithm="HS256")
    res_expired = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC"},
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert res_expired.status_code == 401
    assert res_expired.json()["detail"] == "Token has expired"

    # Token signed with wrong secret key
    wrong_secret_payload = {
        "iss": f"http://{settings.anchor_home_domain}/auth",
        "sub": Keypair.random().public_key,
        "iat": now,
        "exp": now + 3600,
    }
    wrong_secret_token = jwt.encode(wrong_secret_payload, "completely-wrong-secret", algorithm="HS256")
    res_wrong_secret = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC"},
        headers={"Authorization": f"Bearer {wrong_secret_token}"},
    )
    assert res_wrong_secret.status_code == 401
    assert res_wrong_secret.json()["detail"] == "Invalid authentication token"

    # Token missing valid 'sub' claim
    no_sub_payload = {
        "iss": f"http://{settings.anchor_home_domain}/auth",
        "iat": now,
        "exp": now + 3600,
    }
    no_sub_token = jwt.encode(no_sub_payload, settings.jwt_secret, algorithm="HS256")
    res_no_sub = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC"},
        headers={"Authorization": f"Bearer {no_sub_token}"},
    )
    assert res_no_sub.status_code == 401
    assert res_no_sub.json()["detail"] == "Token missing valid subject"
