# The seven repos, summarized

Snapshot as of October 2026, read from each repo's default branch. This is what
existed before this repo, what each piece does, and what the new VPS platform
keeps, replaces or leaves alone.

## At a glance

| Repo | What it is | Stack | Runs on | Status |
|---|---|---|---|---|
| `azcontractorprowebsite` | The live sales site (azcontractorpro.net): pricing, free-demo form, Stripe Buy buttons | One static HTML page + assets | Netlify | Live. Demo form still posts to Google Apps Script; Buy buttons point at `acp-backend-tucson.netlify.app/api/checkout` |
| `Az-Contractor-Pro` | The *older* sales page and order form, plus `payment-server.js` (Stripe Checkout for $250 / $120 / $370 packages, emails a bolt.new prompt, reports orders to the CRM) | Node + Express | Any Node host | Superseded by the site above. Its price list disagrees with it |
| `Azcontractorpro` | The Netlify-era platform: `clients/<id>/client.json` → Python/Jinja builder → Netlify, plus Netlify Functions (deploy, intake, Stripe tiers + Connect) and Apps Script (leads, photos in Drive, demos) | Python, Netlify Functions, Apps Script | GitHub Actions + Netlify + Google | Working but spread across four services. Default branch is `Main1` |
| `AzcontractorproVPs` | The same platform moved onto a VPS: one Node server (SQLite) replaces Apps Script and the Netlify backend — leads, gallery, contractor portal, demo pipeline, publisher, ops console | Node 22 + SQLite, Python builder, Caddy/systemd or Docker/Coolify | Your VPS, **but sites are still hosted on Netlify** | Most complete backend. Still uses Square links in config and Netlify for hosting |
| `CRM-Az-Contractor` | Client CRM: contractors, pipeline stages, websites, leads, orders, Stripe webhooks, Claude token usage per contractor | Node 22 + Express + `node:sqlite` | Any host with a disk | Separate app with its own database and login |
| `acp-backend-tucson` | The newest site generator: one `ClientSpec` → a 17-page site with JSON-LD, Arizona ROC licence-display checks, contrast checks, no fabricated reviews. CLI, `builder.html`, Netlify deploy function | Plain ES modules, zero dependencies | Netlify | The best generator in the set; replaced three older ones |
| `AZcontractorpro.netvps` | **This repo.** Everything above on one VPS | Node 22 + SQLite + Caddy | Your VPS | New |

## Each repo in more detail

### azcontractorprowebsite — the sales site
- `index.html` (74 KB, self-contained) on the AZ Contractor Pro design system:
  hero, "how it works", three tiers ($497 + $49/mo Starter, $997 + $99/mo Pro,
  $1,997 + $199/mo Full Marketing Kit), FAQ, free-demo form.
- Buy buttons → `https://acp-backend-tucson.netlify.app/api/checkout?tier=…`
  (Stripe Checkout: setup fee now, monthly after 14 days).
- Demo form → Google Apps Script `…/exec` with `client_id=azcontractorpro`.
- `thanks.html` after checkout, Stripe customer-portal link in the footer.
- **In the new platform:** copied to `public/sales/` and served by the VPS.
  The demo form now posts to `/api/demo` and the Buy buttons to `/api/checkout`
  on the same server, so neither Apps Script nor the Netlify backend is needed.

### Az-Contractor-Pro — the old order form + payment server
- `az-contractor-pro.html`: earlier marketing page with an 8-field order form.
- `payment-server.js`: `POST /api/create-checkout-session` (server-side
  prices $250 website / $120 social / $370 complete), Stripe webhook with
  signature checks and duplicate-delivery protection, customer + admin emails,
  reports orders to the CRM. 8 tests.
- After payment it emails a **bolt.new prompt** — a person still builds the site by hand.
- `REBRAND-SUMMARY.md` still talks about Square and docs that are not in the repo.
- **In the new platform:** retired. Its price list conflicts with the live site,
  and paying now produces a real site instead of a prompt. Its webhook
  hardening (signature, idempotency, retry-on-failure) carried over.

