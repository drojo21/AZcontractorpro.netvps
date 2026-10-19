#!/usr/bin/env bash
# install.sh — AZ Contractor Pro on a fresh Debian/Ubuntu VPS.
#
#   sudo git clone https://github.com/drojo21/AZcontractorpro.netvps /opt/azcontractorpro
#   sudo APP_HOST=app.azcontractorpro.net SITES_DOMAIN=azcontractorpro.net \
#        SALES_HOSTS=azcontractorpro.net,www.azcontractorpro.net \
#        ADMIN_EMAIL=you@example.com bash /opt/azcontractorpro/deploy/install.sh
#
# Installs Node 22 and Caddy, creates the `acp` user and /var/lib/acp, writes
# .env with fresh secrets and a first admin password (printed once), installs
# the systemd unit, renders the Caddyfile, and schedules the nightly backup.
# Safe to re-run after `git pull`: it never overwrites .env.
set -euo pipefail

APP=${APP:-/opt/azcontractorpro}
DATA=${DATA:-/var/lib/acp}
APP_HOST=${APP_HOST:-}
SITES_DOMAIN=${SITES_DOMAIN:-}
SALES_HOSTS=${SALES_HOSTS:-}
ADMIN_EMAIL=${ADMIN_EMAIL:-}
ACME_EMAIL=${ACME_EMAIL:-$ADMIN_EMAIL}

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo)"; exit 1; }
[ -f "$APP/server.mjs" ] || { echo "repo not found at $APP — clone it there first"; exit 1; }
[ -n "$APP_HOST" ] || { echo "set APP_HOST, e.g. APP_HOST=app.azcontractorpro.net"; exit 1; }
[ -n "$ADMIN_EMAIL" ] || { echo "set ADMIN_EMAIL (the first admin login)"; exit 1; }

# Something else on 80/443 (Coolify's Traefik, nginx) would fight Caddy.
if command -v ss >/dev/null && ss -lntp 2>/dev/null | grep -E ':(80|443)\s' | grep -vq caddy; then
  echo "!! ports 80/443 are owned by something other than Caddy:"
  ss -lntp | grep -E ':(80|443)\s' || true
  echo "!! see docs/DEPLOY.md → 'A box that already runs Coolify or nginx'. Stopping."
  exit 1
fi

echo "== packages"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg rsync openssl >/dev/null

if ! command -v node >/dev/null || [ "$(node -p 'const [a,b]=process.versions.node.split(".").map(Number);(a>22||(a===22&&b>=13))?1:0')" != "1" ]; then
  echo "== node 22"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq && apt-get install -y -qq nodejs >/dev/null
fi
echo "   node $(node --version)"

if ! command -v caddy >/dev/null; then
  echo "== caddy"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi
echo "   $(caddy version | head -1)"

echo "== user and directories"
id -u acp >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin acp
mkdir -p "$DATA" /var/backups/acp /var/log/caddy
chown -R acp:acp "$APP" "$DATA" /var/backups/acp
chown caddy:caddy /var/log/caddy 2>/dev/null || true

echo "== node modules"
sudo -u acp bash -c "cd '$APP' && npm ci --omit=dev --no-audit --no-fund"

echo "== .env"
if [ ! -f "$APP/.env" ]; then
  PASS=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)
  PUBLIC_IP=$(curl -fsS4 --max-time 5 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  cp "$APP/.env.example" "$APP/.env"
  sed -i \
    -e "s|^DATA_DIR=.*|DATA_DIR=$DATA|" \
    -e "s|^APP_URL=.*|APP_URL=https://$APP_HOST|" \
    -e "s|^SALES_HOSTS=.*|SALES_HOSTS=$SALES_HOSTS|" \
    -e "s|^SITES_DOMAIN=.*|SITES_DOMAIN=$SITES_DOMAIN|" \
    -e "s|^PUBLIC_IP=.*|PUBLIC_IP=$PUBLIC_IP|" \
    -e "s|^ADMIN_EMAIL=.*|ADMIN_EMAIL=$ADMIN_EMAIL|" \
    -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$PASS|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" \
    "$APP/.env"
  chown acp:acp "$APP/.env"; chmod 600 "$APP/.env"
  NEW_ADMIN_PASS=$PASS
else
  echo "   keeping existing .env"
fi

echo "== systemd"
sed "s|/opt/azcontractorpro|$APP|g; s|/var/lib/acp|$DATA|g" "$APP/deploy/acp.service" > /etc/systemd/system/acp.service
systemctl daemon-reload
systemctl enable --now acp >/dev/null
systemctl restart acp

echo "== caddy config"
SALES_SPACED=$(echo "$SALES_HOSTS" | tr ',' ' ')
sed -e "s|{\$APP_HOST}|$APP_HOST|" \
    -e "s|{\$CADDY_SALES_HOSTS}|$SALES_SPACED|" \
    -e "s|{\$ACME_EMAIL}|$ACME_EMAIL|" \
    -e "s|{\$ACP_UPSTREAM:127.0.0.1:8787}|127.0.0.1:8787|g" \
    "$APP/deploy/Caddyfile" > /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy || systemctl restart caddy

echo "== nightly backup"
cat > /etc/cron.d/acp-backup <<CRON
# AZ Contractor Pro: database + photos, 03:17 every night
17 3 * * * acp DATA_DIR=$DATA APP=$APP $APP/deploy/backup.sh >> /var/log/acp-backup.log 2>&1
CRON
touch /var/log/acp-backup.log && chown acp:acp /var/log/acp-backup.log
chmod +x "$APP/deploy/backup.sh"

sleep 2
echo
if curl -fsS http://127.0.0.1:8787/api/health >/dev/null; then echo "app is up."; else echo "!! app did not answer — journalctl -u acp -n 50"; fi
echo
echo "Next:"
echo "  1. DNS: A records for $APP_HOST${SALES_HOSTS:+, ${SALES_HOSTS//,/, }}${SITES_DOMAIN:+ and *.$SITES_DOMAIN} → this server."
echo "  2. Open https://$APP_HOST/admin/ and sign in as $ADMIN_EMAIL."
if [ -n "${NEW_ADMIN_PASS:-}" ]; then
  echo "     First password: $NEW_ADMIN_PASS"
  echo "     (shown once — change it in Settings, then delete ADMIN_PASSWORD from $APP/.env)"
fi
echo "  3. Fill SMTP_* and STRIPE_* in $APP/.env, then: systemctl restart acp"
echo "  4. Point the Stripe webhook at https://$APP_HOST/api/stripe/webhook (docs/BILLING.md)."
