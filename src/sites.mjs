/**
 * sites.mjs — build, publish and serve contractor websites from this VPS.
 *
 *   spec (in SQLite) + photos + approved reviews
 *        │  composeSpec()
 *        ▼
 *   engine/ build() ──► engine/ check() ──► fails block publishing
 *        │  publishSite()
 *        ▼
 *   DATA_DIR/sites/<slug>/releases/<release-id>/   (immutable, one per publish)
 *        │  sites.current_release points at one; rollback just moves the pointer
 *        ▼
 *   served for <slug>.<SITES_DOMAIN>, every custom domain, and <APP_URL>/s/<slug>/
 *
 * The platform owns three spec fields so a contractor can never break them:
 * the lead endpoint (this server), the review link (this server) and the
 * domain (whatever is primary). Everything else is the spec as edited.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { config } from "./config.mjs";
import { db, nowIso, parseJson, getSetting, setSetting } from "./db.mjs";
import { HttpError, esc, resolveStatic, typeOf } from "./http.mjs";
import { build } from "../engine/site.mjs";
import { check } from "../engine/compliance.mjs";
import { normalize } from "../engine/spec.mjs";
import { slug as slugify, telHref } from "../engine/html.mjs";
import { advanceStage, addActivity, getContractor } from "./contractors.mjs";

export const STATUSES = ["draft", "demo", "active", "suspended", "expired"];
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const RESERVED = new Set(["app", "www", "api", "admin", "portal", "mail", "smtp", "ftp", "ns1", "ns2", "static", "assets", "sales", "billing", "status"]);

/* ------------------------------------------------------------- records */

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    spec: parseJson(row.spec, {}),
    copy_overrides: parseJson(row.copy_overrides, {}),
    last_checks: parseJson(row.last_checks, {}),
  };
}

export const getSite = (id) => hydrate(db().get("SELECT * FROM sites WHERE id = ?", [Number(id)]));
export const getSiteBySlug = (slug) => hydrate(db().get("SELECT * FROM sites WHERE slug = ?", [String(slug || "").toLowerCase()]));

export function requireSite(id) {
  const s = getSite(id);
  if (!s) throw new HttpError(404, "no such site");
  return s;
}

export function listSites({ contractorId = null } = {}) {
  const rows = contractorId
    ? db().all("SELECT * FROM sites WHERE contractor_id = ? ORDER BY id", [Number(contractorId)])
    : db().all("SELECT * FROM sites ORDER BY updated_at DESC");
  return rows.map(hydrate);
}

export function uniqueSlug(base) {
  let s = slugify(String(base || "").replace(/\./g, "")).slice(0, 40).replace(/-+$/, "") || "contractor";
  if (RESERVED.has(s)) s = `${s}-site`;
  let candidate = s;
  for (let i = 2; db().get("SELECT id FROM sites WHERE slug = ?", [candidate]); i++) candidate = `${s}-${i}`;
  return candidate;
}

export function validSlug(s) {
  return SLUG_RE.test(String(s || "")) && !RESERVED.has(s);
}

