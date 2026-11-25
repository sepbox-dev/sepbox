# Security Policy

## Local Development Notice

**SEPBox is a local-first Stellar anchor simulator and chaos-testing workbench.** It is intentionally designed for testnet development, integration testing, and fault injection.

- **Never** deploy SEPBox to public production infrastructure with real mainnet funds, real Stellar mainnet signing seeds, or real customer PII.
- Default credentials in `.env.example` (`JWT_SECRET`, PostgreSQL password) are strictly for local Docker usage.

## Supported Versions

Security fixes are applied to the latest commit on the `main` branch.

| Branch / Version | Supported |
| :--- | :--- |
| `main` | Yes |
| Older snapshots | No |

## Reporting a Vulnerability

If you discover a security vulnerability in SEPBox (such as cryptographic signature bypasses in `SEP-10`, webhook HMAC verification flaws, SQL injection, or Soroban contract authorization bugs):

1. **Do not** open a public GitHub issue with exploit details.
2. Use GitHub's **Private Vulnerability Reporting** ("Report a vulnerability" under the repository's **Security** tab) to share reproduction steps, affected files, and impact.
3. We aim to acknowledge reports within **48 hours** and provide a timeline or fix within **7 days**.