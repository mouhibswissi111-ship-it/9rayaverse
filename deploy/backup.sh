#!/usr/bin/env bash
# 9rayaverse — daily backup of the database and uploaded files (keeps 14 days).
set -euo pipefail
APP_DIR="${APP_DIR:-/var/www/9rayaverse}"
DEST=/var/backups/rayaverse
STAMP="$(date +%F_%H%M)"
mkdir -p "$DEST"
mysqldump --single-transaction --default-character-set=utf8mb4 rayaverse | gzip > "$DEST/db_$STAMP.sql.gz"
tar -czf "$DEST/uploads_$STAMP.tar.gz" -C "$APP_DIR" uploads
find "$DEST" -type f -mtime +14 -delete
echo "Backup: $DEST/*_$STAMP.*"