### Azcontractorpro — the Netlify-era monorepo
- `clients/<id>/client.json` is the per-contractor input (2 clients:
  Luis Rojo's Masonry, Creative Construction Management).
- `builder/build_site.py` + Jinja templates: "lite" (one page) or "full" (18 pages).
- `backend/` Netlify Functions: `/api/deploy` (Netlify sites + claim links),
  `/api/intake` (admin console, commits to GitHub), `/api/checkout`,
  `/api/stripe-webhook`, `/api/connect-onboard` + `/api/pay` (Stripe Connect so
  homeowners can pay contractors), Blobs store.
- `apps-script/`: lead router, Drive photo galleries, demo pipeline, Stripe sheet.
- `core/`: schema, 15-trade table, **ROC active-licence index (58k licences)**, parity tests.
- `data/`: processed ROC rosters (186 Tucson, 1,652 statewide buildable prospects).
- `docs/STRIPE.md`: live Stripe setup — products `acp_starter/pro/kit`, lookup keys
  `acp_<tier>_setup` / `acp_<tier>_monthly`, customer portal.
- **In the new platform:** the Stripe price lookup keys are reused as-is (no
  Stripe changes needed), the ROC index is reused for lookups and the licence
  gate, and `client.json` files import with `node cli.mjs import`.

### AzcontractorproVPs — the first VPS move
- `server/`: a dependency-light Node server on SQLite: `/api/lead` (dedupe,
  honeypot, rate limit, email), `/api/gallery`, `/portal/` (contractor PIN
  login, leads, CSV, photo upload re-encoded with sharp to strip EXIF),
  `/api/claimed`, free-demo runner, `/api/deploy` to Netlify, intake + ops
  consoles, `cli.mjs` (PINs, backups), Caddy/systemd installer, Docker and
  Coolify recipes. 4 test suites.
- Sites are still **built in Python and hosted on Netlify**; the server only
  publishes to Netlify and answers their forms.
- **In the new platform:** its patterns (PIN portal, EXIF-stripping photo
  pipeline, lead dedupe, Caddy + systemd installer, backups) are kept, and the
  Netlify hop is gone: sites are built by the JS engine and served from the VPS.

### CRM-Az-Contractor — the client CRM
- Contractors with pipeline stages (Prospect → Demo → Contacted → Paid → Live,
  Lost), notes/activity timeline, follow-ups, ROC CSV import, websites, per-
  contractor lead capture URLs, orders from Stripe, Claude token usage and
  cost per contractor with a monthly budget. Users + sessions + API keys. 30 tests.
- **In the new platform:** the pipeline, activity timeline, follow-ups and
  token-usage accounting are built into the same app and database, so a lead,
  a payment and a publish move a contractor through the pipeline without an
  integration between two servers.

### acp-backend-tucson — the site engine
- `lib/`: `spec.mjs` (accepts every legacy input shape), `trades.mjs` (15 trades
  with Arizona-specific notes and FAQs), `theme.mjs` (accessible colour tokens),
  `copy.mjs`, `schema.mjs` (one connected JSON-LD graph), `pages.mjs`,
  `site.mjs`, `compliance.mjs` (ROC display per A.R.S. § 32-1124(B)(4) and ROC
  policy 2021.02, fabricated-review guard per 16 CFR 465, broken links,
  placeholders, titles, contrast), `roster.mjs` (ROC CSV → specs). 29 tests.
- `netlify/functions/copy.mjs`: optional Claude copy enrichment that can only
  replace named fields and never reviews.
- **In the new platform:** vendored unchanged into `engine/` except for the
  lead-form script (now posts to the site's own host and reports failures) and
  is the one generator.

## Problems found while reading, and what this repo does about them

| Problem | Where | Resolution here |
|---|---|---|
| Three generators (Python/Jinja, `builder.html`, JS engine) | Azcontractorpro, AzcontractorproVPs, acp-backend-tucson | One: `engine/` |
| Two price lists ($250/$120/$370 vs $497+$49 / $997+$99 / $1,997+$199) | Az-Contractor-Pro vs azcontractorprowebsite | The live site's tiers and its existing Stripe lookup keys. Set in `config/platform.json` |
| Leads, photos, demos split across Apps Script, Drive, Sheets, Netlify Blobs | Azcontractorpro | One SQLite file on the VPS |
| Sites hosted on Netlify even in the "VPS" repo; claimed sites can no longer be updated (403) | AzcontractorproVPs | Sites served from the VPS with automatic HTTPS for subdomains and custom domains; no claim step to lose access through |
| CRM is a second server with a second login and database | CRM-Az-Contractor | Built in |
| Sales-site form still posts to Apps Script; Buy buttons go to a Netlify backend | azcontractorprowebsite | Both now hit this server |
| Square links still in config/docs | AzcontractorproVPs, Az-Contractor-Pro | Stripe only |
| `payment-server.js` emails a bolt.new prompt after payment | Az-Contractor-Pro | Payment activates the real site (removes the demo banner) |

## Not carried over (yet)

- **Stripe Connect "Make a payment" for homeowners** (`connect-onboard.js`,
  `pay.js` in Azcontractorpro). Still works where it is; porting it is a
  contained follow-up once a contractor actually wants it.
- **Netlify claim links.** Sites live on your VPS, so there is nothing to claim.
  A contractor who leaves can download their site as a zip from the admin.
- **The Python builder's "lite" one-page tier.** The engine builds multi-page
  sites; Starter turns the extra page types off instead (see `config/platform.json`).
