# AZ Contractor Pro — the whole business on one VPS

A website creator and the services around it, for licensed Arizona contractors,
running on a server you own. One Node process, one SQLite file, Caddy in front.

```
                               your VPS
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  Caddy — HTTPS for every hostname, certificates issued on first visit    │
 │    app.azcontractorpro.net        azcontractorpro.net    *.azcontractorpro.net
 │    admin · portal · API           your sales site        + custom domains │
 │                     └──────────────┬─────────────────────┘               │
 │  node server.mjs                   ▼                                     │
 │    website creator ── engine/ build ── checks ── release on disk ── serve │
 │    leads · reviews · photos · contractor portal · free demos · Stripe     │
 │    CRM pipeline · AI copy (optional) · backups                            │
 │                                                                          │
 │  /var/lib/acp   acp.sqlite · sites/<slug>/releases/… · media/ · backups/   │
 └──────────────────────────────────────────────────────────────────────────┘
```

No Netlify, no Google Apps Script, no Sheets, no Drive, no GitHub Actions in
the request path. [docs/REPOS.md](docs/REPOS.md) summarizes the seven repos this
replaces and what came from each.

## What it does

**Website creator** (`/admin/` → Websites)
- Start from an ROC number: the Arizona active-licence list (58k licences) fills
  in the name, licence class, city and trade.
- Edit the site in a form, see the real build in a live preview as you type,
  desktop or phone width, every page.
- Every build is checked before it can go live: ROC number on the home page and
  outside the footer (A.R.S. § 32-1124(B)(4), ROC policy 2021.02), no invented
  reviews or ratings (16 CFR 465), no broken links or placeholders, valid
  JSON-LD, titles, alt text, form labels, 4.5:1 contrast. Failures block publishing.
- Publishing writes an immutable release; roll back to any of the last five.
  Download the live site as a zip.
- 12–18 page sites: home, a page per service, a page per city, gallery,
  reviews, about, FAQ, contact, sitemap, robots, 404. Fifteen trades, each with
  Arizona-specific copy (caliche, monsoon, 115°F design days, hard water).
- Optional: "Suggest copy with Claude" rewrites the headline and about text;
  it cannot touch reviews or facts, and its cost is logged per contractor.

**Hosting**
- Every site is live at `<slug>.<SITES_DOMAIN>` the moment it is published.
- Custom domains: add, point DNS, press Verify, make primary. HTTPS is issued
  automatically and every other address 301s to the primary one.
- Demo sites carry a "Keep this site" banner and `noindex`; drafts are only
  visible at a noindex preview address.

**Services for contractors**
- **Lead capture**: the quote form on every site posts to its own host. Leads
  are de-duplicated, rate limited, stored, emailed to the contractor, and kept
  in their portal. If the server cannot be reached, the form says so and shows
  the phone number instead of a false "thanks".
- **Contractor portal** (`/portal/`, site + 6-digit PIN): leads with status and
  notes, CSV download, job photo uploads, review approvals, and self-service
  edits to services, cities, hours and offers — each edit republishes through the
  same checks.
- **Job photos**: re-encoded on upload, which strips EXIF/GPS; become the
  gallery and the hero.
- **Real reviews**: every site has `/_acp/review/<slug>`. Customers leave a
  review, the contractor approves it, it is published with honest
  `aggregateRating` markup.
- **Free demo**: the sales-site form looks up the ROC licence, builds and
  publishes a demo, and emails the link with Buy buttons — in about a second.
  Unpaid demos expire after 30 days.
- **Billing**: Stripe Checkout (setup fee now, monthly after 14 days) using the
  lookup keys already in your Stripe account. Paying activates the site, removes
  the banner and moves the contractor to "Paid".
- **Setup sheet** (`thanks.html`, linked from the receipt): after paying, the
  contractor picks services, cities, hours and a domain. The site rebuilds through
  the same checks, they get an email with the DNS records and their portal PIN, and
  the domain becomes the primary address by itself once it reaches the server
  (checked hourly). A buyer who skipped the demo enters their ROC number and trade
  and the site is built then.

**CRM** (`/admin/` → Contractors): pipeline Prospect → Demo → Contacted → Paid →
Live (and Lost) that moves on its own as demos publish and payments land;
timeline of calls, notes, leads, publishes and payments; follow-up dates.

## Quick start (your laptop)

```bash
npm install
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm start
# → http://localhost:8787/admin/
npm test        # 87 tests: engine, hosting, services, billing, onboarding
```

Sites are reachable at `http://localhost:8787/s/<slug>/` until DNS exists.
Emails are printed to the console until SMTP is configured.

## On your VPS

```bash
sudo git clone https://github.com/drojo21/AZcontractorpro.netvps /opt/azcontractorpro
sudo APP_HOST=app.azcontractorpro.net \
     SALES_HOSTS=azcontractorpro.net,www.azcontractorpro.net \
     SITES_DOMAIN=azcontractorpro.net \
     ADMIN_EMAIL=you@example.com \
     bash /opt/azcontractorpro/deploy/install.sh
```

Full walkthrough, DNS, Stripe, migrating the existing sites, backups and
upgrades: **[docs/DEPLOY.md](docs/DEPLOY.md)**. Stripe: **[docs/BILLING.md](docs/BILLING.md)**.

## Layout

| Path | What |
|---|---|
| `server.mjs` | entry point; routes by hostname |
| `cli.mjs` | `user`, `sites`, `pin`, `publish`, `import`, `roc`, `backup`, `mail`, `sweep`, `stats` |
| `engine/` | the site generator and checker, from `acp-backend-tucson/lib` (no dependencies) |
| `src/sites.mjs` | compose spec → build → check → release on disk → serve; domains |
| `src/leads.mjs` `src/reviews.mjs` `src/photos.mjs` | contractor services |
| `src/demo.mjs` `src/billing.mjs` `src/ai.mjs` | free demos, Stripe, Claude copy |
| `src/onboard.mjs` | ROC lookup for the sales form; the post-purchase setup sheet; custom-domain promotion |
| `src/contractors.mjs` | CRM pipeline and timeline |
| `src/routes/` | `public` (forms, webhooks, TLS ask), `admin`, `portal` |
| `public/admin/` `public/portal/` | the two apps — plain ES modules, no build step |
| `public/sales/` | azcontractorpro.net, wired to this server |
| `data/roc-index.json.gz` | Arizona ROC active licences (snapshot 2026-10-20, 58,444) |
| `scripts/build-roc-index.mjs` | rebuilds that file from the Registrar's posting-list CSV |
| `deploy/` | Caddyfile, systemd unit, installer, nightly backup |
| `config/platform.json` | brand, tiers, prices shown, page presets, demo length |

## Things that will bite you

- **Back up `/var/lib/acp`.** The installer schedules `deploy/backup.sh` nightly;
  set `BACKUP_REMOTE` so a copy leaves the box.
- **Let's Encrypt allows 50 new certificates per registered domain per week.**
  Each new `<slug>.azcontractorpro.net` that gets visited uses one. Caddy falls
  back to ZeroSSL automatically; past ~40 new sites a week, switch to a wildcard
  certificate (docs/DEPLOY.md).
- **Changing `SITES_DOMAIN` or `APP_URL` later** changes every site's address and
  every link in emails already sent. Pick them once.
- **The ROC list is a snapshot.** Download the "ROC Posting List" CSV from azroc.gov
  every month or so and run
  `node scripts/build-roc-index.mjs <file.csv>`, then restart the service. The script
  refuses a download whose row count, header or row numbers do not add up, and
  prints any field it had to repair.
