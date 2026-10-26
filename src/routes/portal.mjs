/**
 * portal.mjs — the contractor's own view, at /portal/.
 *
 * Sign in with a one-time link: type your email or site address, and a link
 * goes to the email on your contractor record (see emailPortalLink in auth.mjs).
 * From there: leads (status, notes, CSV), job photos (gallery and hero),
 * reviews to approve, and the parts of the site they should be able to change
 * themselves — tagline, services, cities, hours, offers. Every change rebuilds
 * the site through the same checks an admin publish goes through, so a
 * contractor can never publish something that fails them.
 *
 * Name, ROC number, licence class and phone are admin-only: they are the
 * licence-display facts the checks are there to protect.
 */
import fs from "node:fs";
import { Router } from "../router.mjs";
import { config } from "../config.mjs";
import { db, overLimit } from "../db.mjs";
import { HttpError, clean, isEmail } from "../http.mjs";
import { issuePortalToken, requirePortal, emailPortalLink, redeemPortalLink } from "../auth.mjs";
import { getSite, getSiteBySlug, siteForHost, siteUrls, updateSite, editableSpec, republishQuietly, photoFile } from "../sites.mjs";
import { listLeads, updateLead, leadsCsv } from "../leads.mjs";
import { listPhotos, addPhoto, updatePhoto, removePhoto, imagesAvailable } from "../photos.mjs";
import { listReviews, decideReview } from "../reviews.mjs";
import { addActivity, getContractor } from "../contractors.mjs";

// Sign-in emails per site and hour, so the form cannot flood a contractor's inbox.
const LINKS_PER_SITE = 5;
const HOUR = 60 * 60 * 1000;
const LINK_SENT = "If that matches a website we look after, a sign-in link is on its way to the email we have on file. It works for 30 minutes.";

function findSites(identifier) {
  const id = clean(identifier, 200).toLowerCase();
  if (!id) return [];
  if (isEmail(id)) {
    return db().all(`SELECT s.id FROM sites s JOIN contractors c ON c.id = s.contractor_id
                     WHERE lower(c.email) = ? OR lower(s.notify_email) = ? ORDER BY s.id LIMIT 5`, [id, id]).map((r) => getSite(r.id));
  }
  const site = getSiteBySlug(id) || siteForHost(id);
  return site ? [site] : [];
}

function current(ctx) {
  const site = getSite(requirePortal(ctx));
  if (!site || site.status === "suspended") throw new HttpError(403, "this portal is turned off — call us");
  return site;
}

function me(site) {
  const c = getContractor(site.contractor_id);
  const sub = db().get("SELECT tier, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE site_id = ? ORDER BY updated_at DESC LIMIT 1", [site.id]);
  return {
    site: { id: site.id, slug: site.slug, status: site.status, tier: site.tier, published_at: site.published_at, demo_expires_at: site.demo_expires_at },
    business: c?.business_name || site.spec?.business?.name,
    urls: siteUrls(site),
    reviewLink: `${siteUrls(site).primary.replace(/\/$/, "")}/_acp/review/${site.slug}`,
    notify_email: site.notify_email || c?.email || "",
    billing: { subscription: sub || null, portal: config.stripePortalUrl || "" },
    uploads: imagesAvailable(),
    maxUploadMb: config.maxUploadBytes / 1048576,
    counts: {
      newLeads: db().get("SELECT COUNT(*) AS n FROM leads WHERE site_id = ? AND status = 'new'", [site.id]).n,
      pendingReviews: db().get("SELECT COUNT(*) AS n FROM reviews WHERE site_id = ? AND status = 'pending'", [site.id]).n,
      photos: db().get("SELECT COUNT(*) AS n FROM photos WHERE site_id = ?", [site.id]).n,
    },
    buy: site.status === "demo" || site.status === "expired"
      ? Object.entries(config.tiers).map(([k, t]) => ({ tier: k, ...t, url: `${config.appUrl}/api/checkout?tier=${k}&site=${site.slug}` }))
      : [],
  };
}

/** The slice of the spec a contractor may edit. */
function profileOf(site) {
  const s = editableSpec(site.spec);
  return {
    tagline: s.business.tagline, yearsInBusiness: s.business.yearsInBusiness,
    email: s.contact.email, street: s.contact.address.street, zip: s.contact.address.zip,
    hours: s.contact.hours, emergencyService: s.contact.emergencyService,
    cities: s.serviceArea.cities, services: s.services,
    freeEstimates: s.offers.freeEstimates, paymentPlans: s.offers.paymentPlans, financingNote: s.offers.financingNote,
    certifications: s.proof.certifications, projectsCompleted: s.proof.stats.projectsCompleted,
    facebookUrl: s.integrations.facebookUrl, googlePlaceId: s.integrations.googlePlaceId,
    // Shown, not editable.
    locked: { name: s.business.name, phone: s.contact.phone, rocNumber: s.license.rocNumber, class: s.license.class, city: s.contact.address.city },
  };
}

