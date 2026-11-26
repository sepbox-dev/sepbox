# ADR-0001: Fixed-Precision Decimal Math and Row-Locked SEP-24 State Transitions

- **Status:** Accepted
- **Scope:** `engine/app/sep38.py`, `engine/app/sep24.py`, `engine/app/models.py`

## Context

Stellar assets operate with **7 decimal places of precision** (stroops, `10^-7`). Simultaneously, `SEP-24` interactive deposit and withdrawal flows progress through strict linear state machines (`incomplete` -> `pending_user_transfer_start` -> `pending_anchor` -> `pending_stellar` -> `completed`).

In naive Python/FastAPI simulators, two failure modes regularly occur:
1. Using IEEE-754 `float` for `SEP-38` FX pricing introduces rounding drift that causes wallet reconciliation tests to fail inconsistently.
2. Concurrent `/advance` or status-update calls against the same transaction can race, skipping states or emitting duplicate webhook transitions.

## Decision

1. **Fixed-precision `decimal.Decimal` everywhere:** All `SEP-38` rates, fees, sell/buy amounts, and `SEP-24` balances are computed using `Decimal` quantized to 7 decimal places (`0.0000001`) and persisted using PostgreSQL `Numeric` columns—never `float`.
2. **Row-level locking on state transitions:** Advancing a `SEP-24` transaction acquires a PostgreSQL row lock (`SELECT ... FOR UPDATE`) before validating the current state, transitioning to the next deterministic state, and committing.
3. **Quote-linked deposits:** When a `SEP-24` deposit references a `SEP-38` `quote_id`, the engine verifies ownership, expiry, and asset alignment before binding the quote to the transaction record.

## Consequences

- **Positive:** Deterministic financial math across every test run and safe concurrent state progression under parallel wallet polling or test harnesses.
- **Trade-off:** Requires a real PostgreSQL instance (provided automatically via Docker Compose and GitHub Actions service containers) rather than an in-memory SQLite mock, because SQLite does not support row-level `FOR UPDATE` locking semantics.