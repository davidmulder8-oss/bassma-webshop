#!/bin/bash
# Start de webshop in de codespace (alleen voor testen). Geen geheimen in dit bestand.
cd "$(dirname "$0")/.."
export PUBLIC_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
export PORT=3000
export DATA_DIR="$PWD/data"
pkill -f "node server.js" 2>/dev/null
nohup node server.js > /tmp/bassma-server.log 2>&1 &
echo "Bassma gestart op $PUBLIC_URL"
