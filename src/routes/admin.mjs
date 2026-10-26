/**
 * admin.mjs — the API behind /admin/: CRM, website creator, hosting, billing.
 * Everything except login needs a session (or API_KEY) — see auth.mjs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { Router } from "../router.mjs";
import { config } from "../config.mjs";
import { db, overLimit, clearLimit } from "../db.mjs";
import { HttpError, clean, isEmail, typeOf } from "../http.mjs";
import {
  requireAdmin, login, logout, sessionCookie, createUser, publicUser, verifySecret, setPassword,
  hashSecret, newPin, pinFailKey,
} from "../auth.mjs";
import {
  STAGES, listContractors, getContractor, createContractor, updateContractor, deleteContractor,
  activityFor, addActivity,
} from "../contractors.mjs";
import {
  createSite, getSite, requireSite, listSites, updateSite, deleteSite, buildSite, publishSite,
  listReleases, rollback, siteUrls, domainsFor, addDomain, removeDomain, verifyDomain, zipRelease,
  editableSpec, validSlug, getSiteBySlug, republishQuietly, photoFile, primaryHost,
} from "../sites.mjs";
import { listPhotos, addPhoto, updatePhoto, removePhoto } from "../photos.mjs";
import { listReviews, decideReview } from "../reviews.mjs";
import { listLeads, updateLead, leadsCsv } from "../leads.mjs";
import { listDemos } from "../demo.mjs";
import { subscriptionsList } from "../billing.mjs";
import { suggestCopy, usageSummary, aiEnabled, COPY_FIELDS } from "../ai.mjs";
import { searchLicenses, getLicense, specFromLicense } from "../roc.mjs";
import { sendMail } from "../mail.mjs";
import { systemInfo, backup } from "../system.mjs";
import { TRADES, TRADE_KEYS } from "../../engine/trades.mjs";

/* ------------------------------------------------------ draft previews */

// Builds of unsaved edits, served at /admin/preview/<token>/… for the editor's
// iframe. Unguessable tokens, 30-minute life, a bounded number in memory.
const previews = new Map();
const PREVIEW_TTL = 30 * 60 * 1000;

function storePreview(files) {
  for (const [k, v] of previews) if (Date.now() - v.at > PREVIEW_TTL) previews.delete(k);
  while (previews.size >= 40) previews.delete(previews.keys().next().value);
  const token = crypto.randomBytes(16).toString("hex");
  previews.set(token, { files, at: Date.now() });
  return token;
}

/** GET /admin/preview/<token>/<path> — called from server.mjs. */
export function servePreview(ctx, token, rest) {
  const p = previews.get(token);
  if (!p || Date.now() - p.at > PREVIEW_TTL) {
    return ctx.html(410, "<!doctype html><title>Preview expired</title><p style=\"font:16px system-ui;padding:24px\">This preview expired. Press Preview again.</p>");
  }
  let key;
  try { key = decodeURIComponent(rest || "").replace(/^\/+/, ""); } catch { throw new HttpError(400, "malformed URL"); }
  if (key === "" || key.endsWith("/")) key += "index.html";
  if (!(key in p.files) && (`${key}.html` in p.files)) key += ".html";
  if (!(key in p.files) && (`${key}/index.html` in p.files)) return ctx.redirect(`/admin/preview/${token}/${key}/`, 302);
  let status = 200;
  if (!(key in p.files)) { key = "404.html"; status = 404; }
  const v = p.files[key];
  const body = v && typeof v === "object" && v.copyFrom ? (fs.existsSync(v.copyFrom) ? fs.readFileSync(v.copyFrom) : "") : String(v ?? "");
  ctx.send(status, body, {
    "Content-Type": typeOf(key),
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
    "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups",
  });
}

/* ------------------------------------------------------------- helpers */

const contractorOf = (id) => {
  const c = getContractor(id);
  if (!c) throw new HttpError(404, "no such contractor");
  return c;
};

/** A starting spec from the CRM record, filled from the ROC list when the number is on it. */
function seedSpec(c, extra = {}) {
  const rec = c.roc_number ? getLicense(c.roc_number) : null;
  const base = rec
    ? specFromLicense(rec, { phone: c.phone, email: c.email, city: c.city || undefined, owner: c.owner_name || undefined })
    : {
      business: { name: c.business_name, owner: c.owner_name, trade: c.trade },
      license: { rocNumber: c.roc_number, class: c.license_class },
      contact: { phone: c.phone, email: c.email, address: { city: c.city || "Phoenix", state: "AZ" } },
      serviceArea: { cities: [c.city || "Phoenix"] },
    };
  base.business.name = c.business_name || base.business.name;
  if (c.trade && c.trade !== "general") base.business.trade = c.trade;
  return editableSpec({ ...base, ...extra });
}

