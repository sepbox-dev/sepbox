"""End-to-end live Stellar protocol runner for SEPBox.

Executes a full cryptographic lifecycle against a running SEPBox Anchor Engine:
  1. SEP-1  Discovery (`/.well-known/stellar.toml`)
  2. SEP-10 Ed25519 challenge-response authentication (`/auth`)
  3. SEP-12 Stateful KYC onboarding (`NEEDS_INFO` -> `ACCEPTED`)
  4. SEP-38 Indicative FX price + persisted firm quote (`NGN` -> `USDC`)
  5. SEP-24 Quoted interactive deposit + XLM withdrawal state machines

Run inside the engine container (zero host Python setup required):
  docker compose cp scripts/demo_flow.py engine:/tmp/demo_flow.py
  docker compose exec engine python /tmp/demo_flow.py
"""

from __future__ import annotations

import argparse
import sys
import tomllib

import httpx
from stellar_sdk import Keypair, TransactionEnvelope


def step(title: str) -> None:
    print(f"\n=== {title} ===")


def require_status(resp: httpx.Response, expected: int | tuple[int, ...], label: str) -> None:
    allowed = (expected,) if isinstance(expected, int) else expected
    if resp.status_code not in allowed:
        print(f"[FAIL] {label}: expected HTTP {allowed}, got {resp.status_code}")
        print(resp.text)
        sys.exit(1)


