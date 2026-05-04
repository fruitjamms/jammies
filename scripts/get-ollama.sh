#!/usr/bin/env bash
set -euo pipefail

echo "installing ollama for your platform :)"
echo "using the official installer from https://ollama.com/"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "curl is required to install ollama. please install curl and try again!" >&2
  exit 1
fi

echo "ollama install finished"
echo "now run npm run pull-model"
