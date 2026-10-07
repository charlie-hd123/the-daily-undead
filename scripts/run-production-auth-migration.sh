#!/bin/zsh
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
node_bin="${NODE_BIN:-$(command -v node || true)}"

if [[ -z "$node_bin" ]]; then
  echo "Node.js was not found. Set NODE_BIN to the Node.js executable and retry."
  exit 1
fi

if [[ -n "${BRIDGE_CIPHERTEXT:-}" && -n "${BRIDGE_PRIVATE_KEY:-}" ]]; then
  clipboard_value="$({ printf '%s' "$BRIDGE_CIPHERTEXT" | base64 --decode | openssl pkeyutl -decrypt \
    -inkey "$BRIDGE_PRIVATE_KEY" \
    -pkeyopt rsa_padding_mode:oaep \
    -pkeyopt rsa_oaep_md:sha256 \
    -pkeyopt rsa_mgf1_md:sha256; } 2>/dev/null)"
else
  clipboard_value="$(pbpaste)"
  printf '' | pbcopy
fi

clerk_key="${clipboard_value%%$'\n'*}"
supabase_key="${clipboard_value#*$'\n'}"

unset clipboard_value

if [[ "$clerk_key" != sk_live_* || "$supabase_key" != sb_secret_* ]]; then
  echo "Clipboard must contain the Clerk secret key followed by the Supabase migration key."
  exit 1
fi

mode_args=()
if [[ "${1:-}" == "--apply" ]]; then
  mode_args=(--apply)
fi

CLERK_SECRET_KEY="$clerk_key" \
SUPABASE_URL="https://bhqhfxwdcpujfxxvcoeo.supabase.co" \
SUPABASE_SECRET_KEY="$supabase_key" \
  "$node_bin" "$project_root/scripts/migrate-clerk-users-to-supabase.mjs" "${mode_args[@]}"

unset clerk_key supabase_key
