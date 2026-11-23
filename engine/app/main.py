from fastapi import FastAPI, HTTPException, status

from app.config import get_anchor_keypair, get_settings
from app.db import check_database_connection

app = FastAPI(title="SEPBox Anchor Engine", version="0.1.0")


@app.get("/health")
def health():
    if not check_database_connection():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed",
        )

    settings = get_settings()
    keypair = get_anchor_keypair()

    return {
        "status": "ok",
        "database": "connected",
        "home_domain": settings.anchor_home_domain,
        "stellar_network": settings.stellar_network_passphrase,
        "anchor_signing_public_key": keypair.public_key,
    }

