import json
import time
from urllib.parse import parse_qs

import jwt
from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from stellar_sdk import StrKey
from stellar_sdk.memo import IdMemo
from stellar_sdk.sep.ed25519_public_key_signer import Ed25519PublicKeySigner
from stellar_sdk.sep.exceptions import InvalidSep10ChallengeError
from stellar_sdk.sep.stellar_web_authentication import (
    build_challenge_transaction,
    read_challenge_transaction,
    verify_challenge_transaction_signers,
)

from app.config import get_anchor_keypair, get_settings

router = APIRouter(tags=["SEP-10"])
MAX_UINT64 = 2**64 - 1


@router.get("/auth")
def get_challenge(
    account: str = Query(..., description="Client Stellar G... public key"),
    home_domain: str | None = Query(default=None),
    memo: str | None = Query(default=None),
):
    settings = get_settings()
    keypair = get_anchor_keypair()

    if not StrKey.is_valid_ed25519_public_key(account):
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid Stellar Ed25519 public key"},
        )

    effective_home_domain = home_domain or settings.anchor_home_domain
    if effective_home_domain != settings.anchor_home_domain:
        return JSONResponse(
            status_code=400,
            content={"error": f"Unsupported home_domain: {effective_home_domain}"},
        )

    parsed_memo: int | None = None
    if memo is not None:
        if not memo.isdigit():
            return JSONResponse(
                status_code=400,
                content={"error": "Memo must be an unsigned 64-bit integer"},
            )
        parsed_memo = int(memo)
        if parsed_memo < 0 or parsed_memo > MAX_UINT64:
            return JSONResponse(
                status_code=400,
                content={"error": "Memo out of 64-bit unsigned integer range"},
            )

    challenge_xdr = build_challenge_transaction(
        server_secret=keypair.secret,
        client_account_id=account,
        home_domain=effective_home_domain,
        web_auth_domain=settings.anchor_home_domain,
        network_passphrase=settings.stellar_network_passphrase,
        timeout=settings.sep10_challenge_timeout,
        memo=parsed_memo,
    )

    return {
        "transaction": challenge_xdr,
        "network_passphrase": settings.stellar_network_passphrase,
    }


@router.post("/auth")
async def verify_challenge(request: Request):
    settings = get_settings()
    keypair = get_anchor_keypair()
    content_type = (request.headers.get("content-type") or "").lower()
    raw_body = await request.body()

    challenge_xdr: str | None = None
    if "application/x-www-form-urlencoded" in content_type:
        form_data = parse_qs(raw_body.decode("utf-8", errors="ignore"))
        tx_values = form_data.get("transaction")
        if tx_values:
            challenge_xdr = tx_values[0]
    else:
        try:
            body_json = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except json.JSONDecodeError:
            return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})
        if isinstance(body_json, dict):
            challenge_xdr = body_json.get("transaction")

    if not challenge_xdr or not isinstance(challenge_xdr, str):
        return JSONResponse(
            status_code=400,
            content={"error": "Missing required 'transaction' field"},
        )

    try:
        challenge = read_challenge_transaction(
            challenge_transaction=challenge_xdr,
            server_account_id=keypair.public_key,
            home_domains=[settings.anchor_home_domain],
            web_auth_domain=settings.anchor_home_domain,
            network_passphrase=settings.stellar_network_passphrase,
        )
        verified_signers = verify_challenge_transaction_signers(
            challenge_transaction=challenge_xdr,
            server_account_id=keypair.public_key,
            home_domains=[settings.anchor_home_domain],
            web_auth_domain=settings.anchor_home_domain,
            network_passphrase=settings.stellar_network_passphrase,
            signers=[Ed25519PublicKeySigner(account_id=challenge.client_account_id, weight=1)],
        )
        if not verified_signers:
            raise InvalidSep10ChallengeError("No valid client signer found")
    except InvalidSep10ChallengeError as exc:
        return JSONResponse(status_code=400, content={"error": str(exc)})
    except Exception as exc:
        return JSONResponse(
            status_code=400,
            content={"error": f"Invalid challenge transaction: {exc}"},
        )

    subject = challenge.client_account_id
    tx_memo = challenge.transaction.transaction.memo
    if isinstance(tx_memo, IdMemo):
        subject = f"{challenge.client_account_id}:{tx_memo.memo_id}"

    now = int(time.time())
    payload = {
        "iss": f"http://{settings.anchor_home_domain}/auth",
        "sub": subject,
        "iat": now,
        "exp": now + settings.jwt_expiration_seconds,
        "jti": challenge.transaction.hash_hex(),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
    return {"token": token}


def get_authenticated_account(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.removeprefix("Bearer ").strip()
    settings = get_settings()
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Token has expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid authentication token") from exc

    subject = claims.get("sub")
    if not subject or not isinstance(subject, str):
        raise HTTPException(status_code=401, detail="Token missing valid subject")
    return subject