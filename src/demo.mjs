/**
 * demo.mjs — "Build my free demo site" on the sales page, end to end on this box.
 *
 * Before: sales form → Apps Script → GitHub repository_dispatch → Actions →
 * Python build → Netlify → callback → Apps Script email. Two to three minutes
 * and five services. Now: form → ROC licence lookup → contractor + site →
 * engine build + checks → published → email with the link and Buy buttons,
 * in about a second, and the response carries the link too.
 *
 * Only an ACTIVE Arizona licence gets a site built automatically, because
 * every page says "Licensed" and links to the ROC verify page. Anything else
 * is saved for a person to look at.
 */
import { config } from "./config.mjs";
import { db, nowIso, overLimit } from "./db.mjs";
import { HttpError, clean, isEmail, esc } from "./http.mjs";
import { notify } from "./mail.mjs";
import { getLicense, findByName, specFromLicense, rocIndex } from "./roc.mjs";
import { findByRoc, createContractor, updateContractor, addActivity } from "./contractors.mjs";
import { createSite, listSites, publishSite, updateSite } from "./sites.mjs";
import { inferTrade } from "../engine/trades.mjs";
import { salesUrl } from "./billing.mjs";

// The phone and city from this public form are printed on a public site, so
// each is kept only if it really is one. The phone is rebuilt from its digits.
export function usPhone(v) {
  const d = String(v || "").replace(/[^0-9]/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : "";
}
const cityName = (v) => (/^\p{L}[\p{L} .'-]*$/u.test(v) ? v : "");

function setDemo(id, status, detail = "", extra = {}) {
  const cols = { status, detail: String(detail).slice(0, 2000), ...extra };
  const keys = Object.keys(cols);
  db().run(`UPDATE demos SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, [...keys.map((k) => cols[k]), id]);
}

export async function requestDemo(data, { ip = "" } = {}) {
  if (clean(data.company_website || data.company_url)) return { ok: true, status: "ignored" };
  if (ip && overLimit(`demo:${ip}`, 5, 60 * 60 * 1000)) throw new HttpError(429, "Too many requests from this connection. Email us instead.");
  const f = {
    name: clean(data.name, 120), email: clean(data.email, 200).toLowerCase(), phone: clean(data.phone, 40),
    business: clean(data.business, 200), roc: clean(data.roc, 20).replace(/[^0-9]/g, ""),
    trade: clean(data.service || data.trade, 80), city: cityName(clean(data.city, 80).replace(/\s+/g, " ")), message: clean(data.message, 2000),
  };
  if (!f.name) throw new HttpError(400, "Please enter your name.");
  if (!isEmail(f.email)) throw new HttpError(400, "Add your email — that is where the demo link goes.");
  if (!f.roc && !f.business) throw new HttpError(400, "Give us a ROC number or a business name to build from.");

  const { id: demoId } = db().run(
    `INSERT INTO demos (name, email, phone, business, roc, trade, city, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [f.name, f.email, f.phone, f.business, f.roc, f.trade, f.city, f.message],
  );
  const review = (why) => {
    setDemo(demoId, "needs_review", why);
    if (config.adminEmail) {
      notify({
        to: config.adminEmail,
        subject: `Demo request needs a look — ${f.business || f.roc || f.name}`,
        text: `${why}\n\n${Object.entries(f).map(([k, v]) => `${k}: ${v || "—"}`).join("\n")}\n\n${config.appUrl}/admin/#/demos`,
        replyTo: f.email,
      }, "demo");
    }
    return { ok: true, status: "needs_review", order: String(demoId).padStart(6, "0"), message: "Got it. We will build your demo by hand and email you within a day." };
  };

  if (!rocIndex().available) return review("The ROC licence list is not installed on the server.");
  const rec = f.roc ? getLicense(f.roc) : findByName(f.business, { city: f.city });
  if (!rec) {
    return review(f.roc
      ? `ROC #${f.roc} is not on the active licence list (snapshot ${rocIndex().snapshotDate}).`
      : `No single active licence matches "${f.business}".`);
  }
  const phone = usPhone(f.phone);
  if (!phone) {
    return review("No usable phone number, and the site's main button is a call button.");
  }

  // One contractor per licence. A second request re-sends the existing demo.
  let contractor = findByRoc(rec.roc_number);
  const base = specFromLicense(rec, { phone, email: f.email, city: f.city });
  const formTrade = inferTrade("", f.trade);
  if (base.business.trade === "general" && formTrade !== "general") base.business.trade = formTrade;
  if (!contractor) {
    contractor = createContractor({
      business_name: base.business.name, owner_name: base.business.owner || f.name, email: f.email, phone,
      trade: base.business.trade, roc_number: rec.roc_number, license_class: rec.license_class,
      city: base.contact.address.city, source: "demo form",
    }, "demo form");
  } else {
    updateContractor(contractor.id, { email: contractor.email || f.email, phone: contractor.phone || phone });
  }
  if (f.message) addActivity(contractor.id, "note", `Demo request note: ${f.message}`, f.email);
  db().run("UPDATE demos SET contractor_id = ?, business = CASE WHEN business = '' THEN ? ELSE business END WHERE id = ?",
    [contractor.id, contractor.business_name, demoId]);

  let site = listSites({ contractorId: contractor.id })[0];
  if (site && site.status === "active") {
    db().run("UPDATE demos SET site_id = ? WHERE id = ?", [site.id, demoId]);
    return review(`${contractor.business_name} already has a live site (${site.slug}).`);
  }
  if (!site) {
    site = createSite({ contractorId: contractor.id, spec: base, tier: config.demo.tier, status: "demo", notifyEmail: f.email });
  } else if (site.status !== "demo") {
    site = updateSite(site.id, { status: "demo" });
  }
  // Every request (re)starts the clock, so a link sent today is good for the full period.
  db().run("UPDATE sites SET demo_expires_at = ? WHERE id = ?",
    [new Date(Date.now() + config.demo.expire_days * 864e5).toISOString(), site.id]);
  db().run("UPDATE demos SET site_id = ? WHERE id = ?", [site.id, demoId]);

  let result;
  try {
    result = publishSite(site.id, { author: "demo form" });
  } catch (err) {
    setDemo(demoId, "failed", err.message);
    return review(`The demo did not pass its checks: ${(err.extra?.checks?.issues || []).filter((i) => i.level === "fail").map((i) => i.message).join(" ") || err.message}`);
  }
  const url = result.urls.primary;
  setDemo(demoId, "live", url);
  await sendDemoEmail({ to: f.email, name: f.name, business: base.business.name, url, site });
  db().run("UPDATE demos SET status = 'emailed', emailed_at = ? WHERE id = ?", [nowIso(), demoId]);
  if (config.adminEmail) {
    notify({ to: config.adminEmail, subject: `Demo built — ${base.business.name}`, text: `${f.name} <${f.email}> ${f.phone}\n${url}\n${config.appUrl}/admin/#/contractors/${contractor.id}` }, "demo");
  }
  return { ok: true, status: "live", url, site: site.slug, order: String(demoId).padStart(6, "0") };
}

async function sendDemoEmail({ to, name, business, url, site }) {
  const first = name.split(/\s+/)[0];
  const buy = (tier) => `${config.appUrl}/api/checkout?tier=${tier}&site=${encodeURIComponent(site.slug)}`;
  const tiers = Object.entries(config.tiers);
  const text = [
    `Hi ${first},`,
    "",
    `Your free demo site for ${business} is live:`,
    url,
    "",
    "It is built from your ROC record, so check the services, cities and hours. Reply to this email with anything to change.",
    `The demo stays up for ${config.demo.expire_days} days. To keep it on your own domain:`,
    "",
    ...tiers.map(([k, t]) => `  ${t.name} — ${t.setup} setup + ${t.monthly}: ${buy(k)}`),
    "",
    `Plans explained: ${salesUrl("#pricing")}`,
    "",
    `— ${config.brand.name}${config.brand.phone ? ` · ${config.brand.phone}` : ""}`,
  ].join("\n");
  const html = `<div style="font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#1A1A17;max-width:560px">
<p>Hi ${esc(first)},</p>
<p>Your free demo site for <strong>${esc(business)}</strong> is live:</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#13242D;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open my demo site</a></p>
<p>It is built from your ROC record, so check the services, cities and hours. Reply with anything to change.</p>
<p>The demo stays up for ${config.demo.expire_days} days. To keep it:</p>
<ul>${tiers.map(([k, t]) => `<li><a href="${esc(buy(k))}">${esc(t.name)}</a> — ${esc(t.setup)} setup + ${esc(t.monthly)}</li>`).join("")}</ul>
<p style="color:#595349">— ${esc(config.brand.name)}${config.brand.phone ? ` · ${esc(config.brand.phone)}` : ""}</p></div>`;
  await notify({ to, subject: `Your demo site for ${business} is live`, text, html, replyTo: config.brand.email || undefined }, "demo");
}

export function listDemos(limit = 200) {
  return db().all(`SELECT d.*, s.slug FROM demos d LEFT JOIN sites s ON s.id = d.site_id ORDER BY d.id DESC LIMIT ?`, [limit]);
}