export function createSite({ contractorId, spec = {}, tier = "pro", status = "draft", slug = "", notifyEmail = "" }) {
  const c = getContractor(contractorId);
  if (!c) throw new HttpError(404, "no such contractor");
  const s = slug ? String(slug).toLowerCase() : uniqueSlug(spec?.business?.name || c.business_name);
  if (!validSlug(s)) throw new HttpError(400, "slug must be lowercase letters, numbers and dashes");
  if (getSiteBySlug(s)) throw new HttpError(409, `the address ${s} is taken`);
  if (!STATUSES.includes(status)) throw new HttpError(400, "bad status");
  const preset = config.tiers[tier]?.pages;
  const merged = { ...spec, site: { ...(spec.site || {}), pages: { ...(preset || {}), ...(spec.site?.pages || {}) } } };
  const expires = status === "demo" ? new Date(Date.now() + config.demo.expire_days * 864e5).toISOString() : null;
  const { id } = db().run(
    `INSERT INTO sites (contractor_id, slug, status, tier, spec, notify_email, demo_expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [c.id, s, status, tier, JSON.stringify(merged), notifyEmail || c.email || "", expires],
  );
  addActivity(c.id, "site", `Site created: ${s}`);
  return getSite(id);
}

export function updateSite(id, patch) {
  const site = requireSite(id);
  const sets = [];
  const vals = [];
  if (patch.spec !== undefined) { sets.push("spec = ?"); vals.push(JSON.stringify(patch.spec || {})); }
  if (patch.copy_overrides !== undefined) { sets.push("copy_overrides = ?"); vals.push(JSON.stringify(patch.copy_overrides || {})); }
  if (patch.notify_email !== undefined) { sets.push("notify_email = ?"); vals.push(String(patch.notify_email || "").trim().slice(0, 200)); }
  if (patch.tier !== undefined) {
    if (!config.tiers[patch.tier]) throw new HttpError(400, "unknown tier");
    sets.push("tier = ?"); vals.push(patch.tier);
  }
  if (patch.status !== undefined) {
    if (!STATUSES.includes(patch.status)) throw new HttpError(400, `status must be one of ${STATUSES.join(", ")}`);
    sets.push("status = ?"); vals.push(patch.status);
    if (patch.status !== "demo") { sets.push("demo_expires_at = NULL"); }
  }
  if (patch.portal_pin_hash !== undefined) { sets.push("portal_pin_hash = ?"); vals.push(patch.portal_pin_hash); }
  if (!sets.length) return site;
  db().run(`UPDATE sites SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, [...vals, nowIso(), site.id]);
  return getSite(site.id);
}

export function deleteSite(id) {
  const site = requireSite(id);
  db().run("DELETE FROM sites WHERE id = ?", [site.id]);
  fs.rmSync(path.join(config.sitesDir, site.slug), { recursive: true, force: true });
  fs.rmSync(path.join(config.mediaDir, String(site.id)), { recursive: true, force: true });
  return true;
}

/* ------------------------------------------------------------- domains */

export function normDomain(d) {
  return String(d || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "").replace(/\.$/, "");
}

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const subdomainFor = (site) => (config.sitesDomain ? `${site.slug}.${config.sitesDomain}` : "");

export function domainsFor(siteId) {
  return db().all("SELECT * FROM domains WHERE site_id = ? ORDER BY is_primary DESC, domain", [Number(siteId)]);
}

export function addDomain(siteId, domain, { primary = false } = {}) {
  const site = requireSite(siteId);
  const d = normDomain(domain);
  if (!DOMAIN_RE.test(d)) throw new HttpError(400, `"${domain}" is not a domain name`);
  if (d === config.appHost || config.salesHosts.includes(d) ||
      (config.sitesDomain && (d === config.sitesDomain || d.endsWith(`.${config.sitesDomain}`)))) {
    throw new HttpError(400, "that hostname belongs to the platform");
  }
  const owner = db().get("SELECT site_id FROM domains WHERE domain = ?", [d]);
  if (owner && owner.site_id !== site.id) throw new HttpError(409, `${d} is already attached to another site`);
  db().tx(() => {
    if (primary) db().run("UPDATE domains SET is_primary = 0 WHERE site_id = ?", [site.id]);
    db().run(`INSERT INTO domains (domain, site_id, is_primary) VALUES (?, ?, ?)
              ON CONFLICT(domain) DO UPDATE SET is_primary = excluded.is_primary`, [d, site.id, primary ? 1 : 0]);
    // A bare domain almost always wants www too, and vice versa.
    const twin = d.startsWith("www.") ? d.slice(4) : `www.${d}`;
    if (DOMAIN_RE.test(twin) && !db().get("SELECT 1 FROM domains WHERE domain = ?", [twin])) {
      db().run("INSERT INTO domains (domain, site_id, is_primary) VALUES (?, ?, 0)", [twin, site.id]);
    }
  });
  return domainsFor(site.id);
}

