import { req, admin, liveSite, startServer, stopServer } from "./helpers.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.mjs";
import { verifySignature, signPayload, formEncode, useStripeFetch } from "../src/billing.mjs";
import { useAnthropicClient, costMicros } from "../src/ai.mjs";
import { parseHours, fromLegacy } from "../src/importer.mjs";
import { db } from "../src/db.mjs";
import { sweep } from "../src/system.mjs";

let api;
before(async () => { await startServer(); api = await admin(); });
after(stopServer);

const SECRET = "whsec_test";
const webhook = (event, { secret = SECRET, t } = {}) => {
  const raw = JSON.stringify(event);
  return req("POST", "/api/stripe/webhook", { body: raw, headers: { "Stripe-Signature": signPayload(raw, secret, t), "Content-Type": "application/json" } });
};

test("Stripe signatures: good, wrong secret, stale, tampered", () => {
  const raw = '{"id":"evt_1"}';
  assert.ok(verifySignature(raw, signPayload(raw, SECRET), SECRET));
  assert.ok(!verifySignature(raw, signPayload(raw, "whsec_other"), SECRET));
  assert.ok(!verifySignature(raw, signPayload(raw, SECRET, Math.floor(Date.now() / 1000) - 3600), SECRET));
  assert.ok(!verifySignature(raw + " ", signPayload(raw, SECRET), SECRET));
  assert.ok(!verifySignature(raw, "", SECRET));
});

test("form encoding matches Stripe's nested style", () => {
  const s = formEncode({ line_items: [{ price: "p1", quantity: 1 }], metadata: { tier: "pro" }, skip: undefined }).toString();
  assert.equal(decodeURIComponent(s), "line_items[0][price]=p1&line_items[0][quantity]=1&metadata[tier]=pro");
});

test("the webhook rejects unsigned events", async () => {
  const r = await req("POST", "/api/stripe/webhook", { body: '{"id":"evt_x","type":"checkout.session.completed"}' });
  assert.equal(r.status, 400);
});

test("checkout completion activates the demo, marks the contractor paid, and is idempotent", async () => {
  const { site, contractorId } = await liveSite(api, { status: "demo" });
  assert.match((await req("GET", "/", { host: `${site.slug}.sites.test` })).text, /Free demo built for/);
  const event = {
    id: "evt_checkout_1", type: "checkout.session.completed",
    data: { object: {
      id: "cs_1", mode: "subscription", subscription: "sub_1", customer: "cus_1", client_reference_id: site.slug,
      metadata: { tier: "pro", site: site.slug }, amount_total: 99700, currency: "usd",
      customer_details: { email: "owner@example.com" },
    } },
  };
  const r = await webhook(event);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.site, site.slug);
  const after = (await api("GET", `/api/admin/sites/${site.id}`)).json.site;
  assert.equal(after.status, "active");
  assert.equal(after.subscription.status, "active");
  const home = await req("GET", "/", { host: `${site.slug}.sites.test` });
  assert.doesNotMatch(home.text, /Free demo built for/, "banner gone");
  assert.equal(home.headers["x-robots-tag"], undefined, "indexable now");
  const c = (await api("GET", `/api/admin/contractors/${contractorId}`)).json.contractor;
  assert.equal(c.stage, "live");
  const dup = await webhook(event);
  assert.equal(dup.json.duplicate, true);
});

test("payment failure and cancellation update the subscription", async () => {
  await webhook({ id: "evt_fail", type: "invoice.payment_failed", data: { object: { customer: "cus_1", parent: { subscription_details: { subscription: "sub_1" } } } } });
  assert.equal(db().get("SELECT status FROM subscriptions WHERE id = 'sub_1'").status, "past_due");
  await webhook({ id: "evt_paid", type: "invoice.paid", data: { object: { customer: "cus_1", subscription: "sub_1" } } });
  assert.equal(db().get("SELECT status FROM subscriptions WHERE id = 'sub_1'").status, "active");
  await webhook({ id: "evt_del", type: "customer.subscription.deleted", data: { object: { id: "sub_1", customer: "cus_1", status: "canceled", items: { data: [{ price: { lookup_key: "acp_pro_monthly", recurring: {} }, current_period_end: 1800000000 }] } } } });
  const sub = db().get("SELECT * FROM subscriptions WHERE id = 'sub_1'");
  assert.equal(sub.status, "canceled");
  assert.equal(sub.tier, "pro");
  const ignored = await webhook({ id: "evt_other", type: "customer.created", data: { object: {} } });
  assert.equal(ignored.json.ignored, "customer.created");
});

