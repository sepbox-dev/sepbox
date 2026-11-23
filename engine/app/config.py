import logging
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict
from stellar_sdk import Keypair

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    database_url: str
    stellar_network_passphrase: str = "Test SDF Network ; September 2015"
    stellar_horizon_url: str = "https://horizon-testnet.stellar.org"
    stellar_rpc_url: str = "https://soroban-testnet.stellar.org"
    anchor_signing_seed: str = ""
    anchor_home_domain: str = "localhost:8000"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_anchor_keypair() -> Keypair:
    settings = get_settings()
    if settings.anchor_signing_seed:
        return Keypair.from_secret(settings.anchor_signing_seed)
    logger.warning("anchor_signing_seed is not configured; generating ephemeral Keypair.")
    return Keypair.random()