export function removeDomain(siteId, domain) {
  const d = normDomain(domain);
  db().run("DELETE FROM domains WHERE site_id = ? AND domain = ?", [Number(siteId), d]);
  return domainsFor(siteId);
}

export function primaryHost(site) {
  const p = db().get("SELECT domain FROM domains WHERE site_id = ? AND is_primary = 1", [site.id]);
  return p ? p.domain : subdomainFor(site);
}

export function siteUrls(site) {
  const primary = primaryHost(site);
  return {
    primary: primary ? `https://${primary}/` : `${config.appUrl}/s/${site.slug}/`,
    subdomain: subdomainFor(site) ? `https://${subdomainFor(site)}/` : "",
    preview: `${config.appUrl}/s/${site.slug}/`,
    domains: domainsFor(site.id).map((d) => ({ ...d, url: `https://${d.domain}/` })),
  };
}

/** Which site answers for a Host header, if any. */
export function siteForHost(hostname) {
  const h = normDomain(hostname);
  if (!h) return null;
  if (config.sitesDomain && h.endsWith(`.${config.sitesDomain}`)) {
    const sub = h.slice(0, -(config.sitesDomain.length + 1));
    if (!sub.includes(".")) return getSiteBySlug(sub);
  }
  const row = db().get("SELECT site_id FROM domains WHERE domain = ?", [h]);
  return row ? getSite(row.site_id) : null;
}

/** Caddy's on-demand TLS asks before issuing a certificate. Only known names pass. */
export function hostAllowed(hostname) {
  const h = normDomain(hostname);
  if (!h) return false;
  if (h === normDomain(config.appHost) || config.salesHosts.includes(h)) return true;
  return Boolean(siteForHost(h));
}

/* --------------------------------------------------------------- build */

export function photosFor(siteId) {
  return db().all("SELECT * FROM photos WHERE site_id = ? ORDER BY is_hero DESC, sort_order, uploaded_at", [Number(siteId)]);
}

export function approvedReviews(siteId) {
  return db().all("SELECT * FROM reviews WHERE site_id = ? AND status = 'approved' ORDER BY id DESC", [Number(siteId)]);
}

export const photoFile = (siteId, id, w) => path.join(config.mediaDir, String(siteId), `${id}-w${w}.jpg`);

/** The spec as edited, plus the parts the platform owns. */
export function composeSpec(site) {
  const spec = structuredClone(site.spec || {});
  spec.slug = site.slug;
  spec.integrations = {
    ...(spec.integrations || {}),
    leadEndpoint: `/_acp/lead/${site.slug}`,
    reviewUrl: `/_acp/review/${site.slug}`,
    notificationEmail: site.notify_email || spec.integrations?.notificationEmail || "",
  };
  spec.site = { ...(spec.site || {}), domain: primaryHost(site) };
  const proof = spec.proof || {};
  const photos = photosFor(site.id);
  const fromPortal = photos.map((p) => ({
    src: `assets/photos/${p.id}.jpg`,
    thumb: `assets/photos/${p.id}-t.jpg`,
    alt: p.name,
    service: p.category && p.category !== "General" ? p.category : "",
  }));
  spec.proof = {
    ...proof,
    // The hero uses gallery[0], which is why the hero photo sorts first.
    gallery: [...fromPortal, ...(Array.isArray(proof.gallery) ? proof.gallery : [])],
    reviews: [
      ...(Array.isArray(proof.reviews) ? proof.reviews : []),
      ...approvedReviews(site.id).map((r) => ({ name: r.name, city: r.city, rating: r.rating, text: r.text, source: "" })),
    ],
  };
  return { spec, photos };
}

