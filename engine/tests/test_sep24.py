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


def test_sep24_info_exposes_usdc_and_xlm():
    res = client.get("/sep24/info")
    assert res.status_code == 200
    body = res.json()
    assert body["deposit"]["USDC"]["enabled"] is True
    assert body["withdraw"]["XLM"]["enabled"] is True


def test_sep24_interactive_requires_sep10_auth():
    res = client.post("/sep24/transactions/deposit/interactive", json={"asset_code": "USDC"})
    assert res.status_code == 401


def test_sep24_deposit_full_state_machine_and_queries():
    headers = _get_sep10_auth_headers()

    init_res = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC", "amount": "200"},
        headers=headers,
    )
    assert init_res.status_code == 200
    init_body = init_res.json()
    assert init_body["type"] == "interactive_customer_info_needed"
    tx_id = init_body["id"]

    expected_states = [
        "pending_user_transfer_start",
        "pending_anchor",
        "pending_stellar",
        "completed",
    ]
    for expected in expected_states:
        adv_res = client.post(f"/sep24/transactions/{tx_id}/advance", headers=headers)
        assert adv_res.status_code == 200
        assert adv_res.json()["transaction"]["status"] == expected

    single = client.get("/sep24/transaction", params={"id": tx_id}, headers=headers)
    assert single.status_code == 200
    tx = single.json()["transaction"]
    assert tx["status"] == "completed"
    assert tx["completed_at"] is not None
    assert len(tx["stellar_transaction_id"]) == 64
    assert Decimal(tx["amount_in"]) == Decimal("200.0000000")
    assert Decimal(tx["amount_fee"]) == Decimal("1.0000000")
    assert Decimal(tx["amount_out"]) == Decimal("199.0000000")

    listed = client.get("/sep24/transactions", params={"asset_code": "USDC"}, headers=headers)
    assert listed.status_code == 200
    assert any(item["id"] == tx_id for item in listed.json()["transactions"])


def test_sep24_rejects_illegal_state_transitions():
    headers = _get_sep10_auth_headers()
    tx_id = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC", "amount": "50"},
        headers=headers,
    ).json()["id"]

    skip_res = client.post(
        f"/sep24/transactions/{tx_id}/advance",
        json={"status": "completed"},
        headers=headers,
    )
    assert skip_res.status_code == 409

    err_res = client.post(
        f"/sep24/transactions/{tx_id}/advance",
        json={"status": "error", "message": "Simulated compliance rejection"},
        headers=headers,
    )
    assert err_res.status_code == 200
    assert err_res.json()["transaction"]["status"] == "error"

    after_terminal = client.post(f"/sep24/transactions/{tx_id}/advance", headers=headers)
    assert after_terminal.status_code == 409


def test_sep24_withdrawal_sets_anchor_memo_and_enforces_owner_isolation():
    headers_owner = _get_sep10_auth_headers()
    headers_other = _get_sep10_auth_headers()

    tx_id = client.post(
        "/sep24/transactions/withdraw/interactive",
        json={"asset_code": "XLM", "amount": "100"},
        headers=headers_owner,
    ).json()["id"]

    owner_tx = client.get("/sep24/transaction", params={"id": tx_id}, headers=headers_owner).json()["transaction"]
    assert owner_tx["kind"] == "withdrawal"
    assert owner_tx["withdraw_anchor_account"] == get_anchor_keypair().public_key
    assert owner_tx["withdraw_memo"].isdigit()
    assert owner_tx["withdraw_memo_type"] == "id"

    other_res = client.get("/sep24/transaction", params={"id": tx_id}, headers=headers_other)
    assert other_res.status_code == 404


def test_sep24_deposit_links_real_sep38_quote():
    headers = _get_sep10_auth_headers()
    usdc = f"stellar:USDC:{get_anchor_keypair().public_key}"

    quote = client.post(
        "/sep38/quote",
        json={
            "context": "sep24",
            "sell_asset": "iso4217:NGN",
            "buy_asset": usdc,
            "sell_amount": "160000",
        },
        headers=headers,
    ).json()

    tx_id = client.post(
        "/sep24/transactions/deposit/interactive",
        json={"asset_code": "USDC", "quote_id": quote["id"]},
        headers=headers,
    ).json()["id"]

    tx = client.get("/sep24/transaction", params={"id": tx_id}, headers=headers).json()["transaction"]
    assert tx["quote_id"] == quote["id"]
    assert Decimal(tx["amount_in"]) == Decimal("160000.0000000")
    assert Decimal(tx["amount_out"]) == Decimal("99.5000000")