/**
 * fulfil.mjs — a payment arrived with no site attached: build the site from the
 * ROC number the buyer typed at checkout.
 *
 * Payment Links (the Black Friday offer) skip the free demo, so their checkout
 * names no site, and billing.mjs could only email you "No site was attached".
 * This does what you would do by hand in the admin: find the licence, create
 * the contractor and the site, publish it, give the buyer portal access, and
 * email them. It acts only when every check passes; otherwise it changes
 * nothing and says why, and you finish by hand as before.
 *
 *   · a ROC number was typed and it is on the ACTIVE licence list (every page
 *     says "Licensed" and links to the ROC verify page)
 *   · the business name typed at checkout plausibly matches the licence holder,
 *     so a typo or somebody else's number is never published
 *   · the payment is confirmed, there is a usable US phone (the site's main
 *     button is a call button) and an email (the portal PIN goes there)
 *   · the licence has no live site already. A paying customer, a hand-built
 *     site or an imported one is NEVER overwritten. A demo, draft or expired
 *     site IS promoted, which is what a demo buyer paying means.
 *
 * Switch off with AUTO_FULFIL=off: everything then behaves as before.
 *
 * Never throws. The webhook answers 500 when a handler throws and Stripe then
 * retries, which would repeat a half-finished build.
 */
import { config } from "./config.mjs";
import { isEmail, esc } from "./http.mjs";
import { notify } from "./mail.mjs";
import { digits, getLicense, rocIndex, specFromLicense, sameBusiness, usPhone } from "./roc.mjs";
import { findByRoc, createContractor, updateContractor, advanceStage, addActivity } from "./contractors.mjs";
import { createSite, getSite, listSites, publishSite, updateSite } from "./sites.mjs";
import { hashSecret, newPin } from "./auth.mjs";

const customField = (s, key) => String(s.custom_fields?.find((f) => f.key === key)?.text?.value ?? "").trim();

/** What the buyer told Stripe, cleaned. The ROC number is digits only; nothing here is printed on the site except via the licence record. */
export function buyerFrom(s) {
  const cd = s.customer_details || {};
  return {
    roc: digits(customField(s, "roc_license")),
    business: String(s.collected_information?.business_name || cd.business_name || "").replace(/\s+/g, " ").trim(),
    email: String(cd.email || s.customer_email || "").trim().toLowerCase(),
    phone: usPhone(cd.phone),
  };
}

/**
 * @param s        a Checkout Session object (checkout.session.completed, or fetched by id)
 * @param tier     starter | pro | kit
 * @param dryRun   decide and report, change nothing
 * @returns { built: true, action, site, contractor, url, pin, emailed, buyer }
 *        | { built: false, reason, buyer, site?, contractor?, partial? }   (partial: a site was created but is not live)
 *        | { built: false, dryRun: true, action, buyer, licence, existing }
 */
