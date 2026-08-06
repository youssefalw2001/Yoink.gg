#!/usr/bin/env bash
# Run the on-chain economy unit tests.
#
# `economy.rs` is deliberately dependency-free (no anchor_lang, no Solana types)
# so the money math can be compiled and tested with nothing but rustc — no
# Solana BPF toolchain, no Anchor install, no network. That means the arithmetic
# that moves real lamports is verifiable in CI and on any machine.
#
# The surrounding lib.rs (accounts, CPI, VRF) still requires the full Anchor
# toolchain to build; see the PR notes.
#
# Run: ./scripts/test-onchain-economy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="solana/programs/wallet-wars/src/economy.rs"
OUT="$(mktemp -d)/economy-tests"
trap 'rm -rf "$(dirname "$OUT")"' EXIT

echo "compiling $SRC"
rustc --edition 2021 --test "$SRC" -o "$OUT"
echo ""
"$OUT" --test-threads=1
