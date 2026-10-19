#!/usr/bin/env bash
# backup.sh — nightly copy of everything that cannot be rebuilt.
#
#   acp.sqlite   every contractor, site spec, lead, review, subscription
#   media/       every job photo
#
# Published sites are not included: `node cli.mjs publish --all` rebuilds them
# from the database. install.sh puts this in /etc/cron.d/acp-backup at 03:17.
#
# Set BACKUP_REMOTE (e.g. user@host:/backups/acp) to also rsync off the box —
# a backup on the same disk does not survive the disk.
set -euo pipefail

APP=${APP:-/opt/azcontractorpro}
DATA=${DATA_DIR:-/var/lib/acp}
OUT=${BACKUP_DIR:-/var/backups/acp}
KEEP=${KEEP:-14}

mkdir -p "$OUT"
cd "$APP"
SNAP=$(node --disable-warning=ExperimentalWarning cli.mjs backup | awk '{print $1}')
STAMP=$(date +%F)
tar czf "$OUT/acp-$STAMP.tar.gz" -C "$(dirname "$SNAP")" "$(basename "$SNAP")" -C "$DATA" media
echo "wrote $OUT/acp-$STAMP.tar.gz ($(du -h "$OUT/acp-$STAMP.tar.gz" | cut -f1))"

ls -1t "$OUT"/acp-*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a --delete "$OUT"/ "$BACKUP_REMOTE"/
  echo "synced to $BACKUP_REMOTE"
fi
