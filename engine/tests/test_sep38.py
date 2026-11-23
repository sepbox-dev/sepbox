from decimal import Decimal

from fastapi.testclient import TestClient
from stellar_sdk import Keypair, TransactionEnvelope

from app.config import get_anchor_keypair, get_settings
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


def test_sep38_info_lists_supported_assets():
    res = client.get("/sep38/info")
    assert res.status_code == 200
    assets = {a["asset"] for a in res.json()["assets"]}
    expected_usdc = f"stellar:USDC:{get_anchor_keypair().public_key}"
    assert {"iso4217:USD", "iso4217:NGN", "stellar:native", expected_usdc}.issubset(assets)


def test_sep38_indicative_prices():
    res = client.get(
        "/sep38/prices",
        params={"sell_asset": "iso4217:USD", "sell_amount": "100"},
    )
    assert res.status_code == 200
    buy_assets = res.json()["buy_assets"]
    assert len(buy_assets) >= 3
    assert all("price" in item and item["decimals"] == 7 for item in buy_assets)


def test_sep38_indicative_price_exact_decimal_math():
    usdc = f"stellar:USDC:{get_anchor_keypair().public_key}"
    res = client.get(
        "/sep38/price",
        params={
            "sell_asset": "iso4217:USD",
            "buy_asset": usdc,
            "sell_amount": "100",
            "context": "sep24",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert Decimal(body["sell_amount"]) == Decimal("100.0000000")
    assert Decimal(body["fee"]["total"]) == Decimal("0.5000000")
    assert Decimal(body["buy_amount"]) == Decimal("99.5000000")
    assert Decimal(body["price"]) == Decimal("1.0000000")

    bad_res = client.get(
        "/sep38/price",
        params={
            "sell_asset": "iso4217:USD",
            "buy_asset": usdc,
            "sell_amount": "100",
            "buy_amount": "99",
            "context": "sep24",
        },
    )
    assert bad_res.status_code == 400


def test_sep38_firm_quote_persists_and_enforces_owner_isolation():
    usdc = f"stellar:USDC:{get_anchor_keypair().public_key}"

    unauth = client.post(
        "/sep38/quote",
        json={
            "context": "sep24",
            "sell_asset": "iso4217:NGN",
            "buy_asset": usdc,
            "sell_amount": "160000",
        },
    )
    assert unauth.status_code == 401

    headers_owner = _get_sep10_auth_headers()
    headers_other = _get_sep10_auth_headers()

    create_res = client.post(
        "/sep38/quote",
        json={
            "context": "sep24",
            "sell_asset": "iso4217:NGN",
            "buy_asset": usdc,
            "sell_amount": "160000",
        },
        headers=headers_owner,
    )
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["id"]
    assert created["expires_at"].endswith("Z")
    assert Decimal(created["buy_amount"]) == Decimal("99.5000000")

    fetch_owner = client.get(f"/sep38/quote/{created['id']}", headers=headers_owner)
    assert fetch_owner.status_code == 200
    assert fetch_owner.json()["id"] == created["id"]

    fetch_other = client.get(f"/sep38/quote/{created['id']}", headers=headers_other)
    assert fetch_other.status_code == 404


def test_sep38_rejects_excessive_quote_duration():
    usdc = f"stellar:USDC:{get_anchor_keypair().public_key}"
    headers = _get_sep10_auth_headers()

    res = client.post(
        "/sep38/quote",
        json={
            "context": "sep24",
            "sell_asset": "iso4217:USD",
            "buy_asset": usdc,
            "buy_amount": "50",
            "expire_after": "2099-01-01T00:00:00Z",
        },
        headers=headers,
    )
    assert res.status_code == 400