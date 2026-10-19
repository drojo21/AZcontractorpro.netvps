/**
 * billing.mjs — your own Stripe billing: setup fee today, monthly after launch.
 *
 * Same Stripe account, products and lookup keys as Azcontractorpro/backend
 * (acp_<tier>_setup / acp_<tier>_monthly), so nothing changes in Stripe. What
 * changed is what a payment does: the webhook now flips the contractor's demo
 * site to active on this server — the banner goes and the noindex lifts — and
 * moves them to "paid" in the CRM, instead of emailing a spreadsheet.
 *
 * No SDK: Stripe's REST API is form-encoded, and the webhook signature is an
 * HMAC, so fetch and node:crypto cover it. fetch is injectable for tests.
 */
import crypto from "node:crypto";
import { config } from "./config.mjs";
import { db, nowIso } from "./db.mjs";
import { HttpError } from "./http.mjs";
import { notify } from "./mail.mjs";
import { addActivity, advanceStage, getContractor } from "./contractors.mjs";
import { getSite, getSiteBySlug, updateSite, republishQuietly } from "./sites.mjs";

const API = "https://api.stripe.com/v1";
let fetchImpl = (...a) => fetch(...a);
export function useStripeFetch(fn) { fetchImpl = fn || ((...a) => fetch(...a)); _prices = null; }