export async function fulfilCheckout(s, { tier, dryRun = false } = {}) {
  const buyer = buyerFrom(s);
  const no = (reason, extra = {}) => ({ built: false, reason, buyer, ...extra });
  try {
    if (!config.autoFulfil) return no("automatic setup is switched off (AUTO_FULFIL=off)");
    if (!config.tiers[tier]) return no(`the plan "${tier || "none"}" is not one this server sells`);
    if (!["paid", "no_payment_required"].includes(s.payment_status)) return no(`the payment is not confirmed yet (payment_status: ${s.payment_status || "unknown"})`);
    if (!buyer.roc) {
      const hasField = Array.isArray(s.custom_fields) && s.custom_fields.some((f) => f.key === "roc_license");
      return no(hasField
        ? "no ROC number was entered at checkout (handyman-exempt?), so there is nothing to build from"
        : "this checkout has no ROC number field (it did not come from a Payment Link), so there is nothing to build from");
    }
    if (!rocIndex().available) return no("the ROC licence list is not installed on this server");
    const rec = getLicense(buyer.roc);
    if (!rec) return no(`ROC #${buyer.roc} is not on the active licence list (snapshot ${rocIndex().snapshotDate})`);
    if (buyer.business && !sameBusiness(buyer.business, rec.business_name) && !sameBusiness(buyer.business, rec.dba)) {
      return no(`the business name typed at checkout ("${buyer.business}") does not match the licence holder ("${rec.business_name}")`);
    }
    if (!buyer.phone) return no("no usable US phone number on the payment (the site's main button is a call button)");
    if (!isEmail(buyer.email)) return no("no usable email address on the payment");

    let contractor = findByRoc(rec.roc_number);
    const sites = contractor ? listSites({ contractorId: contractor.id }) : [];
    const live = sites.find((x) => x.status === "active" || x.status === "suspended");
    if (live) {
      return no(`${contractor.business_name} already has a ${live.status === "active" ? "live" : "suspended"} site (${live.slug}), so nothing was changed`, { existing: live, contractor });
    }
    const existing = sites[0] || null;                  // a demo, draft or expired site: this payment promotes it
    const action = existing ? "promoted" : "created";
    const licence = { roc: rec.roc_number, business: rec.business_name, class: rec.license_class, city: rec.city };
    if (dryRun) return { built: false, dryRun: true, action, buyer, licence, existing: existing?.slug || null };

    const label = config.tiers[tier].name || tier;
    const base = specFromLicense(rec, { phone: buyer.phone, email: buyer.email });
    if (!contractor) {
      contractor = createContractor({
        business_name: base.business.name, owner_name: base.business.owner, email: buyer.email, phone: buyer.phone,
        trade: base.business.trade, roc_number: rec.roc_number, license_class: rec.license_class,
        city: base.contact.address.city, source: "Stripe checkout",
      }, "stripe");
    } else {
      contractor = updateContractor(contractor.id, { email: contractor.email || buyer.email, phone: contractor.phone || buyer.phone }, "stripe");
    }
    let site = existing
      ? updateSite(existing.id, { status: "active", tier, notify_email: existing.notify_email || buyer.email })
      : createSite({ contractorId: contractor.id, spec: base, tier, status: "active", notifyEmail: buyer.email });
    advanceStage(contractor.id, "paid", `${label} checkout`);
    addActivity(contractor.id, "billing", `Paid ${label} setup (${(s.amount_total || 0) / 100} ${String(s.currency || "usd").toUpperCase()})`, "stripe");

    let result;
    try {
      result = publishSite(site.id, { author: "stripe" });
    } catch (err) {
      const why = (err.extra?.checks?.issues || []).filter((i) => i.level === "fail").map((i) => i.message).join(" ") || err.message;
      addActivity(contractor.id, "publish", `Automatic publish failed: ${why}`, "stripe");
      return no(`the site was created but did not pass its checks, so it is not live yet: ${why}`, { site, contractor, partial: true });
    }

    const pin = newPin();
    updateSite(site.id, { portal_pin_hash: hashSecret(pin) });
    addActivity(contractor.id, "portal", `Portal PIN created and emailed to ${buyer.email}`, "stripe");
    site = getSite(site.id);
    const url = result.urls.primary;
    const emailed = await sendReadyEmail({ to: buyer.email, business: base.business.name, label, url, site, pin });
    return { built: true, action, site, contractor, url, pin, emailed, buyer };
  } catch (err) {
    console.error("[fulfil]", err);
    return no(`unexpected error: ${err.message || err}`);
  }
}

async function sendReadyEmail({ to, business, label, url, site, pin }) {
  const phone = config.brand.phone;
  const portal = `${config.appUrl}/portal/`;
  const billing = config.stripePortalUrl;
  const text = [
    "Hello,",
    "",
    `Thank you for your order. Your ${label} website for ${business} is live:`,
    url,
    "",
    "It was built from your ROC record, so please check the services, cities and hours. You can change them yourself in your contractor portal, where your leads and job photos are too:",
    "",
    `  ${portal}`,
    `  Site: ${site.slug}`,
    `  PIN:  ${pin}`,
    "",
    `Keep the PIN private. Reply to this email with anything you want changed${phone ? `, or call or text ${phone}` : ""}.`,
    ...(billing ? ["", `Billing and receipts: ${billing}`] : []),
    "",
    "Español: tu sitio ya está en línea. Tu portal para cambiar servicios, ciudades y horario:",
    `${portal}  ·  sitio: ${site.slug}  ·  PIN: ${pin}${phone ? `  ·  llama o escribe al ${phone}` : ""}`,
    "",
    `— ${config.brand.name}${phone ? ` · ${phone}` : ""}`,
  ].join("\n");
  const html = `<div style="font:16px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#1A1A17;max-width:560px">
<p>Hello,</p>
<p>Thank you for your order. Your ${esc(label)} website for <strong>${esc(business)}</strong> is live:</p>
<p><a href="${esc(url)}" style="display:inline-block;background:#13242D;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Open my website</a></p>
<p>It was built from your ROC record, so please check the services, cities and hours. You can change them yourself in your contractor portal, where your leads and job photos are too:</p>
<p><a href="${esc(portal)}">${esc(portal)}</a><br>Site: <strong>${esc(site.slug)}</strong><br>PIN: <strong>${esc(pin)}</strong></p>
<p>Keep the PIN private. Reply to this email with anything you want changed${phone ? `, or call or text ${esc(phone)}` : ""}.</p>
${billing ? `<p>Billing and receipts: <a href="${esc(billing)}">manage my billing</a></p>` : ""}
<p style="color:#595349">Español: tu sitio ya está en línea. Entra a tu portal (${esc(portal)}) con el sitio <strong>${esc(site.slug)}</strong> y el PIN <strong>${esc(pin)}</strong> para cambiar tus servicios, ciudades y horario${phone ? `. Llama o escribe al ${esc(phone)}` : ""}.</p>
<p style="color:#595349">— ${esc(config.brand.name)}${phone ? ` · ${esc(phone)}` : ""}</p></div>`;
  return Boolean(await notify({ to, subject: `Your website for ${business} is live`, text, html, replyTo: config.brand.email || undefined }, "fulfil"));
}