function siteSummary(s) {
  const c = getContractor(s.contractor_id);
  return {
    id: s.id, slug: s.slug, status: s.status, tier: s.tier, contractor_id: s.contractor_id,
    business_name: c?.business_name || s.spec?.business?.name || s.slug,
    published_at: s.published_at, current_release: s.current_release, demo_expires_at: s.demo_expires_at,
    checks: s.last_checks?.counts || null, urls: siteUrls(s),
    leads: db().get("SELECT COUNT(*) AS n FROM leads WHERE site_id = ?", [s.id]).n,
    has_pin: Boolean(s.portal_pin_hash),
  };
}

function siteDetail(s) {
  return {
    ...siteSummary(s),
    spec: s.spec,
    copy_overrides: s.copy_overrides,
    notify_email: s.notify_email,
    last_checks: s.last_checks,
    domains: domainsFor(s.id),
    releases: listReleases(s.id),
    photos: listPhotos(s.id),
    reviews: listReviews(s.id),
    subscription: db().get("SELECT * FROM subscriptions WHERE site_id = ? ORDER BY updated_at DESC LIMIT 1", [s.id]),
  };
}

async function readRawImage(ctx) {
  return ctx.raw(config.maxUploadBytes + 1024);
}

/* -------------------------------------------------------------- routes */

export const adminRoutes = new Router("/api/admin");

adminRoutes
  .post("/login", async (ctx) => {
    const { email, password } = await ctx.body();
    if (overLimit(`login:${ctx.ip}`, 10, 15 * 60 * 1000)) throw new HttpError(429, "too many attempts, wait 15 minutes");
    const s = login(email, password);
    if (!s) throw new HttpError(401, "wrong email or password");
    ctx.setCookie(sessionCookie(), s.token, { maxAge: s.maxAge });
    ctx.json(200, { ok: true, user: s.user });
  })
  .post("/logout", (ctx) => {
    logout(ctx.cookies[sessionCookie()]);
    ctx.setCookie(sessionCookie(), "", { maxAge: 0 });
    ctx.json(200, { ok: true });
  });

/** Every route registered after this line is behind requireAdmin (see handleAdmin). */
const guarded = new Router("/api/admin");