test("Buy button: prices by lookup key, setup now and monthly after the delay", async () => {
  const calls = [];
  useStripeFetch(async (url, opts) => {
    calls.push({ url, opts });
    if (url.includes("/prices")) {
      return new Response(JSON.stringify({ data: ["starter", "pro", "kit"].flatMap((t) => [
        { id: `price_${t}_setup`, lookup_key: `acp_${t}_setup` }, { id: `price_${t}_monthly`, lookup_key: `acp_${t}_monthly`, recurring: {} }]) }));
    }
    return new Response(JSON.stringify({ id: "cs_test", url: "https://checkout.stripe.com/c/pay/cs_test" }));
  });
  config.stripeKey = "sk_test_x";
  try {
    const r = await req("GET", `/api/checkout?tier=pro&site=deals-enterprises-llc&back=${encodeURIComponent("https://evil.example/x")}`, { host: "sales.test" });
    assert.equal(r.status, 303);
    assert.equal(r.headers.location, "https://checkout.stripe.com/c/pay/cs_test");
    assert.match(calls[0].url, /lookup_keys%5B0%5D=acp_starter_setup/);
    const body = new URLSearchParams(calls[1].opts.body);
    assert.equal(body.get("mode"), "subscription");
    assert.equal(body.get("line_items[0][price]"), "price_pro_monthly");
    assert.equal(body.get("line_items[1][price]"), "price_pro_setup");
    assert.equal(body.get("subscription_data[trial_period_days]"), "14");
    assert.equal(body.get("metadata[tier]"), "pro");
    assert.doesNotMatch(body.get("cancel_url"), /evil\.example/, "back= limited to our own hosts");
    assert.match(calls[1].opts.headers.Authorization, /^Bearer sk_test_x$/);
    const bad = await req("GET", "/api/checkout?tier=platinum", { host: "sales.test" });
    assert.equal(bad.status, 303);
    assert.match(bad.headers.location, /#pricing$/);
  } finally {
    config.stripeKey = "";
    useStripeFetch(null);
  }
});

test("AI copy: only whitelisted fields come back, usage and cost are recorded", async () => {
  let sent;
  useAnthropicClient({
    beta: { messages: { create: async (params) => {
      sent = params;
      return {
        id: "msg_1", model: "claude-opus-5-5", stop_reason: "end_turn",
        usage: { input_tokens: 1000, output_tokens: 200 },
        content: [{ type: "text", text: JSON.stringify({ tagline: "Walls that hold", heroLine: "Straight talk.", about: "About.", servicesIntro: "Intro.", metaDesc: "Meta.", reviews: [{ name: "Fake" }] }) }],
      };
    } } },
  });
  const r = await api("POST", "/api/admin/sites/1/ai-copy", { body: { notes: "family run since 1994" } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(Object.keys(r.json.copy).sort(), ["about", "heroLine", "metaDesc", "servicesIntro", "tagline"]);
  assert.equal(r.json.costMicros, 1000 * 4 + 200 * 20);
  assert.equal(sent.model, config.aiModel);
  assert.equal(sent.output_config.format.type, "json_schema");
  assert.equal(sent.output_config.format.schema.additionalProperties, false);
  assert.equal(sent.fallbacks, "default");
  assert.match(sent.messages[0].content, /family run since 1994/);
  const usage = (await api("GET", "/api/admin/usage")).json;
  assert.equal(usage.total.calls, 1);

  useAnthropicClient({ beta: { messages: { create: async () => ({ id: "msg_2", model: "claude-opus-5-5", stop_reason: "refusal", usage: { input_tokens: 10, output_tokens: 0 }, content: [] }) } } });
  assert.equal((await api("POST", "/api/admin/sites/1/ai-copy", { body: {} })).status, 422);
  useAnthropicClient(null);
  assert.equal(costMicros("unknown-model", { input_tokens: 5 }), 0);
});

test("importer reads the Python builder's client.json", () => {
  assert.deepEqual(parseHours("Mo-Fr 07:00-17:00, Sa 8:00-14:00"), [
    { days: "Mo,Tu,We,Th,Fr", opens: "07:00", closes: "17:00" }, { days: "Sa", opens: "08:00", closes: "14:00" }]);
  const x = fromLegacy({
    client_id: "luis", business_name: "Luis Rojo's Masonry LLC", roc_number: "337881", license_class: "KB-2", trade: "masonry",
    phone: "(520) 481-7579", city: "Tucson", service_area: ["Tucson", "Vail"], tier: "full", hero_subhead: "Licensed masonry.",
    services: [{ name: "Stamped Concrete", summary: "x" }], deploy: { custom_domain: "https://luisrojosmasonry.com" },
    theme: { primary: "#78350f", accent: "#d97706" }, hours: "Mo-Fr 07:00-17:00",
  });
  assert.equal(x.tier, "pro");
  assert.equal(x.domain, "luisrojosmasonry.com");
  assert.equal(x.spec.business.trade, "masonry");
  assert.equal(x.copy.heroLine, "Licensed masonry.");
  assert.equal(x.spec.services[0].name, "Stamped Concrete");
});

test("unpaid demos expire on schedule and stop serving", async () => {
  const { site } = await liveSite(api, { roc: "355392", status: "demo" });
  db().run("UPDATE sites SET demo_expires_at = ? WHERE id = ?", [new Date(Date.now() - 1000).toISOString(), site.id]);
  assert.equal(sweep().expired, 1);
  const r = await req("GET", "/", { host: `${site.slug}.sites.test` });
  assert.equal(r.status, 410);
  assert.match(r.text, /expired/);
});
