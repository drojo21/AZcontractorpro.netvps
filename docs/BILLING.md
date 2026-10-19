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
