#!/usr/bin/env bash
# Devcontainer provisioning for the EPS dApp.
# Pins: Node 20 (from base image), pnpm, Solana CLI, Stripe CLI.
set -euo pipefail

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" != "20" ]; then
  echo "WARNING: expected Node 20, found $(node -v)" >&2
fi

# pnpm (pinned major) via corepack
echo "==> Enabling pnpm via corepack"
corepack enable
corepack prepare pnpm@9 --activate
pnpm --version

# Solana CLI (stable)
echo "==> Installing Solana CLI"
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Stripe CLI
echo "==> Installing Stripe CLI"
STRIPE_VERSION="1.21.8"
curl -sSL "https://github.com/stripe/stripe-cli/releases/download/v${STRIPE_VERSION}/stripe_${STRIPE_VERSION}_linux_x86_64.tar.gz" \
  | sudo tar -xz -C /usr/local/bin stripe

echo "==> Toolchain ready:"
node -v
pnpm -v
solana --version || true
stripe version || true
