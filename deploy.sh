#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/var/www/coffeemaker}"
BRANCH="${BRANCH:-main}"

if [[ ! -d "$DEPLOY_DIR/.git" ]]; then
    echo "Error: $DEPLOY_DIR is not a git checkout" >&2
    exit 1
fi

sudo -u nginx git -C "$DEPLOY_DIR" fetch origin "$BRANCH"
sudo -u nginx git -C "$DEPLOY_DIR" reset --hard "origin/$BRANCH"
sudo chown -R nginx:nginx "$DEPLOY_DIR"

echo "Deployed $(git -C "$DEPLOY_DIR" rev-parse --short HEAD) to $DEPLOY_DIR"
