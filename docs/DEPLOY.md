# Deploying on your VPS

About 20 minutes on a fresh Debian 12 or Ubuntu 22.04/24.04 box with 1 GB RAM
or more. Everything — the admin, the contractor sites, the sales site, the
API — runs here.

## 0. Before you start

**Decide three hostnames.** They end up in every site and email, so pick ones
you will keep.

| Setting | Example | What it is |
|---|---|---|
| `APP_HOST` | `app.azcontractorpro.net` | admin, contractor portal, API, Buy buttons |
| `SALES_HOSTS` | `azcontractorpro.net,www.azcontractorpro.net` | your own sales site |
| `SITES_DOMAIN` | `azcontractorpro.net` | every contractor site gets `<slug>.azcontractorpro.net` |

`SITES_DOMAIN` can be a separate domain (say `azcp.site`) if you would rather
keep contractor sites off your brand domain. Admin cookies use the `__Host-`
prefix, so subdomain sites cannot interfere with the admin session either way.

**DNS** (at your registrar or Cloudflare — if Cloudflare, set these to "DNS only",
grey cloud, so Caddy can get certificates):

| Type | Name | Value |
|---|---|---|
| A | `app` | your VPS IP |
| A | `@` | your VPS IP |
| A | `www` | your VPS IP |
| A | `*` | your VPS IP (the wildcard is what makes `<slug>.azcontractorpro.net` work) |

