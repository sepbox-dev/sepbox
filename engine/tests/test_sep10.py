import jwt
from fastapi.testclient import TestClient
from stellar_sdk import Keypair, TransactionEnvelope

from app.config import get_settings
from app.main import app

client = TestClient(app)


def test_sep10_full_auth_flow_json():
    user_kp = Keypair.random()
    settings = get_settings()

    challenge_res = client.get("/auth", params={"account": user_kp.public_key})
    assert challenge_res.status_code == 200
    challenge_data = challenge_res.json()
    assert challenge_data["network_passphrase"] == settings.stellar_network_passphrase

    tx_env = TransactionEnvelope.from_xdr(
        challenge_data["transaction"],
        network_passphrase=settings.stellar_network_passphrase,
    )
    tx_env.sign(user_kp)

    token_res = client.post("/auth", json={"transaction": tx_env.to_xdr()})
    assert token_res.status_code == 200
    token = token_res.json()["token"]

    claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    assert claims["sub"] == user_kp.public_key
    assert claims["iss"] == f"http://{settings.anchor_home_domain}/auth"
    assert claims["jti"] == tx_env.hash_hex()


def test_sep10_full_auth_flow_form_encoded():
    user_kp = Keypair.random()
    settings = get_settings()

    challenge_res = client.get("/auth", params={"account": user_kp.public_key})
    assert challenge_res.status_code == 200

    tx_env = TransactionEnvelope.from_xdr(
        challenge_res.json()["transaction"],
        network_passphrase=settings.stellar_network_passphrase,
    )
    tx_env.sign(user_kp)

    token_res = client.post(
        "/auth",
        data={"transaction": tx_env.to_xdr()},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert token_res.status_code == 200
    claims = jwt.decode(token_res.json()["token"], settings.jwt_secret, algorithms=["HS256"])
    assert claims["sub"] == user_kp.public_key


def test_sep10_auth_flow_with_memo():
    user_kp = Keypair.random()
    settings = get_settings()

    challenge_res = client.get(
        "/auth",
        params={"account": user_kp.public_key, "memo": "123456789"},
    )
    assert challenge_res.status_code == 200

    tx_env = TransactionEnvelope.from_xdr(
        challenge_res.json()["transaction"],
        network_passphrase=settings.stellar_network_passphrase,
    )
    tx_env.sign(user_kp)

    token_res = client.post("/auth", json={"transaction": tx_env.to_xdr()})
    assert token_res.status_code == 200
    claims = jwt.decode(token_res.json()["token"], settings.jwt_secret, algorithms=["HS256"])
    assert claims["sub"] == f"{user_kp.public_key}:123456789"


def test_sep10_rejects_invalid_account():
    res = client.get("/auth", params={"account": "NOT_A_VALID_KEY"})
    assert res.status_code == 400
    assert "error" in res.json()


def test_sep10_rejects_unsigned_challenge():
    user_kp = Keypair.random()
    challenge_xdr = client.get("/auth", params={"account": user_kp.public_key}).json()["transaction"]

    res = client.post("/auth", json={"transaction": challenge_xdr})
    assert res.status_code == 400
    assert "error" in res.json()


def test_sep10_rejects_wrong_signer():
    user_kp = Keypair.random()
    attacker_kp = Keypair.random()
    settings = get_settings()

    challenge_xdr = client.get("/auth", params={"account": user_kp.public_key}).json()["transaction"]
    tx_env = TransactionEnvelope.from_xdr(
        challenge_xdr,
        network_passphrase=settings.stellar_network_passphrase,
    )
    tx_env.sign(attacker_kp)

    res = client.post("/auth", json={"transaction": tx_env.to_xdr()})
    assert res.status_code == 400
    assert "error" in res.json()


def test_sep10_rejects_malformed_xdr():
    res = client.post("/auth", json={"transaction": "not-valid-base64-xdr"})
    assert res.status_code == 400
    assert "error" in res.json()