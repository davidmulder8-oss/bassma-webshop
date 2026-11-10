#!/bin/sh
# Zorgt dat de vaste schijf beschrijfbaar is en start de server daarna zonder beheerdersrechten.
set -e
mkdir -p "${DATA_DIR:-/data}"
chown -R node:node "${DATA_DIR:-/data}"
exec su-exec node node server.js
