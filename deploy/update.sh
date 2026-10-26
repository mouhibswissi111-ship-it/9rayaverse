#!/usr/bin/env bash
# 9rayaverse — update the server to the latest code on GitHub.
#   sudo bash /var/www/9rayaverse/deploy/update.sh
set -euo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "Lezem sudo"; exit 1; }

git config --global --add safe.directory "$APP_DIR" || true
cd "$APP_DIR"
/usr/local/bin/rayaverse-backup || true        # backup first, just in case
git pull --ff-only
mysql rayaverse < "$APP_DIR/deploy/migrations.sql"   # new columns/tables, keeps all data
(cd ws-server && npm install --omit=dev --no-audit --no-fund)
chown -R www-data:www-data "$APP_DIR"
systemctl restart rayaverse-ws
systemctl reload nginx
echo "✅ 9rayaverse mis à jour."
