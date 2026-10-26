import { req, startServer, stopServer } from "./helpers.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { config } from "../src/config.mjs";
import { outbox } from "../src/mail.mjs";
import { db, getSetting } from "../src/db.mjs";
import { useStripeFetch, signPayload } from "../src/billing.mjs";
import { promoteDomain } from "../src/onboard.mjs";
import { getSiteBySlug, domainsFor, siteUrls, releaseDir } from "../src/sites.mjs";

before(async () => {
  await startServer();
  config.stripeKey = "sk_test_x";
  config.publicIp = "203.0.113.9";
});
after(async () => {
  config.stripeKey = "";
  config.publicIp = "";
  useStripeFetch(null);
  await stopServer();
});

/** Stripe answers GET /checkout/sessions/<id> from this table. */
const sessions = new Map();
useStripeFetch(async (url) => {
  const m = /\/checkout\/sessions\/([^/?]+)/.exec(url);
  const s = m && sessions.get(m[1]);
  if (!s) return new Response(JSON.stringify({ error: { message: `No such checkout.session: '${m?.[1]}'` } }), { status: 404 });
  return new Response(JSON.stringify(s));
});
const session = (id, extra = {}) => {
  const s = {
    id, mode: "subscription", status: "complete", payment_status: "paid", created: Math.floor(Date.now() / 1000),
    subscription: `sub_${id}`, customer: `cus_${id}`, metadata: { tier: "pro", site: "" },
    customer_details: { email: "buyer@example.com" }, ...extra,
  };
  sessions.set(id, s);
  return s;
};
const sheet = (body) => req("POST", "/api/onboard", { host: "sales.test", headers: { "Content-Type": "text/plain" }, body });
const answers = (id, extra = {}) => ({
  session_id: id, phone: "(520) 555-0188", email: "jobs@desertbloom.example",
  services: ["Drip Irrigation", "Custom Pergolas"], service_area: ["Marana", "Oro Valley", "Tucson"],
  hours: "always", domain_status: "later", domain: "", owner: "Ana Ruiz", years_in_business: "12",
  tagline: "Water-wise yards", target_customer: "residential", emergency_service: false, facebook_url: "", notes: "", ...extra,
});

test("/api/roc: active, inactive, and open to the sales page", async () => {
  const hit = await req("GET", "/api/roc?n=300100", { host: "sales.test" });
  assert.equal(hit.status, 200);
  assert.equal(hit.headers["access-control-allow-origin"], "*");
  assert.deepEqual([hit.json.active, hit.json.business_name, hit.json.license_class, hit.json.city], [true, "Desert Bloom Landscaping LLC", "CR-21", "Marana"]);
  assert.ok(hit.json.suggested_areas.includes("Oro Valley"), "metro neighbours offered as chips");
  const miss = await req("GET", "/api/roc?n=999999", { host: "sales.test" });
  assert.equal(miss.json.active, false);
  assert.ok(miss.json.snapshot_date);
  assert.equal(hit.json.address, undefined, "only the public summary leaves the server");
});

test("setup sheet: refuses unknown, unfinished and stale checkouts", async () => {
  assert.equal((await req("GET", "/api/onboard", { host: "sales.test" })).status, 404);
  assert.equal((await req("GET", "/api/onboard?session_id=nonsense", { host: "sales.test" })).status, 404);
  assert.equal((await req("GET", "/api/onboard?session_id=cs_doesnotexist1", { host: "sales.test" })).status, 404);
  session("cs_unfinished1", { status: "open" });
  assert.equal((await req("GET", "/api/onboard?session_id=cs_unfinished1", { host: "sales.test" })).status, 402);
  session("cs_ancient0001", { created: Math.floor(Date.now() / 1000) - 40 * 86400 });
  assert.equal((await req("GET", "/api/onboard?session_id=cs_ancient0001", { host: "sales.test" })).status, 410);
  assert.equal((await sheet(answers("cs_unfinished1"))).status, 402, "saving needs a finished checkout too");
});

