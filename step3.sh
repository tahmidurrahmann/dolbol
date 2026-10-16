#!/usr/bin/env bash
set -euo pipefail

if [ -f "./package.json" ] && [ -d "./src" ]; then
  PROJECT_DIR="."
elif [ -d "./trip-hub" ]; then
  PROJECT_DIR="./trip-hub"
else
  echo "ERROR: Run step3.sh either inside trip-hub/ or from its parent directory." >&2
  exit 1
fi

echo "==> Applying Step 3 (Money Core: Expenses, Integer Shares, Balances, Settlements & Per-Day View) to ${PROJECT_DIR} ..."
mkdir -p \
  "${PROJECT_DIR}/docs" \
  "${PROJECT_DIR}/src/lib/__tests__" \
  "${PROJECT_DIR}/src/components" \
  "${PROJECT_DIR}/src/messages" \
  "${PROJECT_DIR}/src/app/trips/[slug]"

echo "==> Step 3 files written successfully to ${PROJECT_DIR}"