/** {a:{b:[1]}} → a[b][0]=1, Stripe's nested form encoding. */
export function formEncode(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? formEncode(item, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === "object") formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe(method, path, params = null) {
  if (!config.stripeKey) throw new HttpError(503, "Stripe is not configured");
  const qs = method === "GET" && params ? `?${formEncode(params)}` : "";
  const res = await fetchImpl(`${API}${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.stripeKey}`,
      ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: method !== "GET" && params ? formEncode(params).toString() : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `Stripe: ${body?.error?.message || res.status}`);
  return body;
}

/* ------------------------------------------------------------- prices */

let _prices = null;
const PRICE_TTL = 5 * 60 * 1000;

export async function tierPrices(tier) {
  if (!config.tiers[tier]) throw new HttpError(400, `unknown tier: ${tier}`);
  if (!_prices || Date.now() - _prices.at > PRICE_TTL) {
    const keys = Object.keys(config.tiers).flatMap((t) => [`acp_${t}_setup`, `acp_${t}_monthly`]);
    const res = await stripe("GET", "/prices", { lookup_keys: keys, active: "true", limit: 20 });
    _prices = { at: Date.now(), byKey: Object.fromEntries((res.data || []).map((p) => [p.lookup_key, p])) };
  }
  const setup = _prices.byKey[`acp_${tier}_setup`];
  const monthly = _prices.byKey[`acp_${tier}_monthly`];
  if (!setup || !monthly) throw new HttpError(502, `Stripe has no prices with lookup keys acp_${tier}_setup / acp_${tier}_monthly`);
  return { setup, monthly };
}

export const tierFromLookupKey = (k) => (/^acp_([a-z]+)_(setup|monthly)$/.exec(k || "") || [])[1] || null;

/* ----------------------------------------------------------- checkout */

/** A Checkout Session URL for a tier, optionally tied to a site (a demo being bought). */
export async function checkoutUrl({ tier, siteSlug = "", returnUrl = "" }) {
  const site = siteSlug ? getSiteBySlug(siteSlug) : null;
  const contractor = site ? getContractor(site.contractor_id) : null;
  const { setup, monthly } = await tierPrices(tier);
  const delay = config.monthlyDelayDays;
  const name = config.tiers[tier].name;
  const meta = { tier, site: site?.slug || "", contractor_id: contractor ? String(contractor.id) : "" };
  const back = returnUrl || (site ? `${config.appUrl}/s/${site.slug}/` : salesUrl("#pricing"));
  const session = await stripe("POST", "/checkout/sessions", {
    mode: "subscription",
    line_items: [{ price: monthly.id, quantity: 1 }, { price: setup.id, quantity: 1 }],
    client_reference_id: site?.slug,
    customer_email: contractor?.email || undefined,
    metadata: meta,
    subscription_data: {
      metadata: meta,
      description: `${name} website${contractor ? ` — ${contractor.business_name}` : ""}`,
      ...(delay ? { trial_period_days: delay } : {}),
    },
    allow_promotion_codes: "true",
    billing_address_collection: "auto",
    phone_number_collection: { enabled: "true" },
    custom_text: {
      submit: {
        message: `Today you pay the one-time ${name} setup fee. ${delay
          ? `Your monthly plan starts in ${delay} days, after your site is live.`
          : "Your first month is included today."} Cancel the monthly any time from the link in your receipt.`,
      },
    },
    success_url: `${salesUrl("thanks.html")}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
  });
  return session.url;
}

export function salesUrl(suffix = "") {
  const host = config.salesHosts[0];
  return host ? `https://${host}/${suffix}` : `${config.appUrl}/sales/${suffix}`;
}

/* ------------------------------------------------------------ webhook */

const TOLERANCE_S = 300;

/** Stripe-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">. */
export function verifySignature(rawBody, header, secret, now = Date.now()) {
  if (!secret || !header) return false;
  const parts = String(header).split(",").map((p) => p.split("=").map((s) => s.trim()));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!/^\d+$/.test(t || "") || !sigs.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > TOLERANCE_S) return false;
  const want = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  return sigs.some((s) => {
    const got = Buffer.from(s, "hex");
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  });
}

/** For tests and the CLI: a header Stripe would send. */
export function signPayload(rawBody, secret, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}

const iso = (unix) => (unix ? new Date(unix * 1000).toISOString() : null);
const idOf = (v) => (typeof v === "string" ? v : v?.id) || "";

function saveSubscription(subId, patch) {
  const prev = db().get("SELECT * FROM subscriptions WHERE id = ?", [subId]);
  const next = { ...(prev || {}), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== "")) };
  db().run(`INSERT INTO subscriptions (id, site_id, contractor_id, customer_id, tier, status, email, current_period_end, cancel_at_period_end, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET site_id = excluded.site_id, contractor_id = excluded.contractor_id,
              customer_id = excluded.customer_id, tier = excluded.tier, status = excluded.status, email = excluded.email,
              current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
              updated_at = excluded.updated_at`,
    [subId, next.site_id ?? null, next.contractor_id ?? null, next.customer_id || "", next.tier || "", next.status || "",
      next.email || "", next.current_period_end || null, next.cancel_at_period_end ? 1 : 0, nowIso()]);
  return db().get("SELECT * FROM subscriptions WHERE id = ?", [subId]);
}

function tierOf(sub) {
  for (const item of sub?.items?.data || []) {
    const t = tierFromLookupKey(item?.price?.lookup_key);
    if (t && item?.price?.recurring) return t;
  }
  return sub?.metadata?.tier || "";
}

function tellAdmin(subject, text) {
  if (config.adminEmail) notify({ to: config.adminEmail, subject, text }, "billing");
}

