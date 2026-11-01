import { req, admin, liveSite, startServer, stopServer } from "./helpers.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.mjs";
import { signPayload, useStripeFetch, fulfilSession } from "../src/billing.mjs";
import { outbox } from "../src/mail.mjs";
import { db } from "../src/db.mjs";
import { useRocIndex } from "../src/roc.mjs";
import { fulfilCheckout, buyerFrom } from "../src/fulfil.mjs";

let api;
before(async () => { await startServer(); api = await admin(); });
after(stopServer);

const SECRET = "whsec_test";
const webhook = (event) => {
  const raw = JSON.stringify(event);
  return req("POST", "/api/stripe/webhook", { body: raw, headers: { "Stripe-Signature": signPayload(raw, SECRET), "Content-Type": "application/json" } });
};

let n = 0;
/** A Checkout Session as the Black Friday Payment Link makes it: no site named, the ROC number in a custom field. */
function bfSession(over = {}) {
  n += 1;
  const { roc = "363035", business = "D.E.A.L.S Enterprises LLC", phone = "+15205550142", email = "buyer@example.com",
    tier = "starter", payment_status = "paid" } = over;
  return {
    id: `cs_live_bf${n}`, mode: "subscription", status: "complete", payment_status, subscription: `sub_bf${n}`, customer: `cus_bf${n}`,
    client_reference_id: "bf26_starter_direct", metadata: { tier, promo: "bf26" }, amount_total: 15000, currency: "usd",
    custom_fields: [{ key: "roc_license", type: "text", text: { value: roc } }],
    collected_information: { business_name: business },
    customer_details: { email, phone, name: business, business_name: business },
  };
}
const complete = (session) => webhook({ id: `evt_${session.id}`, type: "checkout.session.completed", data: { object: session } });
const mailTo = (to) => outbox.filter((m) => m.to === to);
const adminMail = (re) => outbox.filter((m) => m.to === "admin@example.com" && re.test(m.subject)).at(-1);
const contractorFor = (roc) => db().get("SELECT * FROM contractors WHERE roc_number = ?", [roc]);

test("buyerFrom cleans what the buyer typed", () => {
  const b = buyerFrom({
    custom_fields: [{ key: "roc_license", text: { value: " ROC# 363-035 " } }],
    collected_information: { business_name: "  D.E.A.L.S   Enterprises LLC " },
    customer_details: { email: "Dave@Example.COM ", phone: "+1 (520) 555-0142" },
  });
  assert.deepEqual(b, { roc: "363035", business: "D.E.A.L.S Enterprises LLC", email: "dave@example.com", phone: "520-555-0142" });
  assert.equal(buyerFrom({ customer_details: { phone: "555-0142" } }).phone, "", "a number that is not a US phone is dropped, not printed");
});

test("a Black Friday payment with a valid ROC builds, publishes and hands over the site", async () => {
  const s = bfSession({ roc: "363035", email: "dave@example.com" });
  const r = await complete(s);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.auto, "built");
  const slug = r.json.site;
  assert.ok(slug);

  const site = db().get("SELECT * FROM sites WHERE slug = ?", [slug]);
  assert.equal(site.status, "active");
  assert.equal(site.tier, "starter");
  assert.ok(site.current_release, "published");
  const home = await req("GET", "/", { host: `${slug}.sites.test` });
  assert.equal(home.status, 200);
  assert.match(home.text, /363035/, "the ROC number is on the home page");
  assert.match(home.text, /520-555-0142|\(520\) 555-0142/, "the buyer's phone is the call button");
  assert.doesNotMatch(home.text, /Free demo built for/, "not a demo");

  const c = contractorFor("363035");
  assert.equal(c.stage, "live");
  assert.equal(c.email, "dave@example.com");
  const sub = db().get("SELECT * FROM subscriptions WHERE id = ?", [s.subscription]);
  assert.equal(sub.site_id, site.id, "the subscription is linked to the new site");
  assert.equal(sub.status, "active");

  // The buyer gets the link and a PIN that really opens their portal.
  const [buyerMail] = mailTo("dave@example.com");
  assert.ok(buyerMail, "buyer emailed");
  assert.match(buyerMail.text, /\.sites\.test/);
  const pin = /PIN:\s+(\d{6})/.exec(buyerMail.text)?.[1];
  assert.ok(pin, "a 6-digit PIN is in the email");
  const login = await req("POST", "/api/portal/login", { body: { site: slug, pin } });
  assert.equal(login.status, 200, login.text);

  // You get told what happened, and the PIN is NOT in your copy when the buyer was emailed.
  const note = adminMail(/site built automatically/);
  assert.ok(note, "admin told");
  assert.match(note.text, /admin\/#\/sites\//);
  assert.doesNotMatch(note.text, new RegExp(pin), "the PIN goes to the buyer only");

  // A replayed delivery is a no-op.
  assert.equal((await complete(s)).json.duplicate, true);
});