/** Build in memory and check. Nothing is written. */
export function buildSite(site, { now = new Date() } = {}) {
  const { spec, photos } = composeSpec(site);
  const { issues } = normalize(spec);
  const fatal = issues.filter((i) => i.level === "error");
  const result = build(spec, { now, copy: Object.keys(site.copy_overrides || {}).length ? site.copy_overrides : null });
  // Photo files join the tree before the check, so links to them resolve.
  for (const p of photos) {
    result.files[`assets/photos/${p.id}.jpg`] = { copyFrom: photoFile(site.id, p.id, 1600) };
    result.files[`assets/photos/${p.id}-t.jpg`] = { copyFrom: photoFile(site.id, p.id, 600) };
  }
  const verdict = check(result);
  if (fatal.length) {
    for (const f of fatal) verdict.issues.unshift({ level: "fail", rule: `spec.${f.field}`, message: f.message, where: "" });
    verdict.counts.fail += fatal.length;
    verdict.ok = false;
  }
  return { ...result, verdict, specIssues: issues };
}

/* ------------------------------------------------------------- publish */

const releaseRoot = (site) => path.join(config.sitesDir, site.slug, "releases");
export const releaseDir = (site, id) => path.join(releaseRoot(site), id);

/**
 * Photos are written once under a fresh id and never changed, so a release
 * hard-links them rather than copying: the kept releases of a 300-photo
 * gallery then cost its photos once instead of once each. Copy is the
 * fallback, for a sites directory on another filesystem.
 */
function linkOrCopy(src, dest) {
  try { fs.linkSync(src, dest); } catch { fs.copyFileSync(src, dest); }
}

function newReleaseId(now = new Date()) {
  return `${now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${crypto.randomBytes(3).toString("hex")}`;
}

/**
 * Build, check, write a new release and point the site at it.
 * Refuses on a failed check unless force (an admin decision, logged).
 */
