import json
from urllib.parse import parse_qs

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import KycCustomer
from app.sep10 import get_authenticated_account

router = APIRouter(prefix="/sep12", tags=["SEP-12"])

REQUIRED_SEP9_FIELDS: dict[str, dict[str, object]] = {
    "first_name": {
        "description": "Customer's legal first name",
        "type": "string",
        "optional": False,
    },
    "last_name": {
        "description": "Customer's legal last name",
        "type": "string",
        "optional": False,
    },
    "email_address": {
        "description": "Customer's verified email address",
        "type": "string",
        "optional": False,
    },
}


def _matches_auth_subject(requested_account: str, auth_subject: str) -> bool:
    base_account = auth_subject.split(":")[0]
    return requested_account == auth_subject or requested_account == base_account


def _serialize_customer(customer: KycCustomer | None) -> dict[str, object]:
    if customer is None:
        return {
            "status": "NEEDS_INFO",
            "fields": REQUIRED_SEP9_FIELDS,
        }

    missing_fields: dict[str, dict[str, object]] = {}
    provided_fields: dict[str, dict[str, object]] = {}

    for field_name, spec in REQUIRED_SEP9_FIELDS.items():
        value = getattr(customer, field_name)
        if value:
            provided_fields[field_name] = {
                "description": spec["description"],
                "type": spec["type"],
                "status": "ACCEPTED",
            }
        else:
            missing_fields[field_name] = spec

    response: dict[str, object] = {
        "id": customer.id,
        "status": customer.status,
    }
    if missing_fields:
        response["fields"] = missing_fields
    if provided_fields:
        response["provided_fields"] = provided_fields
    return response


@router.get("/customer")
def get_customer(
    account: str | None = Query(default=None),
    customer_id: str | None = Query(default=None, alias="id"),
    auth_subject: str = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    if account and not _matches_auth_subject(account, auth_subject):
        raise HTTPException(status_code=403, detail="Cannot access another account's KYC profile")

    stmt = select(KycCustomer).where(KycCustomer.account == auth_subject)
    if customer_id:
        stmt = stmt.where(KycCustomer.id == customer_id)

    customer = db.execute(stmt).scalar_one_or_none()
    if customer_id and customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    return _serialize_customer(customer)


@router.put("/customer")
async def put_customer(
    request: Request,
    auth_subject: str = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    content_type = (request.headers.get("content-type") or "").lower()
    raw_body = await request.body()

    payload: dict[str, str] = {}
    if "application/x-www-form-urlencoded" in content_type:
        parsed = parse_qs(raw_body.decode("utf-8", errors="ignore"))
        payload = {k: v[0] for k, v in parsed.items() if v}
    else:
        try:
            body_json = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except json.JSONDecodeError:
            return JSONResponse(status_code=400, content={"error": "Invalid JSON body"})
        if not isinstance(body_json, dict):
            return JSONResponse(status_code=400, content={"error": "Expected JSON object"})
        payload = {k: str(v).strip() for k, v in body_json.items() if v is not None}

    requested_account = payload.get("account")
    if requested_account and not _matches_auth_subject(requested_account, auth_subject):
        raise HTTPException(status_code=403, detail="Cannot modify another account's KYC profile")

    email = payload.get("email_address")
    if email and ("@" not in email or "." not in email.split("@")[-1]):
        return JSONResponse(status_code=400, content={"error": "Invalid email_address format"})

    customer = db.execute(
        select(KycCustomer).where(KycCustomer.account == auth_subject)
    ).scalar_one_or_none()

    if customer is None:
        customer = KycCustomer(account=auth_subject)
        db.add(customer)

    if payload.get("first_name"):
        customer.first_name = payload["first_name"]
    if payload.get("last_name"):
        customer.last_name = payload["last_name"]
    if email:
        customer.email_address = email

    all_required_present = bool(customer.first_name and customer.last_name and customer.email_address)
    customer.status = "ACCEPTED" if all_required_present else "NEEDS_INFO"

    db.commit()
    db.refresh(customer)
    return JSONResponse(status_code=202, content={"id": customer.id})


@router.delete("/customer/{account}")
def delete_customer(
    account: str,
    auth_subject: str = Depends(get_authenticated_account),
    db: Session = Depends(get_db),
):
    if not _matches_auth_subject(account, auth_subject):
        raise HTTPException(status_code=403, detail="Cannot delete another account's KYC profile")

    customer = db.execute(
        select(KycCustomer).where(KycCustomer.account == auth_subject)
    ).scalar_one_or_none()

    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    db.delete(customer)
    db.commit()
    return {"status": "deleted", "account": auth_subject}