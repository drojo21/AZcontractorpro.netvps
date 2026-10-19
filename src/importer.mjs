/**
 * importer.mjs — bring contractors over from the older repos.
 *
 *   Azcontractorpro / AzcontractorproVPs   clients/<id>/client.json (Python builder shape)
 *   acp-backend-tucson                     clients/<name>.json      (engine ClientSpec)
 *
 * Each file becomes a contractor (matched by ROC number, so re-running is
 * safe) and one site. Custom domains come along but are not made primary:
 * they still point at Netlify until you change DNS and press Verify.
 */
import fs from "node:fs";
import path from "node:path";
import { db } from "./db.mjs";
import { findByRoc, createContractor, updateContractor, addActivity } from "./contractors.mjs";
import { createSite, listSites, updateSite, addDomain, editableSpec, publishSite, normDomain } from "./sites.mjs";
import { inferTrade, tradeKey } from "../engine/trades.mjs";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** "Mo-Fr 07:00-17:00, Sa 08:00-14:00" → engine hours rows. */
export function parseHours(text) {
  const out = [];
  for (const part of String(text || "").split(",")) {
    const m = /^\s*([A-Z][a-z])(?:\s*-\s*([A-Z][a-z]))?\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/.exec(part);
    if (!m) continue;
    const a = DAYS.indexOf(m[1]);
    const b = m[2] ? DAYS.indexOf(m[2]) : a;
    if (a < 0 || b < a) continue;
    const pad = (t) => t.padStart(5, "0");
    out.push({ days: DAYS.slice(a, b + 1).join(","), opens: pad(m[3]), closes: pad(m[4]) });
  }
  return out;
}

/** True for the Python builder's client.json. */
export const isLegacy = (o) => Boolean(o && (o.business_name || o.client_id) && !o.business);

export function fromLegacy(cj) {
  const truthy = (v) => v === true || /^(y|yes|true|1)$/i.test(String(v || ""));
  return {
    spec: {
      business: {
        name: cj.business_name, owner: cj.owner || "",
        trade: cj.trade ? tradeKey(cj.trade) : inferTrade(cj.license_class, cj.license_class_description),
        yearsInBusiness: cj.years_in_business ?? null, targetCustomer: cj.target_customer || "both",
        tagline: cj.tagline || "",
      },
      license: { rocNumber: String(cj.roc_number || ""), class: cj.license_class || "", classDescription: cj.license_class_description || "" },
      contact: {
        phone: cj.phone || "", email: cj.email || "",
        address: { street: cj.street || "", city: cj.city || "Phoenix", state: "AZ", zip: String(cj.zip || "") },
        hours: parseHours(cj.hours),
        emergencyService: truthy(cj.emergency_service),
      },
      serviceArea: { cities: Array.isArray(cj.service_area) && cj.service_area.length ? cj.service_area : [cj.city || "Phoenix"] },
      services: (cj.services || []).map((s) => ({ name: s.name, blurb: s.blurb || "" })).filter((s) => s.name),
      proof: { reviews: (cj.reviews || []).filter((r) => r && r.text && r.name) },
      offers: { paymentPlans: truthy(cj.payment_plans) },
      integrations: { googlePlaceId: cj.integrations?.google_place_id || "", facebookUrl: cj.facebook_url || "" },
      site: { theme: { primary: cj.theme?.primary || "auto", accent: cj.theme?.accent || "auto" } },
    },
    copy: cj.hero_subhead ? { heroLine: String(cj.hero_subhead) } : {},
    tier: cj.tier === "lite" ? "starter" : "pro",
    domain: normDomain(cj.deploy?.custom_domain || ""),
    notifyEmail: cj.integrations?.notification_email || "",
    slug: cj.client_id || "",
  };
}

function fromSpec(spec) {
  return {
    spec, copy: {}, tier: "pro",
    domain: normDomain(spec.site?.domain || ""),
    notifyEmail: spec.integrations?.notificationEmail || "",
    slug: spec.slug || "",
  };
}

/** Import one parsed file. Returns a one-line summary. */
export function importOne(obj, { status = "draft", publish = false, source = "import" } = {}) {
  const x = isLegacy(obj) ? fromLegacy(obj) : fromSpec(obj);
  const spec = editableSpec(x.spec);
  const b = spec.business;
  const fields = {
    business_name: b.name, owner_name: b.owner, email: spec.contact.email, phone: spec.contact.phone,
    trade: b.trade, roc_number: spec.license.rocNumber, license_class: spec.license.class,
    city: spec.contact.address.city, source,
  };
  let c = spec.license.rocNumber ? findByRoc(spec.license.rocNumber) : null;
  const created = !c;
  c = c ? updateContractor(c.id, Object.fromEntries(Object.entries(fields).filter(([k]) => k !== "source"))) : createContractor(fields, source);

  let site = listSites({ contractorId: c.id })[0];
  if (site) {
    site = updateSite(site.id, { spec, copy_overrides: x.copy });
  } else {
    const slug = x.slug && !db().get("SELECT 1 FROM sites WHERE slug = ?", [x.slug]) && /^[a-z0-9-]{1,50}$/.test(x.slug) ? x.slug : "";
    site = createSite({ contractorId: c.id, spec, tier: x.tier, status, slug, notifyEmail: x.notifyEmail });
    if (Object.keys(x.copy).length) site = updateSite(site.id, { copy_overrides: x.copy });
  }
  if (x.domain) {
    try { addDomain(site.id, x.domain); } catch (err) { addActivity(c.id, "system", `Domain ${x.domain} not attached: ${err.message}`, source); }
  }
  let note = "";
  if (publish) {
    try { publishSite(site.id, { author: source }); note = "published"; } catch (err) { note = `NOT published: ${err.message}`; }
  }
  return `${created ? "added" : "updated"} ${b.name} → site ${site.slug}${x.domain ? ` (+${x.domain})` : ""}${note ? `, ${note}` : ""}`;
}

/** A file, or a directory searched for client.json / *.json. */
export function importPath(p, opts) {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") walk(full);
      else if (e.isFile() && e.name.endsWith(".json")) files.push(full);
    }
  };
  if (fs.statSync(p).isDirectory()) walk(p); else files.push(p);
  const out = [];
  for (const f of files) {
    let obj;
    try { obj = JSON.parse(fs.readFileSync(f, "utf8")); } catch { continue; }
    if (!isLegacy(obj) && !obj?.business?.name) continue;
    try { out.push(importOne(obj, opts)); } catch (err) { out.push(`skipped ${f}: ${err.message}`); }
  }
  return out;
}