guarded
  .get("/me", (ctx) => ctx.json(200, { ok: true, user: ctx.state.user }))

  .get("/overview", (ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    const count = (sql, p = []) => db().get(sql, p).n;
    ctx.json(200, {
      ok: true,
      stages: STAGES.map((s) => ({ ...s, n: count("SELECT COUNT(*) AS n FROM contractors WHERE stage = ?", [s.id]) })),
      sites: {
        live: count("SELECT COUNT(*) AS n FROM sites WHERE status = 'active' AND current_release <> ''"),
        demo: count("SELECT COUNT(*) AS n FROM sites WHERE status = 'demo'"),
        draft: count("SELECT COUNT(*) AS n FROM sites WHERE status = 'draft'"),
      },
      leads: {
        week: count("SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?", [new Date(Date.now() - 7 * 864e5).toISOString()]),
        new: count("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'"),
        recent: listLeads({ limit: 8 }),
      },
      subscriptions: {
        active: count("SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('active','trialing')"),
        past_due: count("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'past_due'"),
      },
      followUps: db().all(`SELECT id, business_name, stage, next_follow_up FROM contractors
                           WHERE next_follow_up IS NOT NULL AND next_follow_up <> '' AND next_follow_up <= ? AND stage <> 'lost'
                           ORDER BY next_follow_up LIMIT 20`, [today]),
      demos: listDemos(6),
      pendingReviews: count("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'"),
    });
  })

  /* ---- reference data ---- */
  .get("/meta", (ctx) => ctx.json(200, {
    ok: true,
    stages: STAGES,
    trades: TRADE_KEYS.map((k) => ({ id: k, label: TRADES[k].label, palette: TRADES[k].palette, services: TRADES[k].services.map(([n, b]) => ({ name: n, blurb: b })) })),
    tiers: config.tiers,
    sitesDomain: config.sitesDomain,
    appUrl: config.appUrl,
    publicIp: config.publicIp,
    ai: aiEnabled(),
    aiFields: COPY_FIELDS,
  }))
  .get("/roc", (ctx) => ctx.json(200, { ok: true, results: searchLicenses(ctx.query.get("q") || "") }))
  .get("/roc/:number", (ctx) => {
    const rec = getLicense(ctx.params.number);
    if (!rec) throw new HttpError(404, "not on the active licence list");
    ctx.json(200, { ok: true, license: rec, spec: specFromLicense(rec) });
  })

  /* ---- contractors (CRM) ---- */
  .get("/contractors", (ctx) => ctx.json(200, {
    ok: true, contractors: listContractors({ q: ctx.query.get("q") || "", stage: ctx.query.get("stage") || "" }),
  }))
  .post("/contractors", async (ctx) => {
    const b = await ctx.body();
    let input = b;
    if (b.roc && !b.business_name) {
      const rec = getLicense(b.roc);
      if (!rec) throw new HttpError(404, `ROC #${b.roc} is not on the active licence list`);
      const s = specFromLicense(rec);
      input = {
        business_name: s.business.name, owner_name: s.business.owner, trade: s.business.trade,
        roc_number: rec.roc_number, license_class: rec.license_class, city: s.contact.address.city,
        source: "roc lookup", ...b,
      };
    }
    const c = createContractor(input, ctx.state.user.email);
    ctx.json(201, { ok: true, contractor: c });
  })
  .get("/contractors/:id", (ctx) => {
    const c = contractorOf(ctx.params.id);
    ctx.json(200, {
      ok: true, contractor: c,
      sites: listSites({ contractorId: c.id }).map(siteSummary),
      activity: activityFor(c.id),
      leads: listLeads({ contractorId: c.id, limit: 50 }),
      subscriptions: db().all("SELECT * FROM subscriptions WHERE contractor_id = ?", [c.id]),
      usage: db().get("SELECT COUNT(*) AS calls, COALESCE(SUM(cost_micros),0) AS cost_micros FROM token_usage WHERE contractor_id = ?", [c.id]),
    });
  })
  .patch("/contractors/:id", async (ctx) => {
    ctx.json(200, { ok: true, contractor: updateContractor(ctx.params.id, await ctx.body(), ctx.state.user.email) });
  })
  .delete("/contractors/:id", (ctx) => {
    const c = contractorOf(ctx.params.id);
    for (const s of listSites({ contractorId: c.id })) deleteSite(s.id);
    deleteContractor(c.id);
    ctx.json(200, { ok: true });
  })
  .post("/contractors/:id/notes", async (ctx) => {
    const c = contractorOf(ctx.params.id);
    const { body, kind } = await ctx.body();
    if (!clean(body)) throw new HttpError(400, "write something first");
    addActivity(c.id, ["call", "email", "note", "meeting"].includes(kind) ? kind : "note", body, ctx.state.user.email);
    ctx.json(201, { ok: true, activity: activityFor(c.id) });
  })

  /* ---- sites (website creator + hosting) ---- */
  .get("/sites", (ctx) => ctx.json(200, { ok: true, sites: listSites().map(siteSummary) }))
  .post("/sites", async (ctx) => {
    const b = await ctx.body();
    const c = contractorOf(b.contractor_id);
    if (b.slug && !validSlug(b.slug)) throw new HttpError(400, "the address must be lowercase letters, numbers and dashes");
    const site = createSite({
      contractorId: c.id, tier: config.tiers[b.tier] ? b.tier : "pro", status: b.status === "demo" ? "demo" : "draft",
      slug: b.slug || "", spec: b.spec ? editableSpec(b.spec) : seedSpec(c),
    });
    ctx.json(201, { ok: true, site: siteDetail(site) });
  })
  .get("/sites/:id", (ctx) => ctx.json(200, { ok: true, site: siteDetail(requireSite(ctx.params.id)) }))
  .patch("/sites/:id", async (ctx) => {
    const b = await ctx.body(4 * 1024 * 1024);
    const patch = {};
    if (b.spec !== undefined) patch.spec = editableSpec(b.spec);
    for (const k of ["tier", "status", "notify_email", "copy_overrides"]) if (b[k] !== undefined) patch[k] = b[k];
    if (b.copy_overrides) {
      patch.copy_overrides = Object.fromEntries(Object.entries(b.copy_overrides)
        .filter(([k, v]) => k in COPY_FIELDS && typeof v === "string" && v.trim()).map(([k, v]) => [k, v.trim().slice(0, 600)]));
    }
    const site = updateSite(ctx.params.id, patch);
    ctx.json(200, { ok: true, site: siteDetail(site) });
  })
  .delete("/sites/:id", (ctx) => { deleteSite(ctx.params.id); ctx.json(200, { ok: true }); })
  .post("/sites/:id/preview", async (ctx) => {
    const site = requireSite(ctx.params.id);
    const b = await ctx.body(4 * 1024 * 1024);
    const draft = {
      ...site,
      spec: b.spec ? editableSpec(b.spec) : site.spec,
      copy_overrides: b.copy_overrides || site.copy_overrides,
      status: "active",
    };
    const result = buildSite(draft);
    const token = storePreview(result.files);
    ctx.json(200, {
      ok: true, token, url: `/admin/preview/${token}/`,
      pages: result.manifest.pages, manifest: result.manifest,
      checks: { ok: result.verdict.ok, counts: result.verdict.counts, issues: result.verdict.issues },
      specIssues: result.specIssues,
    });
  })
  .post("/sites/:id/publish", async (ctx) => {
    const { force } = await ctx.body();
    try {
      ctx.json(200, { ok: true, ...publishSite(ctx.params.id, { force: Boolean(force), author: ctx.state.user.email }), site: siteDetail(getSite(ctx.params.id)) });
    } catch (err) {
      if (err.status === 422) return ctx.json(422, { ok: false, error: err.message, checks: err.extra.checks });
      throw err;
    }
  })
  .post("/sites/:id/rollback", async (ctx) => {
    const { release } = await ctx.body();
    ctx.json(200, { ok: true, site: siteDetail(rollback(ctx.params.id, release, ctx.state.user.email)) });
  })
  .get("/sites/:id/zip", (ctx) => {
    const site = requireSite(ctx.params.id);
    ctx.send(200, zipRelease(site), {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${site.slug}-${site.current_release}.zip"`,
      "Cache-Control": "no-store",
    });
  })
  .post("/sites/:id/domains", async (ctx) => {
    const { domain } = await ctx.body();
    ctx.json(200, { ok: true, domains: addDomain(ctx.params.id, domain) });
  })
  .delete("/sites/:id/domains/:domain", (ctx) => {
    const site = requireSite(ctx.params.id);
    const before = primaryHost(site);
    const domains = removeDomain(site.id, ctx.params.domain);
    // The canonical URL, sitemap and schema carry the primary host, so rebuild if it changed.
    const republish = primaryHost(site) === before ? undefined : republishQuietly(site.id, ctx.state.user.email);
    ctx.json(200, { ok: true, domains, republish });
  })
  .post("/sites/:id/domains/:domain/verify", async (ctx) => {
    const site = requireSite(ctx.params.id);
    const { primary } = await ctx.body();
    const owned = domainsFor(site.id).find((d) => d.domain === ctx.params.domain);
    if (!owned) throw new HttpError(404, "that domain is not on this site");
    const result = await verifyDomain(owned.domain);
    if (result.ok && primary) {
      addDomain(site.id, owned.domain, { primary: true });
      // The canonical URL, sitemap and schema all carry the domain, so rebuild.
      result.republish = republishQuietly(site.id, ctx.state.user.email);
    }
    ctx.json(200, { ok: true, ...result, domains: domainsFor(site.id) });
  })
  .post("/sites/:id/pin", async (ctx) => {
    const site = requireSite(ctx.params.id);
    const { email } = await ctx.body();
    const pin = newPin();
    updateSite(site.id, { portal_pin_hash: hashSecret(pin) });
    clearLimit(pinFailKey(site.id));
    let emailed = false;
    if (email) {
      const to = isEmail(email) ? email : site.notify_email || getContractor(site.contractor_id)?.email;
      if (to) {
        await sendMail({
          to,
          subject: `Your ${config.brand.name} portal`,
          text: `Sign in to see your leads, add job photos and approve reviews:\n\n${config.appUrl}/portal/\n\nSite: ${site.slug}\nPIN:  ${pin}\n\nKeep the PIN private. Ask us for a new one any time.`,
        }).then(() => { emailed = to; }, (e) => console.error("[pin] mail", e.message));
      }
    }
    addActivity(site.contractor_id, "portal", `Portal PIN reset${emailed ? ` and emailed to ${emailed}` : ""}`, ctx.state.user.email);
    ctx.json(200, { ok: true, pin, emailed });
  })
  .post("/sites/:id/ai-copy", async (ctx) => {
    const site = requireSite(ctx.params.id);
    const { notes } = await ctx.body();
    ctx.json(200, { ok: true, ...(await suggestCopy(site, { notes })) });
  })

  /* ---- photos & reviews on a site ---- */
  .get("/sites/:id/photos", (ctx) => ctx.json(200, { ok: true, photos: listPhotos(requireSite(ctx.params.id).id) }))
  .post("/sites/:id/photos", async (ctx) => {
    const site = requireSite(ctx.params.id);
    const photo = await addPhoto(site.id, await readRawImage(ctx), { category: ctx.query.get("category"), name: ctx.query.get("name") });
    ctx.json(201, { ok: true, photo, photos: listPhotos(site.id) });
  })
  .get("/sites/:id/photos/:pid/thumb", (ctx) => {
    const file = photoFile(Number(ctx.params.id), String(ctx.params.pid).replace(/[^a-f0-9]/g, ""), 600);
    if (!fs.existsSync(file)) throw new HttpError(404, "no such photo");
    ctx.file(file, { cacheControl: "private, max-age=86400" });
  })
  .patch("/sites/:id/photos/:pid", async (ctx) => {
    ctx.json(200, { ok: true, photos: updatePhoto(ctx.params.id, ctx.params.pid, await ctx.body()) });
  })
  .delete("/sites/:id/photos/:pid", (ctx) => ctx.json(200, { ok: true, photos: removePhoto(ctx.params.id, ctx.params.pid) }))
  .patch("/sites/:id/reviews/:rid", async (ctx) => {
    const site = requireSite(ctx.params.id);
    const { status } = await ctx.body();
    decideReview(site.id, ctx.params.rid, status);
    ctx.json(200, { ok: true, reviews: listReviews(site.id), republish: republishQuietly(site.id, ctx.state.user.email) });
  })

  /* ---- leads ---- */
  .get("/leads", (ctx) => {
    const site = ctx.query.get("site") ? getSiteBySlug(ctx.query.get("site")) : null;
    const leads = listLeads({ siteId: site?.id || null, status: ctx.query.get("status") || "", limit: ctx.query.get("format") === "csv" ? 5000 : 300 });
    if (ctx.query.get("format") === "csv") {
      return ctx.send(200, leadsCsv(leads), {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads${site ? `-${site.slug}` : ""}.csv"`,
      });
    }
    ctx.json(200, { ok: true, leads });
  })
  .patch("/leads/:id", async (ctx) => ctx.json(200, { ok: true, lead: updateLead(ctx.params.id, await ctx.body()) }))

  /* ---- demos, billing, usage ---- */
  .get("/demos", (ctx) => ctx.json(200, { ok: true, demos: listDemos() }))
  .get("/subscriptions", (ctx) => ctx.json(200, { ok: true, subscriptions: subscriptionsList() }))
  .get("/usage", (ctx) => ctx.json(200, { ok: true, ...usageSummary() }))

  /* ---- team ---- */
  .get("/users", (ctx) => ctx.json(200, { ok: true, users: db().all("SELECT * FROM users ORDER BY id").map(publicUser) }))
  .post("/users", async (ctx) => ctx.json(201, { ok: true, user: createUser(await ctx.body()) }))
  .delete("/users/:id", (ctx) => {
    if (Number(ctx.params.id) === ctx.state.user.id) throw new HttpError(400, "you cannot remove yourself");
    if (db().get("SELECT COUNT(*) AS n FROM users").n <= 1) throw new HttpError(400, "keep at least one admin");
    db().run("DELETE FROM users WHERE id = ?", [Number(ctx.params.id)]);
    ctx.json(200, { ok: true });
  })
  .post("/password", async (ctx) => {
    const { current, password } = await ctx.body();
    const u = db().get("SELECT * FROM users WHERE id = ?", [ctx.state.user.id]);
    if (!u || !verifySecret(u.password_hash, current)) throw new HttpError(401, "current password is wrong");
    setPassword(u.email, password, { keepSession: ctx.cookies[sessionCookie()] });
    ctx.json(200, { ok: true });
  })

  /* ---- system ---- */
  .get("/system", (ctx) => ctx.json(200, { ok: true, ...systemInfo() }))
  .post("/backup", (ctx) => ctx.json(200, { ok: true, ...backup() }))
  .post("/mail-test", async (ctx) => {
    const { to } = await ctx.body();
    if (!isEmail(to)) throw new HttpError(400, "give an email address");
    await sendMail({ to, subject: `${config.brand.name} test email`, text: `If you can read this, outbound mail from ${config.appUrl} works.` });
    ctx.json(200, { ok: true });
  });

export async function handleAdmin(ctx) {
  if (await adminRoutes.handle(ctx)) return true;
  if (!ctx.path.startsWith("/api/admin/")) return false;
  requireAdmin(ctx);
  if (await guarded.handle(ctx)) return true;
  ctx.json(404, { ok: false, error: "not found" });
  return true;
}

