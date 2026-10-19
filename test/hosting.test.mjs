import { req, admin, liveSite, startServer, stopServer, TMP } from "./helpers.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

let api;
before(async () => { await startServer(); api = await admin(); });
after(stopServer);

test("admin API needs a session, and a CSRF header on writes", async () => {
  assert.equal((await req("GET", "/api/admin/me")).status, 401);
  assert.equal((await req("POST", "/api/admin/login", { body: { email: "admin@example.com", password: "nope-nope-nope" } })).status, 401);
  const login = await req("POST", "/api/admin/login", { body: { email: "admin@example.com", password: "correct-horse-battery" } });
  const cookie = String(login.headers["set-cookie"][0]).split(";")[0];
  assert.match(login.headers["set-cookie"][0], /HttpOnly/);
  const noCsrf = await req("POST", "/api/admin/contractors", { cookie, body: { business_name: "X" }, headers: { "Content-Type": "application/json" } });
  assert.equal(noCsrf.status, 403);
  assert.equal((await req("GET", "/api/admin/me", { cookie })).json.user.email, "admin@example.com");
});

test("admin pages carry a strict CSP", async () => {
  const r = await req("GET", "/admin/");
  assert.equal(r.status, 200);
  assert.match(r.headers["content-security-policy"], /script-src 'self'/);
});