test("a second payment for a licence that already has a live site never touches it", async () => {
  const before = db().get("SELECT * FROM sites WHERE slug LIKE 'd-e-a-l-s%' OR contractor_id = ?", [contractorFor("363035").id]);
  const s = bfSession({ roc: "363035", email: "someone-else@example.com" });
  const r = await complete(s);
  assert.equal(r.status, 200);
  assert.match(r.json.auto, /already has a live site/);
  assert.equal(db().get("SELECT COUNT(*) AS n FROM sites WHERE contractor_id = ?", [before.contractor_id]).n, 1, "no second site");
  assert.equal(db().get("SELECT site_id FROM subscriptions WHERE id = ?", [s.subscription]).site_id, null, "payment is saved but not tied to someone else's site");
  const note = adminMail(/needs a person/);
  assert.match(note.text, /already has a live site/);
  assert.match(note.text, /ROC 363035/);
  assert.match(note.text, /Their existing site: .*admin\/#\/sites\//);
  assert.equal(mailTo("someone-else@example.com").length, 0, "the buyer is not sent someone else's PIN");
});

test("a hand-built, imported or paying site is never overwritten (the owner's own licence)", async () => {
  const { site } = await liveSite(api, { roc: "337881", status: "active" });
  const publishedBefore = db().get("SELECT current_release FROM sites WHERE id = ?", [site.id]).current_release;
  const s = bfSession({ roc: "337881", business: "Luis Rojo's Masonry LLC", email: "luis@example.com" });
  const r = await complete(s);
  assert.equal(r.status, 200);
  assert.match(r.json.auto, /already has a live site/);
  const after = db().get("SELECT status, tier, current_release FROM sites WHERE id = ?", [site.id]);
  assert.equal(after.status, "active");
  assert.equal(after.tier, "pro", "a Starter purchase does not downgrade a Pro site");
  assert.equal(after.current_release, publishedBefore, "not rebuilt");
});

test("a demo for that licence is promoted: banner gone, subscription linked, no second site", async () => {
  const { site, contractorId } = await liveSite(api, { roc: "355392", status: "demo" });
  assert.match((await req("GET", "/", { host: `${site.slug}.sites.test` })).text, /Free demo built for/);
  const s = bfSession({ roc: "355392", business: "Creative Construction Management LLC", email: "cc@example.com", tier: "pro" });
  const r = await complete(s);
  assert.equal(r.json.auto, "built");
  assert.equal(r.json.site, site.slug, "the demo's own site, not a new one");
  assert.equal(db().get("SELECT COUNT(*) AS n FROM sites WHERE contractor_id = ?", [contractorId]).n, 1);
  const home = await req("GET", "/", { host: `${site.slug}.sites.test` });
  assert.doesNotMatch(home.text, /Free demo built for/);
  assert.equal(db().get("SELECT status, tier FROM sites WHERE id = ?", [site.id]).status, "active");
  assert.equal(db().get("SELECT site_id FROM subscriptions WHERE id = ?", [s.subscription]).site_id, site.id);
  assert.equal(db().get("SELECT stage FROM contractors WHERE id = ?", [contractorId]).stage, "live");
});

const refusals = [
  ["a business name that does not match the licence holder", { roc: "300100", business: "Totally Different Plumbing" }, /does not match the licence holder/],
  ["a ROC number that is not on the active list", { roc: "999999", business: "Nobody Inc" }, /not on the active licence list/],
  ["no ROC number (handyman-exempt)", { roc: "", business: "Handy Pat" }, /no ROC number was entered/],
  ["a phone that is not a US number", { roc: "300100", business: "Desert Bloom Landscaping LLC", phone: "555-0100" }, /no usable US phone/],
  ["a payment that is not confirmed yet", { roc: "300100", business: "Desert Bloom Landscaping LLC", payment_status: "unpaid" }, /not confirmed yet/],
];
for (const [name, over, why] of refusals) {
  test(`refuses, changes nothing and tells you why: ${name}`, async () => {
    const s = bfSession(over);
    const r = await complete(s);
    assert.equal(r.status, 200, "Stripe is answered, so it does not retry");
    assert.match(r.json.auto, why);
    assert.equal(r.json.site, null);
    assert.equal(contractorFor(over.roc || "none"), null, "no contractor was created");
    const sub = db().get("SELECT * FROM subscriptions WHERE id = ?", [s.subscription]);
    assert.equal(sub.status, "active", "the payment itself is still recorded");
    const note = adminMail(/needs a person/);
    assert.match(note.text, /No site was attached; match them up in the admin\./);
    assert.match(note.text, why);
    assert.match(note.text, /contractors\?new=1/, "the link to create them by hand");
  });
}

test("dry run decides and reports but changes nothing", async () => {
  const r = await fulfilCheckout(bfSession({ roc: "300100", business: "Desert Bloom Landscaping LLC" }), { tier: "starter", dryRun: true });
  assert.equal(r.dryRun, true);
  assert.equal(r.action, "created");
  assert.equal(r.licence.business, "Desert Bloom Landscaping LLC");
  assert.equal(contractorFor("300100"), null);
});

test("AUTO_FULFIL=off restores the email-only behaviour exactly; `fulfil` then recovers the payment and links its subscription", async () => {
  const s = bfSession({ roc: "300100", business: "Desert Bloom Landscaping LLC", email: "ana@example.com" });
  config.autoFulfil = false;
  try {
    const r = await complete(s);
    assert.equal(r.status, 200);
    assert.equal(r.json.site, null);
    assert.equal(r.json.auto, undefined, "no automatic setup was attempted");
    assert.equal(contractorFor("300100"), null);
    const note = adminMail(/^New Starter customer$/);
    assert.equal(note.text, "ana@example.com paid for Starter.\nNo site was attached; match them up in the admin.", "the original email, unchanged");
  } finally {
    config.autoFulfil = true;
  }

  // The payment is already recorded (and its event is "seen"); the CLI builds from the Checkout Session itself.
  const keep = config.stripeKey;
  config.stripeKey = "sk_test_x";
  useStripeFetch(async () => new Response(JSON.stringify(s)));
  try {
    const dry = await fulfilSession(s.id, { dryRun: true });
    assert.equal(dry.dryRun, true);
    assert.equal(contractorFor("300100"), null, "a dry run builds nothing");
    const built = await fulfilSession(s.id);
    assert.equal(built.built, true);
    const sub = db().get("SELECT * FROM subscriptions WHERE id = ?", [s.subscription]);
    assert.equal(sub.site_id, built.site.id, "the earlier subscription is now linked to the site");
    assert.equal(sub.status, "active");
    const again = await fulfilSession(s.id);
    assert.equal(again.built, false, "running it twice is harmless");
    assert.match(again.reason, /already has a live site/);
  } finally {
    config.stripeKey = keep;
    useStripeFetch(null);
  }
});

test("a site that fails its checks is created but not published, and the webhook still answers 200", async () => {
  const F = ["roc_number", "business_name", "dba", "license_class", "license_class_description", "class_type", "address", "city", "state", "zip", "qualifying_party", "expiration_date", "roc_status"];
  useRocIndex({ fields: F, snapshot_date: "2026-09-08", rows: [
    ["400200", "Sunrise Block and Stone LLC", "", "CR-31", "Masonry", "Specialty Dual", "9 Main", "TUCSON", "AZ", "85701", "Sam Stone", "2028-02-28", "Active"],
  ] });
  try {
    const c = await api("POST", "/api/admin/contractors", { body: { roc: "400200", phone: "520-555-0111", email: "sam@example.com" } });
    assert.equal(c.status, 201, c.text);
    const draft = (await api("POST", "/api/admin/sites", { body: { contractor_id: c.json.contractor.id, tier: "pro" } })).json.site;
    db().run("UPDATE sites SET copy_overrides = ? WHERE id = ?", [JSON.stringify({ heroLine: "Lorem ipsum dolor sit amet", about: "Lorem ipsum dolor sit amet" }), draft.id]);

    const s = bfSession({ roc: "400200", business: "Sunrise Block and Stone LLC", email: "sam@example.com" });
    const r = await complete(s);
    assert.equal(r.status, 200, "not a 500: Stripe must not retry a half-done build");
    assert.match(r.json.auto, /did not pass its checks/);
    const row = db().get("SELECT status, current_release FROM sites WHERE id = ?", [draft.id]);
    assert.equal(row.status, "active", "paid");
    assert.ok(!row.current_release, "but nothing was published");
    assert.equal(db().get("SELECT site_id FROM subscriptions WHERE id = ?", [s.subscription]).site_id, draft.id, "payment tied to the site so you can finish it");
    assert.equal(db().get("SELECT stage FROM contractors WHERE id = ?", [c.json.contractor.id]).stage, "paid", "paid, not live");
    assert.equal(mailTo("sam@example.com").filter((m) => /is live/.test(m.subject)).length, 0, "the buyer is not told it is live");
    const note = adminMail(/NOT live/);
    assert.match(note.text, /Fix and publish it here: .*admin\/#\/sites\//);
    assert.equal((await req("GET", "/", { host: `${draft.slug}.sites.test` })).status, 404, "visitors see 'Coming soon', not a broken site");
  } finally {
    useRocIndex(null);
  }
});