**Check nothing else owns ports 80 and 443:** `ss -lntp | grep -E ':(80|443)\s'`.
If Traefik (Coolify), nginx or Apache answers, read
[A box that already runs Coolify or nginx](#a-box-that-already-runs-coolify-or-nginx) first.

**Have ready:** an SMTP relay (Postmark, Amazon SES, Mailgun, Fastmail or a
Gmail app password — consumer Gmail caps around 100 mails a day), and your
Stripe secret key.

## 1. Install

```bash
sudo git clone https://github.com/drojo21/AZcontractorpro.netvps /opt/azcontractorpro
sudo APP_HOST=app.azcontractorpro.net \
     SALES_HOSTS=azcontractorpro.net,www.azcontractorpro.net \
     SITES_DOMAIN=azcontractorpro.net \
     ADMIN_EMAIL=you@example.com \
     bash /opt/azcontractorpro/deploy/install.sh
```

The installer: Node 22 and Caddy if missing; an `acp` system user; `/var/lib/acp`
for data; `npm ci`; `/opt/azcontractorpro/.env` with a fresh `SESSION_SECRET` and
first admin password (printed once at the end); the `acp` systemd service; the
Caddyfile with your hostnames (validated before reload); and a nightly backup at
03:17. It refuses to run if something other than Caddy holds ports 80/443, and
it is safe to re-run — it never overwrites `.env`.

**Check:** `curl -s https://app.azcontractorpro.net/api/health` →
`{"ok":true,"version":"3.0.0",…}`. The first request to a new hostname takes a
few seconds while Caddy gets its certificate.

## 2. Configure

```bash
sudo nano /opt/azcontractorpro/.env
sudo systemctl restart acp
```

| Variable | Set it to |
|---|---|
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `MAIL_FROM` | your relay. Until set, emails are only logged (`journalctl -u acp`) |
| `STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` | see [BILLING.md](BILLING.md) |
| `ANTHROPIC_API_KEY` | optional, turns on "Suggest copy with Claude" |
| `ADMIN_PASSWORD` | **delete the line** once you have signed in and changed the password |

Settings in the admin lists anything still missing under "Needs attention", and
can send a test email.

## 3. First sign-in

1. `https://app.azcontractorpro.net/admin/` — sign in, Settings → change your password.
2. Contractors → **New contractor** → type an ROC number → Add.
3. **Create website** → edit → watch the preview → Look & pages → Status: Active → **Publish**.
4. Open `https://<slug>.azcontractorpro.net/` — it has a certificate and is live.
5. Portal & history → **Give portal access** emails the contractor their PIN.

## 4. Move the existing sites over

The two clients in the old repos import directly:

```bash
cd /opt/azcontractorpro
sudo -u acp git clone https://github.com/drojo21/AzcontractorproVPs /tmp/old
sudo -u acp node cli.mjs import /tmp/old/clients --status active --publish
sudo -u acp node cli.mjs sites
```

Each `client.json` becomes a contractor (matched by ROC number, so re-running is
safe) and a published site at `<slug>.azcontractorpro.net`. Custom domains such
as `luisrojosmasonry.com` are attached but **not** made primary: they still point
at Netlify. When you are ready to switch one:

1. At the registrar, change its A records to this server (and remove the Netlify ones).
2. Admin → the site → Domains → **Verify**. It asks the domain for `/_acp/whoami`
   over plain HTTP and compares the answer with this server's id.
3. **Make primary.** The site rebuilds with that domain in its canonical URLs,
   sitemap and schema, and every other address redirects to it.

Then on the sales site's old Netlify project, and the old `acp-backend-tucson`
Netlify site, you can turn things off: the sales site is served from here, and
its Buy buttons and demo form now post here.

Leads from the old Google Sheets are not imported; download them from Sheets
if you want them.

## 5. Operations

```bash
journalctl -u acp -f                                   # live log
sudo systemctl restart acp                             # after editing .env
sudo -u acp node /opt/azcontractorpro/cli.mjs stats    # counts
sudo -u acp node /opt/azcontractorpro/cli.mjs pin <slug>             # new portal PIN
sudo -u acp node /opt/azcontractorpro/cli.mjs publish --all          # rebuild every site
sudo -u acp node /opt/azcontractorpro/cli.mjs user add ops@example.com 'long-password'
sudo -u acp node /opt/azcontractorpro/cli.mjs roc 337881             # licence lookup
```

**Upgrade:**

```bash
cd /opt/azcontractorpro && sudo -u acp git pull && sudo -u acp npm ci --omit=dev && sudo systemctl restart acp
sudo -u acp node cli.mjs publish --all     # only when engine/ changed and you want every site rebuilt
```

The database migrates itself on start.

## 6. Backups and restore

`deploy/backup.sh` runs nightly (`/etc/cron.d/acp-backup`), writing
`/var/backups/acp/acp-YYYY-MM-DD.tar.gz` with a consistent database snapshot and
every photo, keeping 14. Published sites are not in it — they rebuild from the
database. **Add an off-box copy:** put `BACKUP_REMOTE=user@backup-host:/backups/acp`
in the cron line (key-based SSH for the `acp` user).

Restore onto a fresh install:

```bash
sudo systemctl stop acp
sudo mkdir -p /tmp/restore && sudo tar xzf acp-2026-10-19.tar.gz -C /tmp/restore
sudo rm -f /var/lib/acp/acp.sqlite-wal /var/lib/acp/acp.sqlite-shm
sudo cp /tmp/restore/acp-*.sqlite /var/lib/acp/acp.sqlite
sudo cp -r /tmp/restore/media /var/lib/acp/
sudo chown -R acp:acp /var/lib/acp && sudo systemctl start acp
sudo -u acp node /opt/azcontractorpro/cli.mjs publish --all
```

## Certificates and Let's Encrypt limits

Caddy issues a certificate the first time each hostname is visited, after
asking the app (`/_acp/tls-ask`) whether it serves that name — so only real
sites and attached domains ever get one. Let's Encrypt allows 50 new
certificates per registered domain per week; every new `<slug>.azcontractorpro.net`
counts against `azcontractorpro.net`. Caddy falls back to ZeroSSL automatically
when Let's Encrypt refuses. If you expect more than ~40 new sites a week,
switch to one wildcard certificate: build Caddy with your DNS provider's module
(`xcaddy build --with github.com/caddy-dns/cloudflare`), and add a
`*.azcontractorpro.net { tls { dns cloudflare {env.CF_API_TOKEN} } import acp }`
block above the `https://` catch-all. Custom domains keep using on-demand.

## Docker instead of systemd

On a box where nothing else owns 80/443:

```bash
cp .env.example .env && nano .env      # also set APP_HOST, CADDY_SALES_HOSTS, ACME_EMAIL at the bottom
docker compose up -d --build
docker compose exec app node cli.mjs stats
```

Data lives in the `acp-data` volume (`docker volume ls` shows it as
`<project>_acp-data`); back it up with
`docker run --rm -v <project>_acp-data:/v -v "$PWD":/out alpine tar czf /out/acp.tgz -C /v .`.

## A box that already runs Coolify or nginx

Then something else terminates TLS, and the one thing it must still do is give
contractor sites certificates for hostnames it has not seen before.

- **Coolify / Traefik:** deploy this repo with the Dockerfile build pack (port
  8787, persistent volume at `/var/lib/acp`, environment from `.env.example`).
  Add `APP_HOST`, the sales hosts and `*.azcontractorpro.net` as the resource's
  domains (the wildcard needs Coolify's DNS-challenge setup). Each contractor's
  **custom** domain must also be added to the resource by hand, because Traefik
  has no equivalent of Caddy's on-demand certificates.
- **nginx:** proxy every hostname to `127.0.0.1:8787` with `proxy_set_header Host
  $host` and `X-Forwarded-For`/`-Proto`, and use certbot per domain. Simpler: move
  nginx off 80/443 and let Caddy front everything.

Either way, keep `TRUST_PROXY=true` only when a proxy you control sits in front;
if port 8787 is ever reachable directly, set it to `false`.
