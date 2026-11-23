from fastapi import APIRouter
from fastapi.responses import PlainTextResponse
from app.config import get_anchor_keypair, get_settings

router = APIRouter(tags=["SEP-1"])


@router.get("/.well-known/stellar.toml", response_class=PlainTextResponse)
def get_stellar_toml() -> PlainTextResponse:
    settings = get_settings()
    signing_key = get_anchor_keypair().public_key
    base_url = f"http://{settings.anchor_home_domain}"

    toml_body = f'''VERSION = "2.0.0"
NETWORK_PASSPHRASE = "{settings.stellar_network_passphrase}"
SIGNING_KEY = "{signing_key}"
WEB_AUTH_ENDPOINT = "{base_url}/auth"
TRANSFER_SERVER_SEP0024 = "{base_url}/sep24"
KYC_SERVER = "{base_url}/sep12"
ANCHOR_QUOTE_SERVER = "{base_url}/sep38"

[[CURRENCIES]]
code = "USDC"
issuer = "{signing_key}"
status = "test"
is_asset_anchored = true
anchor_asset_type = "fiat"
anchor_asset = "USD"
desc = "SEPBox Local Test USD Coin"

[[CURRENCIES]]
code = "XLM"
status = "test"
is_asset_anchored = false
desc = "Native Stellar Lumens"
'''
    return PlainTextResponse(
        content=toml_body,
        media_type="text/plain; charset=utf-8",
        headers={"Access-Control-Allow-Origin": "*"},
    )