def run_demo(base_url: str, ngn_amount: str, xlm_withdraw_amount: str) -> None:
    base_url = base_url.rstrip("/")
    user_kp = Keypair.random()

    print(f"SEPBox Anchor URL : {base_url}")
    print(f"Ephemeral Wallet  : {user_kp.public_key}")

    with httpx.Client(base_url=base_url, timeout=10.0) as client:
        # 1. SEP-1 Discovery
        step("1. SEP-1 Anchor Discovery (/.well-known/stellar.toml)")
        toml_res = client.get("/.well-known/stellar.toml")
        require_status(toml_res, 200, "GET /.well-known/stellar.toml")
        stellar_toml = tomllib.loads(toml_res.text)
        signing_key = stellar_toml["SIGNING_KEY"]
        network_passphrase = stellar_toml["NETWORK_PASSPHRASE"]
        print(f"Network           : {network_passphrase}")
        print(f"Anchor Signing Key: {signing_key}")

        # 2. SEP-10 Real Ed25519 Web Authentication
        step("2. SEP-10 Cryptographic Login (/auth)")
        ch_res = client.get("/auth", params={"account": user_kp.public_key})
        require_status(ch_res, 200, "GET /auth")
        challenge_xdr = ch_res.json()["transaction"]

        tx_env = TransactionEnvelope.from_xdr(challenge_xdr, network_passphrase=network_passphrase)
        tx_env.sign(user_kp)

        token_res = client.post("/auth", json={"transaction": tx_env.to_xdr()})
        require_status(token_res, 200, "POST /auth")
        jwt_token = token_res.json()["token"]
        auth_headers = {"Authorization": f"Bearer {jwt_token}"}
        print(f"JWT Issued        : {jwt_token[:28]}... (HS256 verified)")

        # 3. SEP-12 Stateful KYC Onboarding
        step("3. SEP-12 KYC Lifecycle (/sep12/customer)")
        kyc_initial = client.get("/sep12/customer", headers=auth_headers)
        require_status(kyc_initial, 200, "GET /sep12/customer (initial)")
        print(f"Initial Status    : {kyc_initial.json()['status']}")

        kyc_put = client.put(
            "/sep12/customer",
            json={
                "first_name": "Amara",
                "last_name": "Okafor",
                "email_address": "amara.okafor@sepbox.dev",
            },
            headers=auth_headers,
        )
        require_status(kyc_put, 202, "PUT /sep12/customer")
        customer_id = kyc_put.json()["id"]

        kyc_verified = client.get("/sep12/customer", headers=auth_headers)
        require_status(kyc_verified, 200, "GET /sep12/customer (verified)")
        print(f"Customer ID       : {customer_id}")
        print(f"Updated Status    : {kyc_verified.json()['status']}")

        # 4. SEP-38 FX Price & Firm Quote
        step("4. SEP-38 FX Quote (iso4217:NGN -> stellar:USDC)")
        usdc_asset = f"stellar:USDC:{signing_key}"

        price_res = client.get(
            "/sep38/price",
            params={
                "sell_asset": "iso4217:NGN",
                "buy_asset": usdc_asset,
                "sell_amount": ngn_amount,
                "context": "sep24",
            },
        )
        require_status(price_res, 200, "GET /sep38/price")
        indicative = price_res.json()
        print(
            f"Indicative Quote  : {indicative['sell_amount']} NGN -> "
            f"{indicative['buy_amount']} USDC (fee: {indicative['fee']['total']} NGN)"
        )

        quote_res = client.post(
            "/sep38/quote",
            json={
                "context": "sep24",
                "sell_asset": "iso4217:NGN",
                "buy_asset": usdc_asset,
                "sell_amount": ngn_amount,
            },
            headers=auth_headers,
        )
        require_status(quote_res, 201, "POST /sep38/quote")
        quote = quote_res.json()
        print(f"Firm Quote ID     : {quote['id']} (expires {quote['expires_at']})")

        # 5. SEP-24 Quoted Interactive Deposit
        step("5. SEP-24 Quoted Deposit State Machine")
        dep_init = client.post(
            "/sep24/transactions/deposit/interactive",
            json={"asset_code": "USDC", "quote_id": quote["id"]},
            headers=auth_headers,
        )
        require_status(dep_init, 200, "POST /sep24/transactions/deposit/interactive")
        deposit_id = dep_init.json()["id"]
        print(f"Deposit TX ID     : {deposit_id}")

        deposit_states: list[str] = ["incomplete"]
        for _ in range(4):
            adv = client.post(f"/sep24/transactions/{deposit_id}/advance", headers=auth_headers)
            require_status(adv, 200, "POST /sep24/transactions/{id}/advance (deposit)")
            deposit_states.append(adv.json()["transaction"]["status"])

        dep_final = client.get("/sep24/transaction", params={"id": deposit_id}, headers=auth_headers)
        require_status(dep_final, 200, "GET /sep24/transaction (deposit)")
        dep_tx = dep_final.json()["transaction"]
        print(f"Transitions       : {' -> '.join(deposit_states)}")
        print(f"Stellar TX Hash   : {dep_tx['stellar_transaction_id']}")

        # 6. SEP-24 Interactive Withdrawal
        step("6. SEP-24 Withdrawal State Machine (XLM)")
        wd_init = client.post(
            "/sep24/transactions/withdraw/interactive",
            json={"asset_code": "XLM", "amount": xlm_withdraw_amount},
            headers=auth_headers,
        )
        require_status(wd_init, 200, "POST /sep24/transactions/withdraw/interactive")
        withdraw_id = wd_init.json()["id"]

        wd_states: list[str] = ["incomplete"]
        for _ in range(4):
            adv = client.post(f"/sep24/transactions/{withdraw_id}/advance", headers=auth_headers)
            require_status(adv, 200, "POST /sep24/transactions/{id}/advance (withdrawal)")
            wd_states.append(adv.json()["transaction"]["status"])

        wd_final = client.get("/sep24/transaction", params={"id": withdraw_id}, headers=auth_headers)
        require_status(wd_final, 200, "GET /sep24/transaction (withdrawal)")
        wd_tx = wd_final.json()["transaction"]
        print(f"Withdrawal TX ID  : {withdraw_id}")
        print(f"Anchor Memo (ID)  : {wd_tx['withdraw_memo']}")
        print(f"Transitions       : {' -> '.join(wd_states)}")

        print("\n[OK] Full SEP-1 -> SEP-10 -> SEP-12 -> SEP-38 -> SEP-24 lifecycle completed.")
        print("Open http://localhost:3000 to inspect every captured request in the workbench.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a live end-to-end Stellar SEP flow against SEPBox.")
    parser.add_argument(
        "--base-url",
        default="http://localhost:8000",
        help="Base URL of the running SEPBox engine (default: http://localhost:8000)",
    )
    parser.add_argument(
        "--ngn-amount",
        default="160000",
        help="NGN sell_amount for the SEP-38 -> SEP-24 quoted deposit (default: 160000)",
    )
    parser.add_argument(
        "--xlm-amount",
        default="250",
        help="XLM amount for the SEP-24 withdrawal flow (default: 250)",
    )
    args = parser.parse_args()
    run_demo(args.base_url, args.ngn_amount, args.xlm_amount)


if __name__ == "__main__":
    main()