import { req, admin, liveSite, startServer, stopServer } from "./helpers.mjs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { outbox } from "../src/mail.mjs";
import { leadsCsv } from "../src/leads.mjs";
import { imagesAvailable } from "../src/photos.mjs";
import { db } from "../src/db.mjs";

let api;
let site;
const HOST = "luis-rojo-masonry-llc.sites.test";
before(async () => {
  await startServer();
  api = await admin();
  ({ site } = await liveSite(api));
});
after(stopServer);

const lead = (body, opts = {}) => req("POST", `/_acp/lead/${site.slug}`, { host: HOST, body, headers: { "Content-Type": "text/plain;charset=utf-8" }, ...opts });

test("a lead from the site is stored, emailed, and de-duplicated", async () => {
  const before = outbox.length;
  const r = await lead({ name: "Maria G", phone: "520-555-1111", service: "Block Walls", city: "Marana", timeline: "Within a month", message: "40 ft wall", business: "x", company_url: "" });
  assert.equal(r.status, 200);
  assert.equal(r.headers["access-control-allow-origin"], "*");
  assert.equal(typeof r.json.id, "number");
  const mail = outbox.slice(before).find((m) => /New estimate request/.test(m.subject));
  assert.ok(mail, "lead email sent");
  assert.equal(mail.to, "owner@example.com");
  assert.match(mail.text, /Marana/);
  assert.equal((await lead({ name: "Maria G", phone: "520-555-1111", service: "Block Walls", city: "Marana", timeline: "Within a month", message: "40 ft wall" })).json.id, "duplicate");
});

test("lead validation, honeypot and unknown sites", async () => {
  assert.equal((await lead({ name: "", phone: "5205551111" })).status, 400);
  assert.equal((await lead({ name: "No Contact" })).status, 400);
  assert.equal((await lead({ name: "Bot", phone: "5205551111", company_url: "http://spam" })).json.id, "ignored");
  assert.equal((await req("POST", "/_acp/lead/nope", { host: HOST, body: { name: "A", phone: "5205551111" } })).status, 404);
  const pre = await req("OPTIONS", `/_acp/lead/${site.slug}`, { host: HOST });
  assert.equal(pre.status, 204);
  const sent = outbox.length;
  await lead({ name: "Two Addresses", phone: "5205553333", email: "a@example.com, b@example.com" });
  assert.equal(outbox.slice(sent).find((m) => /Two Addresses/.test(m.subject))?.replyTo, undefined, "Reply-To takes one valid address only");
});

test("lead CSV neutralises spreadsheet formulas", () => {
  const csv = leadsCsv([{ created_at: "t", name: "=HYPERLINK(\"x\")", phone: "+1 520", message: "a,b" }]);
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /'\+1 520/);
  assert.match(csv, /"a,b"/);
});

test("the admin lead inbox lists and updates leads", async () => {
  const list = await api("GET", "/api/admin/leads");
  assert.ok(list.json.leads.length >= 1);
  const id = list.json.leads[0].id;
  const u = await api("PATCH", `/api/admin/leads/${id}`, { body: { status: "contacted", notes: "called back" } });
  assert.equal(u.json.lead.status, "contacted");
  assert.equal((await api("PATCH", `/api/admin/leads/${id}`, { body: { status: "maybe" } })).status, 400);
  const csv = await api("GET", "/api/admin/leads?format=csv");
  assert.match(csv.headers["content-type"], /text\/csv/);
});

let token;
const linkIn = (text) => /\/portal\/#link=([\w-]+)/.exec(text)?.[1];
const askForLink = (ident) => req("POST", "/api/portal/link", { body: { site: ident } });
const signIn = (link) => req("POST", "/api/portal/sign-in", { body: { link } });
const linkMails = (from) => outbox.slice(from).filter((m) => /Sign in to your/.test(m.subject));

test("portal: a sign-in link goes to the email on record and works once", async () => {
  for (const ident of [site.slug, "owner@example.com", `${site.slug}.sites.test`]) {
    const sent = outbox.length;
    assert.equal((await askForLink(ident)).status, 200);
    const [mail] = linkMails(sent);
    assert.equal(mail?.to, "owner@example.com", ident);
    const link = linkIn(mail.text);
    const ok = await signIn(link);
    assert.equal(ok.status, 200, ok.text);
    token = ok.json.token;
    assert.equal((await signIn(link)).status, 410, "a link works once");
  }
  const me = await req("GET", "/api/portal/me", { headers: { "x-portal-token": token } });
  assert.equal(me.json.site.slug, site.slug);
  assert.match(me.json.reviewLink, /\/_acp\/review\/luis-rojo-masonry-llc$/);
  assert.equal((await req("GET", "/api/portal/me", { headers: { "x-portal-token": token + "x" } })).status, 401);
});

