# SEPBox Soroban Contracts (`anchor_vault`)

`anchor_vault` is a `no_std` Soroban smart contract (`soroban-sdk 29.0.1`) modeling on-chain Stellar anchor liquidity custody, operator-settled `SEP-24` deposits, user-submitted withdrawals, and emergency circuit breaking.

## Key Invariants

- **Strict `tx_id` Idempotency:** Every `settle_deposit` and `record_withdrawal` call stores a `SettlementRecord` in persistent storage keyed by `BytesN<32>` `tx_id`. Replaying a previously settled ID fails with `VaultError::DuplicateSettlement` (`#6`) before any token transfer occurs.
- **Role Separation:** `Admin` controls `set_paused` and `set_operator`, while `Operator` authorizes hot `settle_deposit` payouts.
- **Explicit TTL Management:** Instance and persistent storage entries extend their TTL automatically on state mutations (see [`docs/adr/0002-soroban-tx-id-idempotency-and-ttl.md`](../docs/adr/0002-soroban-tx-id-idempotency-and-ttl.md)).

## Entrypoints

| Function | Auth Required | Purpose |
| :--- | :--- | :--- |
| `initialize(admin, operator, token)` | `admin` | One-time setup binding admin, hot operator, and SAC token contract. |
| `fund_vault(from, amount)` | `from` | Transfers SAC liquidity into the vault and returns updated balance. |
| `settle_deposit(tx_id, recipient, amount, fee)` | `operator` | Disburses tokens to a `SEP-24` deposit recipient with idempotency protection. |
| `record_withdrawal(tx_id, sender, amount, fee)` | `sender` | Accepts user tokens into the vault for a `SEP-24` withdrawal. |
| `set_paused(paused)` | `admin` | Toggles emergency pause circuit breaker on deposits and withdrawals. |
| `set_operator(new_operator)` | `admin` | Rotates the hot settlement operator without redeploying the vault. |
| `get_settlement(tx_id)` | None | Looks up a settled `SettlementRecord` by 32-byte correlation ID. |
| `get_stats()` | None | Returns live vault balance, cumulative volume, fee totals, and pause flag. |

## Local Test & Build

Requires Rust stable with the `wasm32v1-none` target and `stellar-cli` (`v25.2.0+`):

```bash
cd contracts
cargo test --verbose
stellar contract build
```

## Deploying to Stellar Testnet

Run the automated deploy script (macOS / Linux / Git Bash on Windows):

```bash
bash contracts/scripts/deploy_testnet.sh
```

The script runs unit tests, compiles `anchor_vault.wasm`, funds Testnet `sepbox-admin` and `sepbox-operator` keys via Friendbot if missing, deploys the contract under alias `anchor_vault`, and prints the exact `initialize` invocation command.