const HOURS_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAYS_RE = /^(Mo|Tu|We|Th|Fr|Sa|Su)(,(Mo|Tu|We|Th|Fr|Sa|Su))*$/;

function applyProfile(site, p) {
  const s = editableSpec(site.spec);
  const str = (v, n) => clean(v, n);
  if (p.tagline !== undefined) s.business.tagline = str(p.tagline, 80);
  if (p.yearsInBusiness !== undefined) s.business.yearsInBusiness = p.yearsInBusiness ? Math.max(0, Math.min(150, parseInt(p.yearsInBusiness, 10) || 0)) || null : null;
  if (p.email !== undefined) {
    if (p.email && !isEmail(p.email)) throw new HttpError(400, "that email does not look right");
    s.contact.email = str(p.email, 200);
  }
  if (p.street !== undefined) s.contact.address.street = str(p.street, 120);
  if (p.zip !== undefined) s.contact.address.zip = str(p.zip, 10).replace(/[^0-9]/g, "").slice(0, 5);
  if (p.hours !== undefined) {
    if (!Array.isArray(p.hours) || p.hours.length > 7) throw new HttpError(400, "hours must be a list");
    s.contact.hours = p.hours.map((h) => {
      const row = { days: str(h.days, 30).replace(/\s+/g, ""), opens: str(h.opens, 5), closes: str(h.closes, 5) };
      if (!DAYS_RE.test(row.days) || !HOURS_RE.test(row.opens) || !HOURS_RE.test(row.closes)) {
        throw new HttpError(400, "hours look wrong: use days like Mo,Tu,We and times like 07:00");
      }
      return row;
    });
  }
  if (p.emergencyService !== undefined) s.contact.emergencyService = Boolean(p.emergencyService);
  if (p.cities !== undefined) {
    const cities = (Array.isArray(p.cities) ? p.cities : String(p.cities).split(/[,\n]/)).map((c) => str(c, 60)).filter(Boolean).slice(0, 25);
    // The home city is always kept, first: it is the licence address and the home
    // page's market. So an empty list is fine — it means the home city alone.
    s.serviceArea.cities = [s.contact.address.city, ...cities.filter((c) => c.toLowerCase() !== s.contact.address.city.toLowerCase())];
  }
  if (p.services !== undefined) {
    if (!Array.isArray(p.services) || !p.services.length || p.services.length > 20) throw new HttpError(400, "list between 1 and 20 services");
    s.services = p.services.map((x) => ({ name: str(x.name, 70), blurb: str(x.blurb, 300) })).filter((x) => x.name);
    if (!s.services.length) throw new HttpError(400, "each service needs a name");
  }
  if (p.freeEstimates !== undefined) s.offers.freeEstimates = Boolean(p.freeEstimates);
  if (p.paymentPlans !== undefined) s.offers.paymentPlans = Boolean(p.paymentPlans);
  if (p.financingNote !== undefined) s.offers.financingNote = str(p.financingNote, 200);
  if (p.certifications !== undefined) s.proof.certifications = (Array.isArray(p.certifications) ? p.certifications : String(p.certifications).split(/[,\n]/)).map((c) => str(c, 80)).filter(Boolean).slice(0, 12);
  if (p.projectsCompleted !== undefined) s.proof.stats.projectsCompleted = parseInt(p.projectsCompleted, 10) > 0 ? parseInt(p.projectsCompleted, 10) : null;
  if (p.facebookUrl !== undefined) {
    if (p.facebookUrl && !/^https:\/\/(www\.)?facebook\.com\//i.test(p.facebookUrl)) throw new HttpError(400, "use your full https://facebook.com/… page address");
    s.integrations.facebookUrl = str(p.facebookUrl, 200);
  }
  if (p.googlePlaceId !== undefined) s.integrations.googlePlaceId = str(p.googlePlaceId, 120).replace(/[^A-Za-z0-9_-]/g, "");
  return s;
}

export const portalRoutes = new Router("/api/portal")
  .post("/link", async (ctx) => {
    const { site: ident } = await ctx.body();
    if (overLimit(`signin:${ctx.ip}`, 10, 15 * 60 * 1000)) throw new HttpError(429, "too many tries — wait 15 minutes");
    // The answer, and how long it takes, is the same whether or not anything
    // matched, so the form cannot be used to learn who is a client.
    for (const site of findSites(ident)) {
      if (site.status === "suspended" || overLimit(`signin-site:${site.id}`, LINKS_PER_SITE, HOUR)) continue;
      const sent = emailPortalLink(site);
      if (!sent) continue;
      sent.sending.catch((err) => console.error("[portal] sign-in link to", sent.to, err.message));
      addActivity(site.contractor_id, "portal", `Portal sign-in link emailed to ${sent.to}`, "portal");
    }
    ctx.json(200, { ok: true, message: LINK_SENT });
  })
  .post("/sign-in", async (ctx) => {
    const { link } = await ctx.body();
    if (overLimit(`redeem:${ctx.ip}`, 30, 15 * 60 * 1000)) throw new HttpError(429, "too many tries — wait 15 minutes");
    const site = getSite(redeemPortalLink(link));
    if (!site || site.status === "suspended") throw new HttpError(403, "this portal is turned off — call us");
    ctx.json(200, { ok: true, ...issuePortalToken(site), ...me(site) });
  })
  .get("/me", (ctx) => ctx.json(200, { ok: true, ...me(current(ctx)) }))

  .get("/leads", (ctx) => {
    const site = current(ctx);
    const leads = listLeads({ siteId: site.id, limit: 5000 });
    if (ctx.query.get("format") === "csv") {
      return ctx.send(200, leadsCsv(leads), {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${site.slug}.csv"`,
      });
    }
    ctx.json(200, { ok: true, leads: leads.slice(0, 500) });
  })
  .patch("/leads/:id", async (ctx) => {
    const site = current(ctx);
    const b = await ctx.body();
    ctx.json(200, { ok: true, lead: updateLead(ctx.params.id, { status: b.status, notes: b.notes }, { siteId: site.id }) });
  })

  .get("/photos", (ctx) => ctx.json(200, { ok: true, photos: listPhotos(current(ctx).id) }))
  .post("/photos", async (ctx) => {
    const site = current(ctx);
    const photo = await addPhoto(site.id, await ctx.raw(config.maxUploadBytes + 1024), {
      category: ctx.query.get("category"), name: ctx.query.get("name"),
    });
    addActivity(site.contractor_id, "photo", `Photo added: ${photo.name}`, "portal");
    // Uploads often come in a batch; the client asks for a publish when the batch is done.
    ctx.json(201, { ok: true, photo, photos: listPhotos(site.id) });
  })
  .get("/photos/:pid/thumb", (ctx) => {
    const site = current(ctx);
    const file = photoFile(site.id, String(ctx.params.pid).replace(/[^a-f0-9]/g, ""), 600);
    if (!fs.existsSync(file)) throw new HttpError(404, "no such photo");
    ctx.file(file, { cacheControl: "private, max-age=86400" });
  })
  .patch("/photos/:pid", async (ctx) => {
    const site = current(ctx);
    ctx.json(200, { ok: true, photos: updatePhoto(site.id, ctx.params.pid, await ctx.body()) });
  })
  .delete("/photos/:pid", (ctx) => {
    const site = current(ctx);
    ctx.json(200, { ok: true, photos: removePhoto(site.id, ctx.params.pid) });
  })

  .get("/reviews", (ctx) => ctx.json(200, { ok: true, reviews: listReviews(current(ctx).id) }))
  .patch("/reviews/:rid", async (ctx) => {
    const site = current(ctx);
    const { status } = await ctx.body();
    const r = decideReview(site.id, ctx.params.rid, status);
    addActivity(site.contractor_id, "review", `Review from ${r.name} ${status}`, "portal");
    ctx.json(200, { ok: true, reviews: listReviews(site.id), publish: republishQuietly(site.id, "portal") });
  })

  .get("/profile", (ctx) => ctx.json(200, { ok: true, profile: profileOf(current(ctx)) }))
  .patch("/profile", async (ctx) => {
    const site = current(ctx);
    const spec = applyProfile(site, await ctx.body(256 * 1024));
    const b = await ctx.body();
    const patch = { spec };
    if (b.notify_email !== undefined) {
      if (b.notify_email && !isEmail(b.notify_email)) throw new HttpError(400, "the lead email does not look right");
      patch.notify_email = b.notify_email;
    }
    const prev = site.spec;
    const updated = updateSite(site.id, patch);
    const publish = republishQuietly(updated.id, "portal");
    if (publish.error) {
      // Keep the live site and the saved spec in step: undo the edit that failed.
      updateSite(site.id, { spec: prev, notify_email: site.notify_email });
      throw new HttpError(422, "That change would break the site, so nothing was changed.", { checks: publish.checks });
    }
    addActivity(site.contractor_id, "site", "Site details edited in the portal", "portal");
    ctx.json(200, { ok: true, profile: profileOf(getSite(site.id)), publish });
  })
  .post("/publish", (ctx) => {
    const site = current(ctx);
    ctx.json(200, { ok: true, publish: republishQuietly(site.id, "portal") });
  });