test("portal: the link form gives nothing away and never mails a typed address", async () => {
  const sent = outbox.length;
  const known = await askForLink(site.slug);
  const unknown = await askForLink("nobody@example.com");
  assert.deepEqual(unknown.json, known.json, "the same answer whether or not anything matched");
  // The lead email can be changed from the portal, so it finds the site but never receives the link.
  await api("PATCH", `/api/admin/sites/${site.id}`, { body: { notify_email: "leads@example.com" } });
  await askForLink("leads@example.com");
  await api("PATCH", `/api/admin/sites/${site.id}`, { body: { notify_email: "owner@example.com" } });
  assert.deepEqual(linkMails(sent).map((m) => m.to), ["owner@example.com", "owner@example.com"]);
});

test("admin: email or hand over a link; 'sign out everywhere' ends sessions and unused links", async () => {
  const sent = outbox.length;
  const emailed = await api("POST", `/api/admin/sites/${site.id}/portal-link`, { body: { send: true } });
  assert.equal(emailed.json.emailed, "owner@example.com");
  assert.match(linkMails(sent)[0].text, /works once, for 3 days/);
  const handed = linkIn((await api("POST", `/api/admin/sites/${site.id}/portal-link`, { body: {} })).json.url);
  assert.ok(handed);

  assert.equal((await api("POST", `/api/admin/sites/${site.id}/portal-sign-out`, { body: {} })).status, 200);
  assert.equal((await req("GET", "/api/portal/me", { headers: { "x-portal-token": token } })).status, 401, "sessions end");
  assert.equal((await signIn(handed)).status, 410, "unused links stop working");
  const fresh = await signIn(linkIn((await api("POST", `/api/admin/sites/${site.id}/portal-link`, { body: {} })).json.url));
  assert.equal(fresh.status, 200);
  token = fresh.json.token;
});

test("portal: links expire, the form cannot flood an inbox, and a suspended site stays shut", async () => {
  const late = linkIn((await api("POST", `/api/admin/sites/${site.id}/portal-link`, { body: {} })).json.url);
  db().run("UPDATE portal_links SET expires_at = ? WHERE used_at IS NULL", [new Date(Date.now() - 1000).toISOString()]);
  assert.equal((await signIn(late)).status, 410);

  db().run("DELETE FROM throttle"); // a fresh hour
  const sent = outbox.length;
  for (let i = 0; i < 8; i++) assert.equal((await askForLink(site.slug)).status, 200);
  assert.equal(linkMails(sent).length, 5, "five sign-in emails a site per hour");

  await api("PATCH", `/api/admin/sites/${site.id}`, { body: { status: "suspended" } });
  const shut = await signIn(linkIn((await api("POST", `/api/admin/sites/${site.id}/portal-link`, { body: {} })).json.url));
  assert.equal(shut.status, 403);
  assert.equal((await req("GET", "/api/portal/me", { headers: { "x-portal-token": token } })).status, 403);
  await api("PATCH", `/api/admin/sites/${site.id}`, { body: { status: "active" } });
  assert.equal((await req("GET", "/api/portal/me", { headers: { "x-portal-token": token } })).status, 200);
});

const portal = (method, p, body, headers = {}) => req(method, `/api/portal${p}`, {
  body, headers: { "x-portal-token": token, "Content-Type": "application/json", ...headers },
});

test("portal: leads are scoped to the contractor's own site", async () => {
  const r = await portal("GET", "/leads");
  assert.ok(r.json.leads.every((l) => l.site_id === site.id));
  const other = await liveSite(api, { roc: "355392" });
  const foreign = await req("POST", `/_acp/lead/${other.site.slug}`, { host: `${other.site.slug}.sites.test`, body: { name: "Other", phone: "5205552222" } });
  assert.equal((await portal("PATCH", `/leads/${foreign.json.id}`, { status: "won" })).status, 404);
});

