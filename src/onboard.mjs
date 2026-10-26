/**
 * onboard.mjs — what happens after "Start with Pro": the licence lookup on the
 * sales form, and the setup sheet on thanks.html.
 *
 *   /api/roc?n=337881            typeahead while a contractor types their number
 *   GET  /api/onboard?session_id the setup sheet's starting answers
 *   POST /api/onboard            save them: services, cities, hours, domain
 *
 * The Stripe Checkout Session id in the thank-you link is the credential: it is
 * unguessable, it is only ever shown to the buyer, and we ask Stripe whether it
 * is a completed subscription before we read or change anything. A buyer who
 * came straight from the pricing section has no demo, so the sheet also asks
 * for the ROC number and trade and builds the site then.
 */
import { config } from "./config.mjs";
import { db, nowIso, getSetting, setSetting } from "./db.mjs";
import { HttpError, clean, isEmail, esc } from "./http.mjs";
import { notify } from "./mail.mjs";
import { stripe, salesUrl } from "./billing.mjs";
import { getLicense, specFromLicense, rocIndex, tidyName } from "./roc.mjs";
import { usPhone } from "./demo.mjs";
import { TRADES, TRADE_KEYS } from "../engine/trades.mjs";
import { addActivity, advanceStage, createContractor, findByRoc, getContractor } from "./contractors.mjs";
import {
  addDomain, domainsFor, createSite, editableSpec, getSite, getSiteBySlug, normDomain, publishSite,
  siteUrls, updateSite, verifyDomain,
} from "./sites.mjs";
import { hashSecret, newPin } from "./auth.mjs";

const SESSION_MAX_AGE_DAYS = 30;

/* ------------------------------------------------------------ licence */

const titleCase = (c) => String(c || "").toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());

// Cities a contractor in each metro is likely to serve, offered as one-tap chips.
const METROS = [
  ["Tucson", "Marana", "Oro Valley", "Sahuarita", "Vail", "Green Valley", "South Tucson", "Catalina Foothills", "Rio Rico", "Benson"],
  ["Phoenix", "Mesa", "Chandler", "Gilbert", "Scottsdale", "Tempe", "Glendale", "Peoria", "Surprise", "Goodyear", "Queen Creek", "Avondale", "Buckeye"],
  ["Flagstaff", "Sedona", "Prescott", "Prescott Valley", "Cottonwood", "Camp Verde"],
  ["Yuma", "San Luis", "Somerton", "Wellton"],
  ["Lake Havasu City", "Bullhead City", "Kingman", "Fort Mohave"],
];

export function suggestedAreas(home, chosen = []) {
  const h = String(home || "").toLowerCase();
  const metro = METROS.find((m) => m.some((c) => c.toLowerCase() === h)) || [];
  const out = [];
  for (const c of [home, ...chosen, ...metro]) {
    if (c && !out.some((x) => x.toLowerCase() === String(c).toLowerCase())) out.push(c);
  }
  return out;
}

/** The sales form's "is this number on the active list?" check. Public ROC data only. */
export function rocLookup(n) {
  const idx = rocIndex();
  if (!idx.available) return { ok: false };
  const rec = getLicense(n);
  if (!rec) return { ok: true, active: false, snapshot_date: idx.snapshotDate };
  return {
    ok: true, active: true, snapshot_date: idx.snapshotDate,
    business_name: tidyName(rec.dba || rec.business_name),
    license_class: rec.license_class,
    city: titleCase(rec.city),
    suggested_areas: suggestedAreas(titleCase(rec.city)),
  };
}

/* ------------------------------------------------------------- session */

async function paidSession(id) {
  const sid = String(id || "");
  if (!/^cs_[A-Za-z0-9_]{8,200}$/.test(sid)) throw new HttpError(404, "We couldn’t find that purchase. Use the link from your receipt.");
  let s;
  try {
    s = await stripe("GET", `/checkout/sessions/${sid}`);
  } catch (err) {
    if (err.status === 503) throw err;
    if (/No such/i.test(err.message)) throw new HttpError(404, "We couldn’t find that purchase. Use the link from your receipt.");
    throw new HttpError(502, "We couldn’t reach the payment system. Try again in a minute.");
  }
  if (s.mode !== "subscription") throw new HttpError(404, "That purchase isn’t a website plan.");
  if (s.status !== "complete") throw new HttpError(402, "Checkout isn’t finished yet. Complete the payment, then come back to this page.");
  if (s.created && Date.now() / 1000 - s.created > SESSION_MAX_AGE_DAYS * 86400) {
    throw new HttpError(410, "Open the setup sheet from your most recent email, or call us and we’ll send a fresh link.");
  }
  return s;
}

