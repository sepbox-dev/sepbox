#!/usr/bin/env bash
set -euo pipefail

# Builds and deploys the SEPBox anchor_vault Soroban contract to Stellar Testnet.
# Prerequisites: Rust (wasm32v1-none target) and stellar-cli v25.2.0+.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
NETWORK="${STELLAR_NETWORK:-testnet}"
ADMIN_IDENTITY="${SEPBOX_ADMIN_IDENTITY:-sepbox-admin}"
OPERATOR_IDENTITY="${SEPBOX_OPERATOR_IDENTITY:-sepbox-operator}"
CONTRACT_ALIAS="${SEPBOX_CONTRACT_ALIAS:-anchor_vault}"

if ! command -v stellar >/dev/null 2>&1; then
  echo "Error: stellar CLI not found. Install v25.2.0+ from https://developers.stellar.org/docs/tools/cli" >&2
  exit 1
fi

echo "==> [1/4] Running unit tests and building WASM artifact..."
cd "${CONTRACTS_DIR}"
cargo test --verbose
stellar contract build

WASM_PATH="${CONTRACTS_DIR}/target/wasm32v1-none/release/anchor_vault.wasm"
if [[ ! -f "${WASM_PATH}" ]]; then
  echo "Error: Expected compiled WASM at ${WASM_PATH}" >&2
  exit 1
fi

echo "==> [2/4] Ensuring funded Testnet identities (${ADMIN_IDENTITY},${OPERATOR_IDENTITY})..."
if ! stellar keys address "${ADMIN_IDENTITY}" >/dev/null 2>&1; then
  stellar keys generate "${ADMIN_IDENTITY}" --network "${NETWORK}" --fund
fi
if ! stellar keys address "${OPERATOR_IDENTITY}" >/dev/null 2>&1; then
  stellar keys generate "${OPERATOR_IDENTITY}" --network "${NETWORK}" --fund
fi

ADMIN_ADDR="$(stellar keys address "${ADMIN_IDENTITY}")"
OPERATOR_ADDR="$(stellar keys address "${OPERATOR_IDENTITY}")"

echo "==> [3/4] Deploying anchor_vault to ${NETWORK} (alias:${CONTRACT_ALIAS})..."
CONTRACT_ID="$(stellar contract deploy \
  --wasm "${WASM_PATH}" \
  --source-account "${ADMIN_IDENTITY}" \
  --network "${NETWORK}" \
  --alias "${CONTRACT_ALIAS}")"

echo "==> [4/4] Deployment complete!"
echo "  Network       : ${NETWORK}"
echo "  Contract ID   : ${CONTRACT_ID}"
echo "  Admin Address : ${ADMIN_ADDR}"
echo "  Operator Addr : ${OPERATOR_ADDR}"
echo ""
echo "Next step: Initialize with a Testnet SAC token address (e.g., native XLM SAC):"
echo "  NATIVE_TOKEN=\$(stellar contract id asset --asset native --network ${NETWORK})"
echo "  stellar contract invoke --id ${CONTRACT_ID} --source-account ${ADMIN_IDENTITY} --network${NETWORK} -- \\"
echo "    initialize --admin ${ADMIN_ADDR} --operator${OPERATOR_ADDR} --token \${NATIVE_TOKEN}"