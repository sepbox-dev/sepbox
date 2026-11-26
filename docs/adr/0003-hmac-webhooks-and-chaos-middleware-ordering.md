# ADR-0003: Timestamped HMAC-SHA256 Webhooks and Protected Chaos Middleware Ordering

- **Status:** Accepted
- **Scope:** `engine/app/chaos.py`, `engine/app/inspector.py`, `engine/app/webhooks.py`, `engine/app/main.py`

## Context

SEPBox exists to let wallet teams deliberately break their own Stellar integrations—injecting `503` outages, slow responses, or truncated JSON—while simultaneously observing live traffic and replaying webhooks from the `inspector/` workbench.

If chaos fault injection intercepted `/admin/*` or `/health`, enabling a global fault rule would lock the developer out of the Inspector UI and trip Docker healthchecks. Similarly, if the traffic ring buffer recorded `/admin/*` polling from the Inspector UI, real Stellar protocol calls would be buried under noise.

## Decision

1. **Protected control plane:** Chaos middleware explicitly bypasses `/health` and `/admin/*` routes at all times. Fault rules only match configured protocol prefixes (`/sep`, `/sep24`, `/sep38`, `/sep12`, `/auth`) and tag injected responses with `X-SEPBox-Chaos-Injected: true`.
2. **Noise-free traffic ring buffer:** The traffic inspector middleware runs outside the chaos layer so it captures actual injected status codes and added latency, while ignoring `/admin/*` and `OPTIONS` CORS preflight requests.
3. **Timestamped HMAC-SHA256 webhook signatures with replay:** Outbound `sep24.transaction.updated` webhooks are signed over `<unix_timestamp>.<raw_json_body>` using each subscription's per-endpoint secret (`X-SEPBox-Signature: t=<ts>,v1=<hex_digest>`). Every delivery attempt is persisted in PostgreSQL so failed deliveries can be inspected and replayed without re-running the underlying `SEP-24` transaction.

## Consequences

- **Positive:** The Inspector workbench stays responsive even under 100% fault injection, traffic logs reflect genuine wallet/client activity, and wallet teams can verify real replay-resistant webhook signature validation locally.
- **Trade-off:** The traffic log is kept in a bounded in-memory ring buffer (`200` entries) rather than PostgreSQL to avoid write amplification on every request; restarting the engine container clears the live stream while preserving all persisted KYC, quote, transaction, and webhook records.