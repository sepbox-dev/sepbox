from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.chaos import chaos_middleware, router as chaos_router
from app.config import get_anchor_keypair, get_settings
from app.db import check_database_connection
from app.sep1 import router as sep1_router
from app.sep10 import router as sep10_router
from app.sep12 import router as sep12_router
from app.sep24 import router as sep24_router
from app.sep38 import router as sep38_router

app = FastAPI(
    title="SEPBox Anchor Engine",
    version="0.4.0",
    description="Local-first Stellar SEP Anchor & Chaos Testing Engine",
)

app.middleware("http")(chaos_middleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sep1_router)
app.include_router(sep10_router)
app.include_router(sep12_router)
app.include_router(sep24_router)
app.include_router(sep38_router)
app.include_router(chaos_router)


@app.get("/health")
def health_check() -> dict[str, str]:
    settings = get_settings()
    keypair = get_anchor_keypair()

    try:
        db_ok = check_database_connection()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Database unreachable: {exc}",
        ) from exc

    if not db_ok:
        raise HTTPException(status_code=503, detail="Database health query failed")

    return {
        "status": "ok",
        "database": "connected",
        "home_domain": settings.anchor_home_domain,
        "stellar_network": settings.stellar_network_passphrase,
        "anchor_signing_public_key": keypair.public_key,
    }