test("portal: profile edits republish the site; licence facts stay locked", async () => {
  const before = (await portal("GET", "/profile")).json.profile;
  const r = await portal("PATCH", "/profile", {
    tagline: "Walls that stay standing", cities: "Marana\nVail", services: [{ name: "Block Walls", blurb: "Built on a real footing." }],
    hours: [{ days: "Mo,Tu,We,Th,Fr", opens: "06:00", closes: "15:00" }], name: "Someone Else LLC", rocNumber: "999999",
  });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.publish.manifest, "republished");
  assert.deepEqual(r.json.profile.cities, ["Tucson", "Marana", "Vail"]);
  assert.equal(r.json.profile.locked.name, before.locked.name);
  assert.equal(r.json.profile.locked.rocNumber, "337881");
  const home = await req("GET", "/", { host: HOST });
  assert.match(home.text, /Walls that stay standing/);
  assert.equal((await portal("PATCH", "/profile", { hours: [{ days: "Monday", opens: "6am", closes: "3pm" }] })).status, 400);
  assert.equal((await portal("PATCH", "/profile", { services: [] })).status, 400);
});

test("portal: a contractor who works only in their home city can save", async () => {
  // The portal sends the "other cities" box, which is empty for them, on every save.
  for (let i = 0; i < 2; i++) {
    const r = await portal("PATCH", "/profile", { tagline: "Walls that stay standing", cities: "" });
    assert.equal(r.status, 200, r.text);
    assert.deepEqual(r.json.profile.cities, ["Tucson"]);
  }
});

test("portal: an edit that fails the checks changes nothing, lead email included", async () => {
  const before = (await portal("GET", "/me")).json.notify_email;
  const r = await portal("PATCH", "/profile", { tagline: "Lorem ipsum dolor", notify_email: "elsewhere@example.com" });
  assert.equal(r.status, 422);
  assert.equal((await portal("GET", "/me")).json.notify_email, before);
  assert.equal((await portal("GET", "/profile")).json.profile.tagline, "Walls that stay standing");
});

test("reviews: collected on the site, approved in the portal, published honestly", async () => {
  const page = await req("GET", `/_acp/review/${site.slug}`, { host: HOST });
  assert.equal(page.status, 200);
  assert.match(page.text, /How did we do\?/);
  const bad = await req("POST", `/_acp/review/${site.slug}`, { host: HOST, body: "name=Tom&rating=5&text=short", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  assert.equal(bad.status, 400);
  assert.match(bad.text, /at least a sentence/);
  const ok = await req("POST", `/_acp/review/${site.slug}`, {
    host: HOST, headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "name=Tom+R&city=Tucson&rating=4&text=Rebuilt+our+cracked+wall+in+two+days.&consent=1",
  });
  assert.equal(ok.status, 303);
  assert.ok(outbox.some((m) => /New 4-star review/.test(m.subject) && /16 CFR 465\.7/.test(m.text)));

  // Pending reviews are not on the site, and there is no rating markup yet.
  let home = await req("GET", "/", { host: HOST });
  assert.doesNotMatch(home.text, /Rebuilt our cracked wall/);
  assert.doesNotMatch(home.text, /aggregateRating/);

  const { reviews } = (await portal("GET", "/reviews")).json;
  const r = await portal("PATCH", `/reviews/${reviews[0].id}`, { status: "approved" });
  assert.equal(r.status, 200);
  home = await req("GET", "/", { host: HOST });
  assert.match(home.text, /Rebuilt our cracked wall in two days/);
  assert.match(home.text, /"aggregateRating":\{"@type":"AggregateRating","ratingValue":"4.0","reviewCount":1/);
});

test("photos: re-encoded without EXIF, published into the gallery", { skip: !imagesAvailable() && "sharp not installed" }, async () => {
  const sharp = (await import("sharp")).default;
  const jpeg = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: "#a0522d" } })
    .withExif({ IFD0: { Copyright: "secret" }, GPS: { GPSLatitudeRef: "N" } }).jpeg().toBuffer();
  assert.ok((await sharp(jpeg).metadata()).exif, "fixture has EXIF");
  const up = await req("POST", "/api/portal/photos?category=Block%20Walls&name=IMG_0042.jpg", {
    body: jpeg, headers: { "x-portal-token": token, "Content-Type": "image/jpeg" },
  });
  assert.equal(up.status, 201, up.text);
  assert.equal(up.json.photo.name, "IMG 0042");
  const notImage = await req("POST", "/api/portal/photos", { body: "hello", headers: { "x-portal-token": token } });
  assert.equal(notImage.status, 415);

  await portal("PATCH", `/photos/${up.json.photo.id}`, { hero: true });
  assert.equal((await portal("POST", "/publish")).status, 200);
  const home = await req("GET", "/", { host: HOST });
  assert.match(home.text, new RegExp(`class="hero-img" src="assets/photos/${up.json.photo.id}\\.jpg"`));
  const img = await req("GET", `/assets/photos/${up.json.photo.id}.jpg`, { host: HOST });
  assert.equal(img.status, 200);
  assert.match(img.headers["cache-control"], /immutable/);
  const meta = await sharp(img.buf).metadata();
  assert.equal(meta.width, 1600);
  assert.equal(meta.exif, undefined, "EXIF stripped");
  const { getSite, releaseDir, photoFile } = await import("../src/sites.mjs");
  const live = getSite(site.id);
  const inRelease = fs.statSync(path.join(releaseDir(live, live.current_release), "assets", "photos", `${up.json.photo.id}.jpg`));
  assert.equal(inRelease.ino, fs.statSync(photoFile(site.id, up.json.photo.id, 1600)).ino, "the release links the photo, not a copy");
});