const idOf = (v) => (typeof v === "string" ? v : v?.id) || "";

function siteForSession(s) {
  const sub = idOf(s.subscription) ? db().get("SELECT site_id FROM subscriptions WHERE id = ?", [idOf(s.subscription)]) : null;
  if (sub?.site_id) { const site = getSite(sub.site_id); if (site) return site; }
  return getSiteBySlug(s.metadata?.site || s.client_reference_id || "");
}

/* --------------------------------------------------------------- hours */

const WEEK = "Mo,Tu,We,Th,Fr";
const HOURS = {
  weekdays: [{ days: WEEK, opens: "07:00", closes: "17:00" }],
  weekdays_sat: [{ days: WEEK, opens: "07:00", closes: "17:00" }, { days: "Sa", opens: "08:00", closes: "14:00" }],
  six_days: [{ days: `${WEEK},Sa`, opens: "07:00", closes: "18:00" }],
  every_day: [{ days: `${WEEK},Sa,Su`, opens: "07:00", closes: "19:00" }],
  always: [{ days: `${WEEK},Sa,Su`, opens: "00:00", closes: "23:59" }],
};

function hoursKey(rows) {
  const same = (a, b) => a.length === b.length && a.every((r, i) => r.days === b[i].days && r.opens === b[i].opens && r.closes === b[i].closes);
  return Object.keys(HOURS).find((k) => same(HOURS[k], rows || [])) || "weekdays_sat";
}

/* ------------------------------------------------------------- context */

const tradeOptions = () => TRADE_KEYS.map((k) => ({ value: k, label: TRADES[k].label, services: TRADES[k].services.map(([n]) => n) }));

function lastSetup(contractorId) {
  return db().get("SELECT created_at FROM activity WHERE contractor_id = ? AND kind = 'setup' ORDER BY id DESC LIMIT 1", [contractorId])?.created_at || null;
}

function formFor(site, buyerEmail) {
  const s = editableSpec(site.spec);
  const trade = TRADES[s.business.trade] || TRADES.general;
  const wanted = getSetting(`domain_want:${site.id}`);
  const primary = domainsFor(site.id).find((d) => d.is_primary);
  const domain = wanted || primary?.domain || "";
  return {
    business_name: s.business.name,
    phone: s.contact.phone,
    email: s.contact.email || site.notify_email || buyerEmail,
    suggested_services: (trade?.services || []).map(([n]) => n),
    services: s.services.map((x) => x.name),
    suggested_areas: suggestedAreas(s.contact.address.city, s.serviceArea.cities),
    service_area: s.serviceArea.cities,
    hours: s.contact.emergencyService && hoursKey(s.contact.hours) === "always" ? "always" : hoursKey(s.contact.hours),
    domain_status: domain ? "have" : "later",
    domain,
    owner: s.business.owner,
    years_in_business: s.business.yearsInBusiness ?? "",
    tagline: s.business.tagline,
    target_customer: s.business.targetCustomer === "homeowners" ? "residential" : s.business.targetCustomer,
    emergency_service: Boolean(s.contact.emergencyService),
    facebook_url: s.integrations.facebookUrl,
  };
}

export async function onboardContext(sessionId) {
  const s = await paidSession(sessionId);
  const buyerEmail = s.customer_details?.email || s.customer_email || "";
  const tier = s.metadata?.tier || "";
  const site = siteForSession(s);
  const planName = config.tiers[site?.tier || tier]?.name || config.brand.name;
  if (!site) {
    return {
      ok: true, plan_name: config.tiers[tier]?.name || planName, buyer_email: buyerEmail, needs_roc: true,
      trade_options: tradeOptions(), site_url: "", submitted_at: null,
      form: { email: buyerEmail, phone: s.customer_details?.phone || "", hours: "weekdays_sat", domain_status: "later", target_customer: "both", suggested_services: [], services: [], suggested_areas: [], service_area: [] },
    };
  }
  return {
    ok: true, plan_name: planName, buyer_email: buyerEmail, needs_roc: false,
    site_url: siteUrls(site).primary, submitted_at: lastSetup(site.contractor_id),
    form: formFor(site, buyerEmail),
  };
}

