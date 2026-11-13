# Billing with Stripe

Same Stripe account, products and prices as before (`docs/STRIPE.md` in the
Azcontractorpro repo). Only the server the Buy buttons and webhook talk to changes.

```
Buy button (sales site, demo banner, demo email, portal)
   │  GET /api/checkout?tier=pro&site=<slug>
   ▼
Stripe Checkout — setup fee today, monthly plan after MONTHLY_START_DELAY_DAYS
   │
   ▼  POST /api/stripe/webhook  (signature checked, each event applied once)
checkout.session.completed   site → active (banner and noindex gone), rebuilt,
                             contractor → Paid → Live, email to ADMIN_EMAIL
invoice.paid                 subscription active
invoice.payment_failed       subscription past_due, email to you (Stripe retries)
customer.subscription.*      plan / cancel-at-period-end / canceled → recorded;
                             a canceled site stays live until you suspend it
```

## Setup (about 10 minutes)

1. **Prices.** The code finds prices by lookup key: `acp_starter_setup`,
   `acp_starter_monthly`, `acp_pro_setup`, `acp_pro_monthly`, `acp_kit_setup`,
   `acp_kit_monthly`. They already exist in live mode (created 2026-10-10 by
   `Azcontractorpro/backend/stripe-setup.mjs`). For test mode, run that script once
   with a test key.
2. **Key.** Stripe → Developers → API keys. Put the secret key (or a restricted
   key with write on Checkout Sessions and read on Prices) in
   `STRIPE_SECRET_KEY` in `/opt/azcontractorpro/.env`.
3. **Webhook.** Stripe → Workbench → Webhooks → Add destination → Your account:
   - URL: `https://app.azcontractorpro.net/api/stripe/webhook`
   - Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
     `customer.subscription.updated`, `customer.subscription.deleted`
   - Signing secret → `STRIPE_WEBHOOK_SECRET`
4. `sudo systemctl restart acp`.
5. **Retire the old endpoint.** Delete (or disable) the webhook destination that
   points at `acp-backend-tucson.netlify.app/api/stripe-webhook`, so events are
   not processed twice in two places.

Checkout success sends buyers to `<sales site>/thanks.html`; the customer
portal link (`STRIPE_PORTAL_URL`) is on that page, in the sales-site footer and in
the contractor portal.

## Payment Links without a demo (the Black Friday offer): automatic setup

A Payment Link buyer never built a demo, so the checkout names no site. When the
webhook sees that, `src/fulfil.mjs` does what you would do by hand in **Admin →
Contractors → New contractor**: it finds the licence, creates the contractor and the
site, publishes it, gives the buyer portal access and emails them.

It builds only when every check passes:

| Check | If it fails |
|---|---|
| A ROC number was typed in the checkout's `roc_license` field and it is on the **active** licence list | not built |
| The business name typed at checkout matches the licence holder (punctuation, "LLC" and word order aside) | not built: a typo or someone else's number is never published |
| The payment is confirmed, and there is a US phone and an email | not built |
| The licence has **no live or suspended site** already | not built, nothing touched. A paying customer, a hand-built or an imported site is never overwritten. A demo, draft or expired site is **promoted** instead. |

"Not built" never means lost: the payment is recorded either way, Stripe gets a normal
200 (so it does not retry), and you get an email, *"needs a person"*, with the reason,
everything the buyer typed, and the link to create them by hand.

What you and the buyer get:

- **Buyer:** an email with the site link and a portal sign-in (site name and 6-digit
  PIN), in English with a Spanish line.
- **You:** *"New Starter customer — <business> (site built automatically)"* with the live
  and admin links; or *"needs a person"*; or *"site created but NOT live"* when the site
  was created but failed its checks (fix it in the admin and press Publish).
- The subscription is linked to the site, so renewals, failed payments and
  cancellations show up under that contractor.
- In Stripe (Workbench → the webhook → a delivery) the response shows the result:
  `"auto": "built"`, or the reason.

**Needs on the Payment Link:** a custom text field with key `roc_license`, business-name
and phone collection, and `metadata.tier` = `starter`, `pro` or `kit`. The Black Friday
links already have all four.

**Keep in mind:** the licence list is public, so anyone can type any active ROC number.
The name check stops typos, not a determined impersonator. Every automatic build is
emailed to you, and you can suspend a site from its page in the admin. If you would
rather approve each one, set `AUTO_FULFIL=off`.

**Needs working email** (`SMTP_HOST` and friends in `.env`): without it the buyer's email
and yours are only written to the server log.

**Turn it off:** `AUTO_FULFIL=off` in `/opt/azcontractorpro/.env`, then
`sudo systemctl restart acp`. The webhook then behaves exactly as before: a "No site was
attached" email.

**Recover a payment** that arrived before this was deployed, or that needed a person:

```
sudo -u acp node /opt/azcontractorpro/cli.mjs fulfil cs_live_… --dry-run   # say what it would do, change nothing
sudo -u acp node /opt/azcontractorpro/cli.mjs fulfil cs_live_…             # do it, and link the payment's subscription to the site
```

The session ID (`cs_live_…`) is in the `checkout.session.completed` event for that
payment (Stripe → Workbench → Events → the event → `data.object.id`). Running it twice
is harmless: the second run sees the live site and changes nothing.

The ad reference on Black Friday links (`client_reference_id=bf26_starter_ad1`) is
ignored here: it is not a site address, so it matches no site.

**Deploying this change** (it is on the branch `claude/vigilant-fermat-vwah36` until you merge it):

```
cd /opt/azcontractorpro
sudo -u acp git fetch origin claude/vigilant-fermat-vwah36
sudo -u acp git checkout claude/vigilant-fermat-vwah36     # or merge it into your main branch, then: git pull
sudo -u acp npm ci --omit=dev
sudo systemctl restart acp
```

## Testing

With a test key and `stripe listen --forward-to localhost:8787/api/stripe/webhook`
(it prints a `whsec_` to use as `STRIPE_WEBHOOK_SECRET`), publish a demo site,
press its "Keep this site" banner, pay with `4242 4242 4242 4242`. The site's
banner disappears and the contractor moves to Live. `npm test` covers the same
flow offline with signed fake events.

## Prices on the page vs prices in Stripe

The sales page and `config/platform.json` show the prices; Stripe charges what
the lookup keys point at. Change a price in Stripe first (move the lookup key to
the new price — existing subscribers keep theirs), then update both texts.