export function publishSite(siteId, { force = false, author = "" } = {}) {
  const site = requireSite(siteId);
  const result = buildSite(site);
  const checks = { ok: result.verdict.ok, counts: result.verdict.counts, issues: result.verdict.issues.slice(0, 200), at: nowIso() };
  db().run("UPDATE sites SET last_checks = ? WHERE id = ?", [JSON.stringify(checks), site.id]);
  if (!result.verdict.ok && !force) {
    throw new HttpError(422, "The site failed its checks, so it was not published.", { checks });
  }

  const id = newReleaseId();
  const dir = releaseDir(site, id);
  const tmp = `${dir}.tmp`;
  let bytes = 0;
  fs.mkdirSync(tmp, { recursive: true });
  try {
    for (const [p, contents] of Object.entries(result.files)) {
      const full = path.join(tmp, p);
      if (!full.startsWith(tmp + path.sep)) continue;
      fs.mkdirSync(path.dirname(full), { recursive: true });
      if (contents && typeof contents === "object" && contents.copyFrom) {
        if (fs.existsSync(contents.copyFrom)) {
          linkOrCopy(contents.copyFrom, full);
          bytes += fs.statSync(full).size;
        }
      } else {
        const buf = Buffer.from(String(contents));
        fs.writeFileSync(full, buf);
        bytes += buf.length;
      }
    }
    fs.renameSync(tmp, dir);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
  }

  const now = nowIso();
  db().tx(() => {
    db().run(`INSERT INTO releases (id, site_id, pages, files, bytes, checks, author) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, site.id, result.manifest.pageCount, Object.keys(result.files).length, bytes,
        JSON.stringify({ ok: result.verdict.ok, counts: result.verdict.counts, forced: !result.verdict.ok }), author]);
    db().run("UPDATE sites SET current_release = ?, published_at = ?, updated_at = ? WHERE id = ?", [id, now, now, site.id]);
  });
  addActivity(site.contractor_id, "publish",
    `Published ${site.slug} (${result.manifest.pageCount} pages${result.verdict.ok ? "" : ", checks FORCED past failures"})`, author);
  if (site.status === "demo") advanceStage(site.contractor_id, "demo", "demo site published");
  if (site.status === "active") advanceStage(site.contractor_id, "live", "site published");
  pruneReleases(site);
  return { release: id, manifest: result.manifest, checks, urls: siteUrls(getSite(site.id)) };
}

export function listReleases(siteId) {
  return db().all("SELECT * FROM releases WHERE site_id = ? ORDER BY created_at DESC, id DESC", [Number(siteId)])
    .map((r) => ({ ...r, checks: parseJson(r.checks, {}) }));
}

export function rollback(siteId, releaseId, author = "") {
  const site = requireSite(siteId);
  const rel = db().get("SELECT * FROM releases WHERE site_id = ? AND id = ?", [site.id, String(releaseId)]);
  if (!rel || !fs.existsSync(releaseDir(site, rel.id))) throw new HttpError(404, "that release is gone");
  db().run("UPDATE sites SET current_release = ?, updated_at = ? WHERE id = ?", [rel.id, nowIso(), site.id]);
  addActivity(site.contractor_id, "publish", `Rolled ${site.slug} back to ${rel.id}`, author);
  return getSite(site.id);
}

function pruneReleases(site) {
  const fresh = getSite(site.id);
  const keep = new Set(listReleases(site.id).slice(0, config.releasesToKeep).map((r) => r.id));
  keep.add(fresh.current_release);
  for (const r of listReleases(site.id)) {
    if (keep.has(r.id)) continue;
    fs.rmSync(releaseDir(site, r.id), { recursive: true, force: true });
    db().run("DELETE FROM releases WHERE id = ?", [r.id]);
  }
}

/** Rebuild after a photo, review or portal edit. Never throws; returns why it did not publish. */
export function republishQuietly(siteId, author = "auto") {
  const site = getSite(siteId);
  if (!site || !site.current_release) return { skipped: "not published yet" };
  try {
    return publishSite(site.id, { author });
  } catch (err) {
    return { error: err.message, checks: err.extra?.checks };
  }
}

/* --------------------------------------------------------------- serve */

const PAGE_CSS = "body{margin:0;font:17px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#F7F5F1;color:#1A1A17}" +
  "main{max-width:560px;margin:14vh auto;padding:0 20px}h1{font-size:28px;line-height:1.2;margin:0 0 12px}" +
  "a{color:#13242D;font-weight:600}.btn{display:inline-block;margin-top:14px;padding:13px 20px;background:#13242D;color:#fff;border-radius:8px;text-decoration:none}";

export function simplePage(title, bodyHtml) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${esc(title)}</title><meta name="robots" content="noindex"><style>${PAGE_CSS}</style></head>` +
    `<body><main>${bodyHtml}</main></body></html>`;
}

function contactLine(site) {
  const b = site.spec?.business?.name || site.slug;
  const phone = site.spec?.contact?.phone;
  return phone
    ? `<p>To reach ${esc(b)}, call <a href="tel:${esc(telHref(phone))}">${esc(phone)}</a>.</p>`
    : "";
}

function demoBanner(site) {
  const name = site.spec?.business?.name || "your business";
  const until = site.demo_expires_at ? new Date(site.demo_expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "";
  const buy = `${config.appUrl}/api/checkout?tier=${encodeURIComponent(site.tier || "pro")}&site=${encodeURIComponent(site.slug)}`;
  return `<div style="background:#13242D;color:#EEE6D9;font:600 15px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif;padding:12px 16px;text-align:center;position:relative;z-index:300">` +
    `Free demo built for ${esc(name)} by ${esc(config.brand.name)}${until ? `, live until ${esc(until)}` : ""}. ` +
    `<a href="${esc(buy)}" style="color:#F2A900;margin-left:6px">Keep this site &rarr;</a></div>`;
}

/**
 * Serve one request for a site. `prefix` is "/s/<slug>" on the app host and ""
 * on the site's own hostnames.
 */
export function serveSite(ctx, site, urlPath, { prefix = "" } = {}) {
  const robots = site.status === "demo" || prefix ? { "X-Robots-Tag": "noindex" } : {};
  if (site.status === "suspended") {
    return ctx.html(503, simplePage("Temporarily unavailable",
      `<h1>This site is temporarily unavailable</h1>${contactLine(site)}`), { ...robots, "Retry-After": "86400" });
  }
  if (site.status === "expired") {
    return ctx.html(410, simplePage("Demo expired",
      `<h1>This demo site has expired</h1><p>It was a free preview built by ${esc(config.brand.name)}.</p>${contactLine(site)}`), robots);
  }
  // A draft is only visible at the noindex preview path.
  if (!site.current_release || (site.status === "draft" && !prefix)) {
    return ctx.html(404, simplePage("Coming soon", `<h1>Coming soon</h1>${contactLine(site)}`), { ...robots, "X-Robots-Tag": "noindex" });
  }

  // Secondary hostnames send visitors (and search engines) to the primary one.
  if (!prefix) {
    const primary = primaryHost(site);
    if (primary && primary !== normDomain(ctx.hostname) && db().get("SELECT 1 FROM domains WHERE site_id = ? AND is_primary = 1", [site.id])) {
      return ctx.redirect(`https://${primary}${ctx.url.pathname}${ctx.url.search}`, 301);
    }
  }

  const root = releaseDir(site, site.current_release);
  let hit = resolveStatic(root, urlPath || "/");
  if (hit?.redirect) return ctx.redirect(prefix + hit.redirect + (ctx.url.search || ""), 301);
  let status = 200;
  if (!hit) {
    hit = resolveStatic(root, "/404.html");
    status = 404;
    if (!hit) return ctx.html(404, simplePage("Not found", "<h1>Not found</h1>"), robots);
  }

  const isHtml = hit.file.endsWith(".html");
  const isPhoto = hit.file.includes(`${path.sep}assets${path.sep}photos${path.sep}`);
  const cacheControl = isPhoto ? "public, max-age=31536000, immutable" : "public, no-cache";
  const security = {
    "X-Frame-Options": "SAMEORIGIN",
    // On the app host the site shares an origin with the admin; the sandbox
    // gives it an opaque origin so nothing it runs can reach admin cookies.
    ...(prefix ? { "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox" } : {}),
  };

  if (isHtml && (site.status === "demo" || prefix || status === 404)) {
    let html = fs.readFileSync(hit.file, "utf8");
    if (site.status === "demo") html = html.replace(/<body([^>]*)>/, (m) => `${m}\n${demoBanner(site)}`);
    if (prefix && status === 404) html = html.replaceAll('href="/assets/', `href="${prefix}/assets/`).replaceAll('href="/"', `href="${prefix}/"`);
    return ctx.send(status, html, { "Content-Type": typeOf(hit.file), "Cache-Control": "no-cache", ...robots, ...security });
  }
  return ctx.file(hit.file, { stat: hit.stat, status, cacheControl, headers: { ...robots, ...security } });
}

/* ----------------------------------------------------------------- zip */

/** The current release as a .zip, so a contractor who leaves takes their site. */
export function zipRelease(site) {
  if (!site.current_release) throw new HttpError(404, "nothing published yet");
  const root = releaseDir(site, site.current_release);
  const entries = [];
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else entries.push(full);
    }
  };
  walk(root);

  const local = [];
  const central = [];
  let offset = 0;
  for (const full of entries) {
    const name = Buffer.from(`${site.slug}/${path.relative(root, full).split(path.sep).join("/")}`);
    const data = fs.readFileSync(full);
    const comp = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(8, 8); head.writeUInt32LE(0, 10); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
    local.push(head, name, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10); cen.writeUInt32LE(0, 12);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += head.length + name.length + comp.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cenBuf, end]);
}

/* -------------------------------------------------------------- expiry */

/** Unpaid demos past their date stop serving (the sales page promises they expire). */
export function expireDemos(now = new Date()) {
  const due = db().all("SELECT id, contractor_id, slug FROM sites WHERE status = 'demo' AND demo_expires_at IS NOT NULL AND demo_expires_at < ?", [now.toISOString()]);
  for (const s of due) {
    db().run("UPDATE sites SET status = 'expired', updated_at = ? WHERE id = ?", [nowIso(), s.id]);
    addActivity(s.contractor_id, "site", `Demo ${s.slug} expired`, "system");
  }
  return due.length;
}

/* ------------------------------------------------------- domain checks */

/** A random id for this install, answered at /_acp/whoami on every host. */
export function instanceId() {
  let id = getSetting("instance_id");
  if (!id) {
    id = crypto.randomBytes(12).toString("hex");
    setSetting("instance_id", id);
  }
  return id;
}

/**
 * Does this domain reach this server yet? Asks it over plain HTTP (no
 * certificate exists until DNS is right) for /_acp/whoami and compares ids.
 */
export async function verifyDomain(domain, { fetchImpl = fetch, timeoutMs = 6000 } = {}) {
  const d = normDomain(domain);
  try {
    const res = await fetchImpl(`http://${d}/_acp/whoami`, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    const text = await res.text();
    if (text.trim() === instanceId()) return { ok: true, domain: d };
    return { ok: false, domain: d, reason: `${d} answers, but not from this server (HTTP ${res.status})` };
  } catch (err) {
    return { ok: false, domain: d, reason: `${d} does not reach this server yet (${err.cause?.code || err.name || "no answer"})` };
  }
}

/* ------------------------------------------------------- editable spec */

/**
 * The shape the editor stores: what normalize() produces, minus everything
 * derived (phoneDisplay, tradeLabel, baseUrl …) and everything the platform
 * owns (lead endpoint, domain, slug). Running it on save means the stored spec
 * always has concrete services and colours to show in the form, and a stray
 * field from an old import cannot sneak into a build.
 */
export function editableSpec(input) {
  const { spec: n } = normalize(input || {});
  const raw = input || {};
  const keepNull = (v) => (v === undefined ? null : v);
  return {
    business: {
      name: n.business.name, owner: n.business.owner, trade: n.business.trade,
      yearsInBusiness: n.business.yearsInBusiness, targetCustomer: n.business.targetCustomer,
      tagline: n.business.tagline || "",
    },
    license: {
      rocNumber: n.license.rocNumber, class: n.license.class, classDescription: n.license.classDescription,
      bonded: n.license.bonded, insured: n.license.insured, warrantyYears: n.license.warrantyYears,
    },
    contact: {
      phone: n.contact.phone, email: n.contact.email,
      address: { street: n.contact.address.street, city: n.contact.address.city, state: "AZ", zip: n.contact.address.zip },
      hours: n.contact.hours, emergencyService: n.contact.emergencyService,
    },
    serviceArea: { cities: n.serviceArea.cities, radiusMiles: n.serviceArea.radiusMiles },
    services: n.services.map((s) => ({ name: s.name, blurb: s.blurb, ...(s.priceFrom != null ? { priceFrom: s.priceFrom } : {}) })),
    proof: {
      // Reviews typed in here must be real ones (from Google, a letter, an email).
      reviews: n.proof.reviews,
      // Portal photos are added at build time; only external images live here.
      gallery: (Array.isArray(raw?.proof?.gallery) ? raw.proof.gallery : []).filter((g) => /^https:\/\//.test(String(g?.src || ""))),
      stats: { projectsCompleted: keepNull(n.proof.stats.projectsCompleted) },
      certifications: n.proof.certifications,
      suppliers: n.proof.suppliers,
    },
    offers: { freeEstimates: n.offers.freeEstimates, paymentPlans: n.offers.paymentPlans, financingNote: n.offers.financingNote },
    integrations: { googlePlaceId: n.integrations.googlePlaceId, facebookUrl: n.integrations.facebookUrl, gaId: n.integrations.gaId },
    site: { pages: n.site.pages, theme: { primary: n.site.theme.primary, accent: n.site.theme.accent } },
  };
}
