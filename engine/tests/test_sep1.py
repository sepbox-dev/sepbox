import tomllib
from fastapi.testclient import TestClient
from app.config import get_anchor_keypair, get_settings
from app.main import app

client = TestClient(app)


def test_stellar_toml_discovery():
    response = client.get("/.well-known/stellar.toml")
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "*"

    parsed = tomllib.loads(response.text)
    settings = get_settings()
    signing_key = get_anchor_keypair().public_key

    assert parsed["VERSION"] == "2.0.0"
    assert parsed["NETWORK_PASSPHRASE"] == settings.stellar_network_passphrase
    assert parsed["SIGNING_KEY"] == signing_key
    assert parsed["WEB_AUTH_ENDPOINT"] == f"http://{settings.anchor_home_domain}/auth"
    assert parsed["TRANSFER_SERVER_SEP0024"] == f"http://{settings.anchor_home_domain}/sep24"
    assert parsed["KYC_SERVER"] == f"http://{settings.anchor_home_domain}/sep12"
    assert parsed["ANCHOR_QUOTE_SERVER"] == f"http://{settings.anchor_home_domain}/sep38"

    codes = {c["code"] for c in parsed["CURRENCIES"]}
    assert {"USDC", "XLM"}.issubset(codes)