let slug;
test("demo → paid → setup sheet rebuilds the site with the buyer's answers", async () => {
  const demo = await req("POST", "/api/demo", {
    host: "sales.test", headers: { "Content-Type": "text/plain" },
    body: { name: "Ana R", email: "ana@example.com", phone: "5205550100", roc: "300100" },
  });
  assert.equal(demo.json.status, "live");
  slug = demo.json.site;
  assert.equal(slug, "desert-bloom-landscaping-llc");
  assert.match(demo.json.order, /^\d{6}$/);

  session("cs_paid_demo01", { client_reference_id: slug, metadata: { tier: "pro", site: slug } });
  const raw = JSON.stringify({ id: "evt_onb_1", type: "checkout.session.completed", data: { object: sessions.get("cs_paid_demo01") } });
  const hook = await req("POST", "/api/stripe/webhook", { body: raw, headers: { "Stripe-Signature": signPayload(raw, "whsec_test") } });
  assert.equal(hook.status, 200, hook.text);

  const ctx = await req("GET", "/api/onboard?session_id=cs_paid_demo01", { host: "sales.test" });
  assert.equal(ctx.status, 200, ctx.text);
  assert.equal(ctx.json.needs_roc, false);
  assert.equal(ctx.json.plan_name, "Pro");
  assert.equal(ctx.json.form.business_name, "Desert Bloom Landscaping LLC");
  assert.equal(ctx.json.form.phone, "520-555-0100");
  assert.equal(ctx.json.submitted_at, null);
  assert.ok(ctx.json.form.suggested_services.length > 3);

  // Bad answers come back per field and change nothing.
  const bad = await sheet(answers("cs_paid_demo01", { phone: "12", services: [], service_area: [], facebook_url: "http://x.example", domain_status: "have", domain: "" }));
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.json.errors).sort(), ["domain", "facebook_url", "phone", "service_area", "services"]);

  const before = outbox.length;
  const ok = await sheet(answers("cs_paid_demo01", { domain_status: "have", domain: "https://www.DesertBloomYards.com/", notes: "Logo by email" }));
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.dns.primary, "desertbloomyards.com");
  assert.deepEqual(ok.json.dns.steps, [{ type: "A", host: "@", value: "203.0.113.9" }, { type: "A", host: "www", value: "203.0.113.9" }]);
  assert.equal(ok.json.site_url, `https://${slug}.sites.test/`, "the free address stays primary until DNS works");

  const home = await req("GET", "/", { host: `${slug}.sites.test` });
  assert.doesNotMatch(home.text, /Free demo built for/, "paid site has no demo banner");
  assert.match(home.text, /\(520\) 555-0188/);
  assert.match(home.text, /Custom Pergolas/);
  assert.match(home.text, /Water-wise yards/);
  assert.match(home.text, /Oro Valley/);
  const svc = await req("GET", "/", { host: `${slug}.sites.test` });
  assert.equal(svc.headers["x-robots-tag"], undefined);

  const mail = outbox.slice(before).find((m) => m.to === "jobs@desertbloom.example");
  assert.ok(mail, "buyer is emailed");
  const pin = /PIN:\s+(\d{6})/.exec(mail.text)?.[1];
  assert.ok(pin, "first save emails the portal PIN");
  assert.match(mail.text, /A\s+@\s+203\.0\.113\.9/);
  assert.match(mail.text, /session_id=cs_paid_demo01/, "link back to the sheet");

  const login = await req("POST", "/api/portal/login", { body: { site: slug, pin } });
  assert.equal(login.status, 200, "the emailed PIN signs in to the portal");

  // Saving again shows what was saved, and does not mint a new PIN.
  const again = await req("GET", "/api/onboard?session_id=cs_paid_demo01", { host: "sales.test" });
  assert.ok(again.json.submitted_at);
  assert.deepEqual(again.json.form.services, ["Drip Irrigation", "Custom Pergolas"]);
  assert.equal(again.json.form.hours, "always");
  assert.equal(again.json.form.domain, "desertbloomyards.com");
  assert.equal(again.json.form.target_customer, "residential");
  const n = outbox.length;
  const resave = await sheet(answers("cs_paid_demo01", { tagline: "Yards that save water", domain_status: "have", domain: "desertbloomyards.com" }));
  assert.equal(resave.status, 200);
  assert.doesNotMatch(outbox.slice(n).find((m) => m.to === "jobs@desertbloom.example").text, /PIN:/);
  assert.equal((await req("POST", "/api/portal/login", { body: { site: slug, pin } })).status, 200, "old PIN still works");
});

test("setup sheet text cannot put markup on the public site", async () => {
  const evil = answers("cs_paid_demo01", {
    services: ["<script>alert(1)</script>Pergolas", "Drip <img src=x onerror=alert(2)>"], tagline: "<svg onload=alert(3)>", owner: "<b onmouseover=alert(4)>Ana",
    service_area: ["Vail<img src=x onerror=alert(5)>", "Marana"], domain_status: "have", domain: "desertbloomyards.com",
  });
  const r = await sheet(evil);
  assert.equal(r.status, 200, r.text);
  for (const p of ["/", "/no-such-page"]) {
    const page = await req("GET", p, { host: `${slug}.sites.test` });
    assert.doesNotMatch(page.text, /<script>alert|<img src=x|<svg onload|<b onmouseover/, p);
  }
  await sheet(answers("cs_paid_demo01", { domain_status: "have", domain: "desertbloomyards.com" }));
});