/* ---------------------------------------------------------------- save */

function tryPublish(siteId) {
  try { return publishSite(siteId, { author: "setup sheet" }); } catch (err) { return { error: err.message, checks: err.extra?.checks }; }
}

const failures = (errors) => new HttpError(400, "A few answers need another look.", { errors });

function linkSubscription(s, site) {
  const subId = idOf(s.subscription);
  if (!subId) return;
  const row = db().get("SELECT id FROM subscriptions WHERE id = ?", [subId]);
  if (row) {
    db().run("UPDATE subscriptions SET site_id = ?, contractor_id = ?, updated_at = ? WHERE id = ?", [site.id, site.contractor_id, nowIso(), subId]);
  } else {
    db().run(`INSERT INTO subscriptions (id, site_id, contractor_id, customer_id, tier, status, email, updated_at)
              VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
    [subId, site.id, site.contractor_id, idOf(s.customer), s.metadata?.tier || site.tier, s.customer_details?.email || s.customer_email || "", nowIso()]);
  }
}

/** A buyer with no demo: build their site now, from the ROC list. */
function siteFromScratch(s, body, phone, email, errors) {
  const rocNo = String(body.roc_number || "").replace(/[^0-9]/g, "");
  const rec = rocNo ? getLicense(rocNo) : null;
  if (!rec) {
    errors.roc_number = rocNo ? `#${rocNo} isn’t on the ROC active list. Check the number, or call us and we’ll sort it out.` : "Enter your ROC license number.";
    return null;
  }
  const tradeKey = TRADE_KEYS.includes(body.trade) ? body.trade : "";
  if (!tradeKey) { errors.trade = "Pick your trade."; return null; }
  if (Object.keys(errors).length) return null;
  const tier = config.tiers[s.metadata?.tier] ? s.metadata.tier : config.demo.tier;
  const base = specFromLicense(rec, { phone, email, trade: tradeKey });
  let contractor = findByRoc(rec.roc_number);
  if (!contractor) {
    contractor = createContractor({
      business_name: base.business.name, owner_name: base.business.owner, email, phone, trade: tradeKey,
      roc_number: rec.roc_number, license_class: rec.license_class, city: base.contact.address.city, source: "checkout",
    }, "setup sheet");
  }
  const existing = db().get("SELECT id FROM sites WHERE contractor_id = ? ORDER BY id LIMIT 1", [contractor.id]);
  if (existing) return getSite(existing.id);
  return createSite({ contractorId: contractor.id, spec: base, tier, status: "active", notifyEmail: email });
}

export async function onboardSave(body) {
  const s = await paidSession(body.session_id);
  const errors = {};
  let site = siteForSession(s);

  const phone = usPhone(body.phone);
  if (!phone) errors.phone = "Enter the phone number customers should call, with area code.";
  const email = clean(body.email, 200);
  if (!isEmail(email)) errors.email = "Check this email. Quote requests are sent here.";

  const names = [...new Map((Array.isArray(body.services) ? body.services : []).map((x) => clean(x, 70)).filter(Boolean).map((n) => [n.toLowerCase(), n])).values()].slice(0, 20);
  if (!names.length) errors.services = "Pick at least one service.";
  const cities = [...new Map((Array.isArray(body.service_area) ? body.service_area : []).map((x) => clean(x, 60)).filter((c) => /^\p{L}[\p{L} .'-]*$/u.test(c)).map((c) => [c.toLowerCase(), c])).values()].slice(0, 25);
  if (!cities.length) errors.service_area = "Pick at least one city.";

  const hours = HOURS[body.hours] ? body.hours : "weekdays_sat";
  const facebook = clean(body.facebook_url, 200);
  if (facebook && !/^https:\/\/(www\.)?facebook\.com\//i.test(facebook)) errors.facebook_url = "Use your full https://facebook.com/… page address.";
  const years = String(body.years_in_business ?? "").replace(/[^0-9]/g, "");
  const wantsDomain = body.domain_status === "have" ? normDomain(body.domain).replace(/^www\./, "") : "";
  if (body.domain_status === "have" && !wantsDomain) errors.domain = "Type the domain you own, like yourbusiness.com.";

  if (!site) site = siteFromScratch(s, body, phone, email, errors);
  if (Object.keys(errors).length) throw failures(errors);
  if (!site) throw failures(errors);

  // A domain must be valid and free before anything is saved.
  if (wantsDomain && !domainsFor(site.id).some((d) => d.domain === wantsDomain)) {
    try { addDomain(site.id, wantsDomain); } catch (err) {
      if (!err.status) throw err;
      throw failures({ domain: err.message });
    }
  }

  const prev = site.spec;
  const prevNotify = site.notify_email;
  const spec = editableSpec(site.spec);
  const blurbs = new Map(spec.services.map((x) => [x.name.toLowerCase(), x.blurb]));
  for (const [n, b] of TRADES[spec.business.trade]?.services || []) if (!blurbs.has(n.toLowerCase())) blurbs.set(n.toLowerCase(), b);
  spec.services = names.map((name) => ({ name, blurb: blurbs.get(name.toLowerCase()) || "" }));
  const home = spec.contact.address.city;
  spec.serviceArea.cities = [home, ...cities.filter((c) => c.toLowerCase() !== home.toLowerCase())];
  spec.contact.phone = phone;
  spec.contact.email = email;
  spec.contact.hours = HOURS[hours];
  spec.contact.emergencyService = Boolean(body.emergency_service) || hours === "always";
  if (body.owner !== undefined) spec.business.owner = clean(body.owner, 80);
  spec.business.yearsInBusiness = years ? Math.max(1, Math.min(150, parseInt(years, 10))) : null;
  if (body.tagline !== undefined) spec.business.tagline = clean(body.tagline, 80);
  if (["both", "residential", "commercial"].includes(body.target_customer)) spec.business.targetCustomer = body.target_customer;
  spec.integrations.facebookUrl = facebook;

  updateSite(site.id, { spec, notify_email: email });
  const publish = tryPublish(site.id);
  if (publish.error) {
    updateSite(site.id, { spec: prev, notify_email: prevNotify });
    if (config.adminEmail) {
      notify({ to: config.adminEmail, subject: `Setup sheet needs a person — ${spec.business.name}`,
        text: `Their answers did not pass the checks: ${publish.error}\n${config.appUrl}/admin/#/sites/${site.id}` }, "setup");
    }
    throw new HttpError(422, "Those answers would break the site’s checks, so nothing changed. We’ve been told and will finish it by hand. You can also call or text us.");
  }

  linkSubscription(s, site);
  const contractor = getContractor(site.contractor_id);
  advanceStage(site.contractor_id, "paid", "setup sheet");
  addActivity(site.contractor_id, "setup", `Setup sheet saved: ${names.length} services, ${cities.length} cities, hours ${hours}${wantsDomain ? `, domain ${wantsDomain}` : ""}`, "setup sheet");
  if (clean(body.notes, 2000)) addActivity(site.contractor_id, "note", `Setup sheet note: ${clean(body.notes, 2000)}`, email);

  let dns = null;
  if (wantsDomain) {
    setSetting(`domain_want:${site.id}`, wantsDomain);
    await promoteDomain(site.id);
    const bare = wantsDomain;
    const ip = config.publicIp;
    dns = { primary: bare, steps: ip ? [{ type: "A", host: "@", value: ip }, { type: "A", host: "www", value: ip }] : [] };
    if (!ip && config.adminEmail) {
      notify({ to: config.adminEmail, subject: `Send DNS records — ${contractor?.business_name || site.slug}`,
        text: `${bare} was added but PUBLIC_IP is not set, so the sheet could not show the A records. Email them the records.\n${config.appUrl}/admin/#/sites/${site.id}` }, "setup");
    }
  }

  // The first save is when a contractor gets their portal sign-in.
  const fresh = getSite(site.id);
  let pin = "";
  if (!fresh.portal_pin_hash) {
    pin = newPin();
    updateSite(site.id, { portal_pin_hash: hashSecret(pin) });
  }
  const siteUrl = siteUrls(getSite(site.id)).primary;
  await sendSetupEmail({ to: email, business: spec.business.name, siteUrl, sessionId: s.id, slug: site.slug, pin, dns });
  if (config.adminEmail) {
    notify({ to: config.adminEmail, subject: `Setup sheet saved — ${spec.business.name}`, text: `${siteUrl}\n${config.appUrl}/admin/#/sites/${site.id}` }, "setup");
  }
  return { ok: true, site_url: siteUrl, dns };
}

async function sendSetupEmail({ to, business, siteUrl, sessionId, slug, pin, dns }) {
  const sheet = `${salesUrl("thanks.html")}?session_id=${encodeURIComponent(sessionId)}`;
  const portal = `${config.appUrl}/portal/`;
  const dnsText = dns?.steps?.length
    ? ["", `To use ${dns.primary}, add these records where you bought it (delete old A or CNAME records on the same names):`, ...dns.steps.map((r) => `  ${r.type}  ${r.host}  ${r.value}`), "HTTPS turns on by itself once they take effect.", ""]
    : dns ? ["", `We will email you the DNS records for ${dns.primary} shortly.`, ""] : [];
  const pinText = pin ? [`Your portal (leads, photos, reviews): ${portal}`, `  Site: ${slug}`, `  PIN:  ${pin}`, "Keep this PIN. It is shown once.", ""] : [];
  const text = [
    `Your ${business} site is live with your answers:`, siteUrl, ...dnsText, ...pinText,
    `Change your services, cities, hours or domain any time: ${sheet}`, "",
    `— ${config.brand.name}${config.brand.phone ? ` · ${config.brand.phone}` : ""}`,
  ].join("\n");
  const html = `<div style="font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#1A1A17;max-width:560px">
<p>Your <strong>${esc(business)}</strong> site is live with your answers:</p>
<p><a href="${esc(siteUrl)}" style="display:inline-block;background:#13242D;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open my site</a></p>
${dns?.steps?.length ? `<p>To use <b>${esc(dns.primary)}</b>, add these records where you bought it (delete old A or CNAME records on the same names):</p><pre style="background:#F7F2EA;padding:10px 12px;border-radius:6px">${dns.steps.map((r) => esc(`${r.type}  ${r.host}  ${r.value}`)).join("\n")}</pre><p>HTTPS turns on by itself once they take effect.</p>` : dns ? `<p>We will email you the DNS records for <b>${esc(dns.primary)}</b> shortly.</p>` : ""}
${pin ? `<p><b>Your portal</b> (leads, photos, reviews): <a href="${esc(portal)}">${esc(portal)}</a><br>Site: <code>${esc(slug)}</code> · PIN: <code>${esc(pin)}</code><br><span style="color:#595349">Keep this PIN. It is shown once.</span></p>` : ""}
<p><a href="${esc(sheet)}">Change your services, cities, hours or domain</a> any time.</p>
<p style="color:#595349">— ${esc(config.brand.name)}${config.brand.phone ? ` · ${esc(config.brand.phone)}` : ""}</p></div>`;
  await notify({ to, subject: `Your ${business} site is live`, text, html, replyTo: config.brand.email || undefined }, "setup");
}

/* ------------------------------------------------------- custom domain */

/**
 * The domain a buyer asked for becomes the site's primary address once it
 * really reaches this server. Until then the free address keeps working.
 */
export async function promoteDomain(siteId, { verify = verifyDomain } = {}) {
  const want = getSetting(`domain_want:${siteId}`);
  if (!want) return false;
  const site = getSite(siteId);
  if (!site) return false;
  const check = await verify(want);
  if (!check.ok) return false;
  addDomain(site.id, want, { primary: true });
  db().run("DELETE FROM settings WHERE key = ?", [`domain_want:${siteId}`]);
  tryPublish(site.id);
  addActivity(site.contractor_id, "site", `Custom domain ${want} is live and now the primary address`, "system");
  const c = getContractor(site.contractor_id);
  if (c?.email) {
    await notify({ to: c.email, subject: `${want} is connected`, text: `Your site now answers at https://${want}/ with HTTPS.\n\n— ${config.brand.name}` }, "setup");
  }
  return true;
}

/** Hourly: look at every domain somebody is waiting on. */
export async function promoteDomains(opts) {
  const rows = db().all("SELECT key FROM settings WHERE key LIKE 'domain_want:%'");
  let done = 0;
  for (const r of rows) {
    try { if (await promoteDomain(Number(r.key.split(":")[1]), opts)) done++; } catch (err) { console.error("[domains]", err.message); }
  }
  return done;
}
