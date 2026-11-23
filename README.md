# SEPBox

Local-first, Dockerized Stellar Anchor server (`SEP-1`, `SEP-10`, `SEP-12`, `SEP-24`, `SEP-38`), chaos fault injector, and Soroban settlement harness.

SEPBox replaces unreliable public testnet anchors with a deterministic local environment backed by PostgreSQL, real Stellar Ed25519 cryptography, and an on-chain Soroban settlement contract.

## Requirements

### To Run with Docker (Recommended)
- **Git**
- **Docker Desktop** (with Docker Compose v2)

### For Local Development & Contributing (Outside Docker)
- **Python** `3.12+` (engine dependencies are listed in `engine/requirements.txt`)
- **PostgreSQL** `16+` (if running the engine directly without Docker)
- **Rust** `1.84+` with the `wasm32v1-none` target and **Stellar CLI** `30+` (for `contracts/`)
- **Node.js** `20+` (for `inspector/`)

## Repository Structure

```text
sepbox/
├── engine/         # FastAPI + PostgreSQL anchor engine (stellar-sdk, SEP flows, chaos middleware)
├── contracts/      # Rust / Soroban anchor_vault settlement contract
├── inspector/      # Next.js live traffic & chaos testing workbench
├── docs/adr/       # Architecture Decision Records
└── .github/        # CI workflows
```

## Quick Start (Docker)

1. Clone the repository and copy the example environment file:

```bash
git clone [https://github.com/sepbox-dev/sepbox.git](https://github.com/sepbox-dev/sepbox.git)
cd sepbox
cp .env.example .env
```

2. Build and start PostgreSQL and the SEPBox engine:

```bash
docker compose up --build -d
```

3. Verify the engine is connected to PostgreSQL and has initialized a Stellar Ed25519 signing keypair:

```bash
curl http://localhost:8000/health
```

4. Run the automated test suite inside the running engine container:

```bash
docker compose exec engine pytest -v
```

5. Stop the containers when finished:

```bash
docker compose down
```

## Environment Variables

Defined in `.env.example`:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql+psycopg://sepbox:sepbox@db:5432/sepbox` | PostgreSQL connection string used by the engine. |
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` | Target Stellar network passphrase. |
| `STELLAR_HORIZON_URL` | `https://horizon-testnet.stellar.org` | Horizon endpoint for ledger queries. |
| `STELLAR_RPC_URL` | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint for contract simulation and submission. |
| `ANCHOR_SIGNING_SEED` | *(empty)* | Optional 56-char Stellar secret seed (`S...`). If blank, an ephemeral Ed25519 keypair is generated on startup. |
| `ANCHOR_HOME_DOMAIN` | `localhost:8000` | Domain advertised in `stellar.toml` and SEP-10 challenges. |

## Roadmap & Current Status

- [x] Monorepo foundation, Docker Compose (PostgreSQL 16 + FastAPI), `/health` verification, and GitHub Actions CI
- [ ] `SEP-1` (`/.well-known/stellar.toml`) & `SEP-10` Web Authentication (real XDR challenge signing & JWTs)
- [ ] `SEP-12` KYC mock lifecycle, `SEP-38` firm FX quotes, and `SEP-24` deposit/withdrawal state machine
- [ ] Chaos fault injection middleware & HMAC-signed webhook delivery
- [ ] Soroban `anchor_vault` settlement contract (`contracts/`)
- [ ] Live traffic & chaos workbench UI (`inspector/`)