test("a custom domain becomes primary only once it reaches this server", async () => {
  const site = getSiteBySlug(slug);
  assert.equal(getSetting(`domain_want:${site.id}`), "desertbloomyards.com");
  assert.equal(await promoteDomain(site.id, { verify: async (d) => ({ ok: false, domain: d }) }), false);
  assert.match(siteUrls(site).primary, /sites\.test/);
  const n = outbox.length;
  assert.equal(await promoteDomain(site.id, { verify: async (d) => ({ ok: true, domain: d }) }), true);
  assert.equal(siteUrls(getSiteBySlug(slug)).primary, "https://desertbloomyards.com/");
  assert.ok(domainsFor(site.id).some((d) => d.domain === "www.desertbloomyards.com"));
  assert.equal(getSetting(`domain_want:${site.id}`), null, "nothing left to wait for");
  assert.ok(outbox.slice(n).some((m) => /is connected/.test(m.subject)));
  const live = getSiteBySlug(slug);
  const html = fs.readFileSync(`${releaseDir(live, live.current_release)}/index.html`, "utf8");
  assert.match(html, /desertbloomyards\.com/, "rebuilt with the new address");
});

test("a domain already on another site is refused, and nothing else is saved", async () => {
  session("cs_second_001", { client_reference_id: "", metadata: { tier: "starter" } });
  const made = await sheet(answers("cs_second_001", { roc_number: "355392", trade: "general", services: ["Remodels"], service_area: ["Tucson"] }));
  assert.equal(made.status, 200, made.text);
  const clash = await sheet(answers("cs_second_001", { domain_status: "have", domain: "desertbloomyards.com" }));
  assert.equal(clash.status, 400);
  assert.match(clash.json.errors.domain, /already attached/);
});

test("a buyer who skipped the demo gives a ROC number and trade, and gets a built site", async () => {
  session("cs_straight_01", { metadata: { tier: "kit" }, customer_details: { email: "walkup@example.com", phone: "+15205550177" } });
  const ctx = await req("GET", "/api/onboard?session_id=cs_straight_01", { host: "sales.test" });
  assert.equal(ctx.json.needs_roc, true);
  assert.equal(ctx.json.plan_name, "Full Marketing Kit");
  assert.ok(ctx.json.trade_options.some((t) => t.value === "plumbing" && t.services.length));
  assert.equal(ctx.json.form.email, "walkup@example.com");

  const noRoc = await sheet(answers("cs_straight_01", { roc_number: "999999", trade: "plumbing" }));
  assert.equal(noRoc.status, 400);
  assert.match(noRoc.json.errors.roc_number, /isn.t on the ROC active list/);
  const noTrade = await sheet(answers("cs_straight_01", { roc_number: "363035" }));
  assert.match(noTrade.json.errors.trade, /Pick your trade/);
  assert.equal(db().get("SELECT COUNT(*) AS n FROM contractors WHERE roc_number = '363035'").n, 0, "a refused sheet creates nothing");

  const ok = await sheet(answers("cs_straight_01", { roc_number: "363035", trade: "plumbing", services: ["Water Heaters", "Repiping"], service_area: ["Tucson"], hours: "weekdays" }));
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.site_url, "https://deals-enterprises-llc.sites.test/");
  const home = await req("GET", "/", { host: "deals-enterprises-llc.sites.test" });
  assert.equal(home.status, 200);
  assert.doesNotMatch(home.text, /Free demo built for/);
  assert.match(home.text, /Repiping/);
  const c = db().get("SELECT stage FROM contractors WHERE roc_number = '363035'");
  assert.equal(c.stage, "live");
  const sub = db().get("SELECT site_id FROM subscriptions WHERE id = 'sub_cs_straight_01'");
  assert.ok(sub.site_id, "the subscription is tied to the new site");
  const again = await req("GET", "/api/onboard?session_id=cs_straight_01", { host: "sales.test" });
  assert.equal(again.json.needs_roc, false, "the second visit edits the built site");
  assert.equal(again.json.plan_name, "Full Marketing Kit");
});

test("the sales pages ship wired to this server, not the old Netlify and Apps Script stack", async () => {
  for (const page of ["/", "/thanks.html"]) {
    const r = await req("GET", page, { host: "sales.test" });
    assert.equal(r.status, 200, page);
    assert.doesNotMatch(r.text, /netlify|script\.google\.com|acp-backend/i, page);
  }
  const home = await req("GET", "/", { host: "sales.test" });
  assert.match(home.text, /data-endpoint="\/api\/demo"/);
  assert.match(home.text, /href="\/api\/checkout\?tier=pro"/);
  assert.doesNotMatch(home.text, /Google Sheet|Drive folder/);
  assert.match(home.text, /azcontractorpro\.net/, "canonical is the .net domain");
});
