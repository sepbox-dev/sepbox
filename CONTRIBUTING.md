# Contributing to SEPBox

Thank you for your interest in contributing to **SEPBox**. This repository is structured as a three-package monorepo (`engine/`, `contracts/`, and `inspector/`), with automated CI validating every pull request.

## Local Development Setup

### Prerequisites
- Docker Desktop (with Docker Compose v2)
- Optional (for local contract work outside CI): Rust stable with `wasm32v1-none` target and `stellar-cli` `v25.2.0+`
- Optional (for fast local frontend iteration): Node.js `24+`

### 1. Boot the Full Stack
```bash
git clone https://github.com/sepbox-dev/sepbox.git
cd sepbox
docker compose up --build -d
```

### 2. Verify All Test Suites Before Opening a PR

**Python Anchor Engine (`engine/`):**
```bash
docker compose exec engine pytest -v
```

**Soroban Smart Contract (`contracts/`):**
```bash
cd contracts
cargo test --verbose
stellar contract build
```

**Next.js Inspector Workbench (`inspector/`):**
```bash
cd inspector
npm install --no-audit --no-fund
npm run typecheck
npm run build
```

## Coding & Design Standards

- **Backend (`engine/`):**
  - Keep database changes in versioned Alembic migrations under `engine/alembic/versions/`.
  - Use `decimal.Decimal` (7-decimal Stellar precision) for all financial amounts and exchange rates—never floating-point arithmetic.
  - Add pytest coverage for both happy paths and failure/auth edge cases.
- **Contracts (`contracts/`):**
  - Maintain strict `no_std` Soroban compatibility and explicit storage TTL extensions.
  - Every new entrypoint or error variant must include unit tests in `contracts/anchor_vault/src/test.rs`.
- **Frontend (`inspector/`):**
  - Read [`inspector/DESIGN.md`](inspector/DESIGN.md) before modifying UI components.
  - Keep `strict` TypeScript error-free and avoid adding heavy third-party UI or icon libraries without discussion.

## Branch & Commit Conventions

Use clear, scoped branches (`feat/sep6-info`, `fix/webhook-retry`, `docs/adr-sep24`) and Conventional Commits:
- `feat(engine): ...`
- `fix(contracts): ...`
- `feat(inspector): ...`
- `docs: ...`
- `test(engine): ...`

## Pull Request Checklist

1. Reference the target issue (`Closes #<issue-number>`).
2. Keep PRs focused on a single issue or logical change.
3. Confirm all three CI jobs (`engine-tests`, `contract-tests`, `inspector-build`) pass cleanly.
4. Attach before/after screenshots for any `inspector/` UI changes.