test("a contractor from the ROC list becomes a published site served on its subdomain", async () => {
  const { site } = await liveSite(api);
  assert.equal(site.slug, "luis-rojo-masonry-llc");
  const home = await req("GET", "/", { host: "luis-rojo-masonry-llc.sites.test" });
  assert.equal(home.status, 200);
  assert.match(home.text, /ROC #337881/);
  assert.match(home.text, /data-endpoint="\/_acp\/lead\/luis-rojo-masonry-llc"/);
  assert.match(home.text, /<link rel="canonical" href="https:\/\/luis-rojo-masonry-llc\.sites\.test\/">/);
  assert.equal(home.headers["x-robots-tag"], undefined, "an active site is indexable");

  assert.equal((await req("GET", "/services/", { host: "luis-rojo-masonry-llc.sites.test" })).status, 200);
  assert.equal((await req("GET", "/areas/marana.html", { host: "luis-rojo-masonry-llc.sites.test" })).status, 200);
  const dirNoSlash = await req("GET", "/services", { host: "luis-rojo-masonry-llc.sites.test" });
  assert.equal(dirNoSlash.status, 301);
  assert.equal(dirNoSlash.headers.location, "/services/");
  const missing = await req("GET", "/nope", { host: "luis-rojo-masonry-llc.sites.test" });
  assert.equal(missing.status, 404);
  assert.match(missing.text, /That page is not here/);

  const css = await req("GET", "/assets/site.css", { host: "luis-rojo-masonry-llc.sites.test" });
  const again = await req("GET", "/assets/site.css", { host: "luis-rojo-masonry-llc.sites.test", headers: { "If-None-Match": css.headers.etag } });
  assert.equal(again.status, 304);
});

test("path previews on the app host are sandboxed and noindex", async () => {
  const r = await req("GET", "/s/luis-rojo-masonry-llc/");
  assert.equal(r.status, 200);
  assert.match(r.headers["content-security-policy"], /^sandbox/);
  assert.equal(r.headers["x-robots-tag"], "noindex");
});

test("a draft is only visible at the preview path", async () => {
  const c = await api("POST", "/api/admin/contractors", { body: { business_name: "Draft Fence Co", roc_number: "111111", phone: "5205550101", city: "Tucson", trade: "fencing" } });
  const s = await api("POST", "/api/admin/sites", { body: { contractor_id: c.json.contractor.id } });
  assert.equal(s.json.site.status, "draft");
  assert.equal((await api("POST", `/api/admin/sites/${s.json.site.id}/publish`, { body: {} })).status, 200);
  assert.equal((await req("GET", "/", { host: `${s.json.site.slug}.sites.test` })).status, 404);
  assert.equal((await req("GET", `/s/${s.json.site.slug}/`)).status, 200);
});

test("the editor previews unsaved edits without publishing them", async () => {
  const site = (await api("GET", "/api/admin/sites/1")).json.site;
  const spec = { ...site.spec, business: { ...site.spec.business, tagline: "Unsaved headline here" } };
  const p = await api("POST", "/api/admin/sites/1/preview", { body: { spec } });
  assert.equal(p.status, 200);
  assert.equal(p.json.checks.counts.fail, 0);
  const page = await req("GET", p.json.url);
  assert.match(page.text, /Unsaved headline here/);
  assert.match(page.headers["content-security-policy"], /^sandbox/);
  const live = await req("GET", "/", { host: "luis-rojo-masonry-llc.sites.test" });
  assert.doesNotMatch(live.text, /Unsaved headline here/);
  assert.equal((await req("GET", "/admin/preview/0123456789abcdef0123456789abcdef/")).status, 410);
});

test("publishing refuses a site that fails its checks, unless forced", async () => {
  const site = (await api("GET", "/api/admin/sites/1")).json.site;
  const broken = { ...site.spec, contact: { ...site.spec.contact, phone: "" } };
  await api("PATCH", "/api/admin/sites/1", { body: { spec: broken } });
  const r = await api("POST", "/api/admin/sites/1/publish", { body: {} });
  assert.equal(r.status, 422);
  assert.ok(r.json.checks.issues.some((i) => i.rule === "contact.phone" || i.rule === "spec.contact.phone"));
  await api("PATCH", "/api/admin/sites/1", { body: { spec: site.spec } });
  assert.equal((await api("POST", "/api/admin/sites/1/publish", { body: {} })).status, 200);
});

test("custom domains: www twin, TLS ask, primary redirect", async () => {
  const add = await api("POST", "/api/admin/sites/1/domains", { body: { domain: "https://LuisRojosMasonry.com/" } });
  assert.deepEqual(add.json.domains.map((d) => d.domain).sort(), ["luisrojosmasonry.com", "www.luisrojosmasonry.com"]);
  assert.equal((await api("POST", "/api/admin/sites/1/domains", { body: { domain: "app.test" } })).status, 400);
  assert.equal((await api("POST", "/api/admin/sites/1/domains", { body: { domain: "x.sites.test" } })).status, 400);

  assert.equal((await req("GET", "/", { host: "luisrojosmasonry.com" })).status, 200);
  assert.equal((await req("GET", "/_acp/tls-ask?domain=www.luisrojosmasonry.com")).status, 200);
  assert.equal((await req("GET", "/_acp/tls-ask?domain=luis-rojo-masonry-llc.sites.test")).status, 200);
  assert.equal((await req("GET", "/_acp/tls-ask?domain=nobody.sites.test")).status, 404);
  assert.equal((await req("GET", "/_acp/tls-ask?domain=evil.example")).status, 404);
  assert.equal((await req("GET", "/_acp/tls-ask?domain=sales.test")).status, 200);

  // whoami answers on any host, which is how Verify proves DNS reaches us.
  const who = await req("GET", "/_acp/whoami", { host: "luisrojosmasonry.com" });
  assert.match(who.text, /^[a-f0-9]{24}$/);

  // Make it primary directly (Verify needs real DNS); everything else redirects.
  const { addDomain } = await import("../src/sites.mjs");
  addDomain(1, "luisrojosmasonry.com", { primary: true });
  const r = await req("GET", "/services/?x=1", { host: "luis-rojo-masonry-llc.sites.test" });
  assert.equal(r.status, 301);
  assert.equal(r.headers.location, "https://luisrojosmasonry.com/services/?x=1");
  assert.equal((await req("GET", "/", { host: "www.luisrojosmasonry.com" })).status, 301);
  assert.equal((await req("GET", "/", { host: "luisrojosmasonry.com" })).status, 200);
  await api("POST", "/api/admin/sites/1/publish", { body: {} });
  assert.match((await req("GET", "/", { host: "luisrojosmasonry.com" })).text, /canonical" href="https:\/\/luisrojosmasonry\.com\/"/);
  await api("DELETE", "/api/admin/sites/1/domains/luisrojosmasonry.com");
  await api("DELETE", "/api/admin/sites/1/domains/www.luisrojosmasonry.com");
});

test("unknown hosts get a plain 404", async () => {
  const r = await req("GET", "/", { host: "who-is-this.example" });
  assert.equal(r.status, 404);
  assert.match(r.text, /No site here/);
});

test("rollback serves an earlier release again", async () => {
  const site = (await api("GET", "/api/admin/sites/1")).json.site;
  const first = site.current_release;
  await api("PATCH", "/api/admin/sites/1", { body: { spec: { ...site.spec, business: { ...site.spec.business, tagline: "A newer headline" } } } });
  await api("POST", "/api/admin/sites/1/publish", { body: {} });
  assert.match((await req("GET", "/", { host: "luis-rojo-masonry-llc.sites.test" })).text, /A newer headline/);
  const rb = await api("POST", "/api/admin/sites/1/rollback", { body: { release: first } });
  assert.equal(rb.json.site.current_release, first);
  assert.doesNotMatch((await req("GET", "/", { host: "luis-rojo-masonry-llc.sites.test" })).text, /A newer headline/);
});

test("the live site downloads as a working zip", async () => {
  const r = await api("GET", "/api/admin/sites/1/zip");
  assert.equal(r.status, 200);
  assert.equal(r.headers["content-type"], "application/zip");
  const file = path.join(TMP, "site.zip");
  fs.writeFileSync(file, r.buf);
  let listing;
  try { listing = execFileSync("unzip", ["-l", file]).toString(); } catch { listing = null; }
  if (listing !== null) {
    assert.match(listing, /luis-rojo-masonry-llc\/index\.html/);
    execFileSync("unzip", ["-tq", file]);
  } else {
    assert.equal(r.buf.readUInt32LE(0), 0x04034b50);
  }
});

test("path traversal never leaves the release directory", async () => {
  for (const p of ["/../../../../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/assets/..%2f..%2f..%2fetc%2fpasswd", "/%00"]) {
    const r = await req("GET", p, { host: "luis-rojo-masonry-llc.sites.test" });
    assert.ok([301, 400, 404].includes(r.status), `${p} → ${r.status}`);
    assert.doesNotMatch(r.text, /root:x:0/);
  }
});

test("the sales site is served on its host and the app host", async () => {
  const r = await req("GET", "/", { host: "sales.test" });
  assert.equal(r.status, 200);
  assert.match(r.text, /data-endpoint="\/api\/demo"/);
  assert.match(r.text, /href="\/api\/checkout\?tier=pro"/);
  assert.equal((await req("GET", "/sales/", { host: "app.test" })).status, 200);
  assert.equal((await req("GET", "/api/admin/me", { host: "sales.test" })).status, 404, "admin API is app-host only");
});
