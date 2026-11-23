import logging
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from stellar_sdk import Keypair

logger = logging.getLogger("sepbox.config")


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://sepbox:sepbox@localhost:5432/sepbox"
    stellar_network_passphrase: str = "Test SDF Network ; September 2015"
    stellar_horizon_url: str = "https://horizon-testnet.stellar.org"
    stellar_rpc_url: str = "https://soroban-testnet.stellar.org"
    anchor_signing_seed: str = ""
    anchor_home_domain: str = "localhost:8000"
    jwt_secret: str = "sepbox-local-dev-jwt-secret-key-min-32-bytes"
    jwt_expiration_seconds: int = 86400
    sep10_challenge_timeout: int = 900

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_anchor_keypair() -> Keypair:
    settings = get_settings()
    if settings.anchor_signing_seed.strip():
        return Keypair.from_secret(settings.anchor_signing_seed.strip())

    ephemeral = Keypair.random()
    logger.warning(
        "ANCHOR_SIGNING_SEED not set; using ephemeral dev keypair %s",
        ephemeral.public_key,
    )
    return ephemeral