test("free demo: an active licence is built, published, and emailed in one request", async () => {
  const r = await req("POST", "/api/demo", {
    host: "sales.test", headers: { "Content-Type": "text/plain" },
    body: { name: "Eduardo A", email: "ed@example.com", phone: "(520) 240-4802", roc: "363035", service: "Plumbing", city: "Tucson" },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.status, "live");
  assert.equal(r.json.url, "https://deals-enterprises-llc.sites.test/");
  const home = await req("GET", "/", { host: "deals-enterprises-llc.sites.test" });
  assert.match(home.text, /Free demo built for D\.E\.A\.L\.S Enterprises LLC/);
  assert.match(home.text, /api\/checkout\?tier=pro&amp;site=deals-enterprises-llc/);
  assert.equal(home.headers["x-robots-tag"], "noindex");
  const mail = outbox.find((m) => m.to === "ed@example.com");
  assert.ok(mail && /is live/.test(mail.subject));
  assert.match(mail.text, /tier=starter&site=deals-enterprises-llc/);

  const again = await req("POST", "/api/demo", { host: "sales.test", body: { name: "Eduardo A", email: "ed@example.com", phone: "5202404802", roc: "363035" } });
  assert.equal(again.json.url, r.json.url, "a second request reuses the same site");
  const demos = (await api("GET", "/api/admin/demos")).json.demos;
  assert.equal(demos[0].business, "D.E.A.L.S Enterprises LLC");
});

test("free demo: unknown licences and missing phones go to a person", async () => {
  const unknown = await req("POST", "/api/demo", { host: "sales.test", body: { name: "X", email: "x@example.com", phone: "5205550000", roc: "999999" } });
  assert.equal(unknown.json.status, "needs_review");
  const noPhone = await req("POST", "/api/demo", { host: "sales.test", body: { name: "Y", email: "y@example.com", roc: "355392" } });
  assert.equal(noPhone.json.status, "needs_review");
  assert.equal((await req("POST", "/api/demo", { host: "sales.test", body: { name: "Z", email: "not-an-email", roc: "1" } })).status, 400);
  assert.equal((await req("POST", "/api/demo", { host: "sales.test", body: { name: "Bot", email: "b@example.com", roc: "1", company_website: "x" } })).json.status, "ignored");
});

test("free demo: the form's phone and city cannot put markup on the public site", async () => {
  db().run("DELETE FROM throttle WHERE key LIKE 'demo:%'"); // a fresh hour for this connection
  const junk = await req("POST", "/api/demo", { host: "sales.test", body: { name: "M", email: "m@example.com", roc: "300100", phone: "5205550100<svg onload=alert(1)>" } });
  assert.equal(junk.json.status, "needs_review", "digits plus markup is not a phone number");
  const r = await req("POST", "/api/demo", {
    host: "sales.test", body: { name: "Ana R", email: "ana@example.com", roc: "300100", phone: "1 (520) 555-0199", city: "Vail<img src=x onerror=alert(1)>" },
  });
  assert.equal(r.json.status, "live", r.text);
  const host = new URL(r.json.url).host;
  for (const p of ["/", "/no-such-page"]) {
    const page = await req("GET", p, { host });
    assert.doesNotMatch(page.text, /<img src=x|<svg/, p);
    assert.match(page.text, /\(520\) 555-0199/, p);
    assert.match(page.text, /Marana/, "an unusable city falls back to the licence's city");
  }
});

test("contractor pipeline moves forward on its own", async () => {
  const c = (await api("GET", "/api/admin/contractors")).json.contractors.find((x) => x.roc_number === "337881");
  assert.equal(c.stage, "live", "an active site that published");
  const d = (await api("GET", "/api/admin/contractors")).json.contractors.find((x) => x.roc_number === "363035");
  assert.equal(d.stage, "demo");
  const detail = (await api("GET", `/api/admin/contractors/${c.id}`)).json;
  assert.ok(detail.activity.some((a) => a.kind === "lead"));
  assert.ok(detail.activity.some((a) => a.kind === "publish"));
});