async function onCheckoutCompleted(s) {
  if (s.mode !== "subscription") return { ignored: "not a subscription checkout" };
  const subId = idOf(s.subscription);
  const tier = s.metadata?.tier || "";
  const site = getSiteBySlug(s.metadata?.site || s.client_reference_id || "");
  const email = s.customer_details?.email || s.customer_email || "";
  const sub = saveSubscription(subId, {
    site_id: site?.id, contractor_id: site?.contractor_id, customer_id: idOf(s.customer), tier,
    status: "active", email,
  });
  const label = config.tiers[tier]?.name || tier;
  if (site) {
    if (site.status === "demo" || site.status === "expired" || site.status === "draft") {
      updateSite(site.id, { status: "active", ...(tier && config.tiers[tier] ? { tier } : {}) });
    }
    advanceStage(site.contractor_id, "paid", `${label} checkout`);
    addActivity(site.contractor_id, "billing", `Paid ${label} setup (${(s.amount_total || 0) / 100} ${String(s.currency || "usd").toUpperCase()})`, "stripe");
    // Rebuild without the demo banner; publishing an active site moves them to "live".
    republishQuietly(site.id, "stripe");
  }
  tellAdmin(`New ${label} customer${site ? ` — ${site.spec?.business?.name || site.slug}` : ""}`,
    `${email || "Someone"} paid for ${label}.${site ? `\nSite: ${config.appUrl}/admin/#/sites/${site.id}` : "\nNo site was attached; match them up in the admin."}`);
  return { subscription: sub.id, site: site?.slug || null };
}

function onSubscriptionChange(sub, deleted = false) {
  const prev = db().get("SELECT * FROM subscriptions WHERE id = ?", [sub.id]);
  const site = prev?.site_id ? getSite(prev.site_id) : getSiteBySlug(sub.metadata?.site || "");
  const saved = saveSubscription(sub.id, {
    site_id: site?.id, contractor_id: site?.contractor_id, customer_id: idOf(sub.customer), tier: tierOf(sub),
    status: deleted ? "canceled" : sub.status,
    current_period_end: iso(sub.items?.data?.[0]?.current_period_end || sub.current_period_end),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
  });
  if (deleted && site) {
    addActivity(site.contractor_id, "billing", "Subscription canceled", "stripe");
    tellAdmin(`Subscription canceled — ${site.spec?.business?.name || site.slug}`,
      `The site is still live. Suspend it from ${config.appUrl}/admin/#/sites/${site.id} if that is the plan.`);
  }
  return { subscription: saved.id, status: saved.status };
}

function onInvoice(inv, paid) {
  const subId = idOf(inv?.parent?.subscription_details?.subscription || inv.subscription);
  if (!subId) return { ignored: "no subscription" };
  const prev = db().get("SELECT * FROM subscriptions WHERE id = ?", [subId]);
  saveSubscription(subId, { status: paid ? "active" : "past_due", customer_id: idOf(inv.customer) });
  if (!paid && prev?.site_id) {
    const site = getSite(prev.site_id);
    if (site) addActivity(site.contractor_id, "billing", "Payment failed — Stripe is retrying", "stripe");
    tellAdmin(`Payment failed — ${site?.spec?.business?.name || subId}`, "Stripe's Smart Retries and emails are chasing it. Nothing to do unless it fails for good.");
  }
  return { subscription: subId, paid };
}

/**
 * Apply one verified event. Duplicate deliveries are a no-op; a failure
 * throws so the route answers 500 and Stripe retries.
 */
export async function handleEvent(event) {
  if (!event?.id || !event?.type) return { ignored: "not an event" };
  const seen = db().get("SELECT 1 FROM stripe_events WHERE id = ?", [event.id]);
  if (seen) return { duplicate: true };
  const o = event.data?.object || {};
  let out;
  switch (event.type) {
    case "checkout.session.completed": out = await onCheckoutCompleted(o); break;
    case "customer.subscription.updated": out = onSubscriptionChange(o); break;
    case "customer.subscription.deleted": out = onSubscriptionChange(o, true); break;
    case "invoice.paid": out = onInvoice(o, true); break;
    case "invoice.payment_failed": out = onInvoice(o, false); break;
    default: out = { ignored: event.type };
  }
  db().run("INSERT OR IGNORE INTO stripe_events (id, type) VALUES (?, ?)", [event.id, event.type]);
  return out;
}

export function subscriptionsList() {
  return db().all(`SELECT sub.*, s.slug, c.business_name FROM subscriptions sub
                   LEFT JOIN sites s ON s.id = sub.site_id LEFT JOIN contractors c ON c.id = sub.contractor_id
                   ORDER BY sub.updated_at DESC`);
}
