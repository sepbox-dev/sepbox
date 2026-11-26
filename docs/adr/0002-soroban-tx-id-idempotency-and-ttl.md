# ADR-0002: Soroban `anchor_vault` `tx_id` Idempotency and Explicit Storage TTL Management

- **Status:** Accepted
- **Scope:** `contracts/anchor_vault/src/lib.rs`, `contracts/anchor_vault/src/test.rs`

## Context

Off-chain anchor engines frequently retry settlement calls after RPC timeouts, network congestion, or worker restarts. On Soroban, two contract-level risks arise if settlement state is not carefully designed:
1. Re-submitting `settle_deposit` for the same `SEP-24` transaction could disburse SAC tokens twice from the anchor liquidity vault.
2. Soroban ledger entries expire if their Time-To-Live (TTL) is not bumped, which could archive active settlement records or vault configuration unexpectedly.

## Decision

1. **Deterministic 32-byte `tx_id` idempotency guard:** Every `settle_deposit` and `record_withdrawal` call indexes a `SettlementRecord` in **persistent storage** under `DataKey::Settlement(tx_id)` (`BytesN<32>`). If the key already exists, the contract aborts immediately with `VaultError::DuplicateSettlement` before any token transfer occurs.
2. **Storage tier separation with explicit TTL bumps:**
   - Vault configuration (`Admin`, `Operator`, `Token`, `Paused`, and cumulative counters) lives in **instance storage** and bumps TTL on every state-mutating call (`INSTANCE_TTL_THRESHOLD` / `INSTANCE_TTL_EXTEND_TO`).
   - Per-transaction settlement proofs live in **persistent storage** with independent TTL extensions (`PERSISTENT_TTL_THRESHOLD` / `PERSISTENT_TTL_EXTEND_TO`) so unbounded settlement history never bloats instance storage footprint.
3. **Role separation & pause circuit breaker:** `Admin` controls `set_paused` and `set_operator`, while `Operator` executes hot `settle_deposit` payouts, limiting blast radius if a hot settlement key must be rotated.

## Consequences

- **Positive:** Retrying a timed-out settlement transaction is safe by construction, instance storage stays small and cheap to read, and compromised hot keys can be rotated without redeploying the contract.
- **Trade-off:** Callers must pass a deterministic 32-byte hash/ID derived from the off-chain `SEP-24` transaction UUID, and integrators must run `stellar contract build` (`soroban-sdk 29.0.1` + `stellar-cli v25.2.0+`).