/**
 * ClientSpec — the one data contract.
 *
 * Before this, the same contractor's details were typed into four different
 * shapes that nothing could translate between:
 *
 *   1. the order form in Az-Contractor-Pro/az-contractor-pro.html  (8 fields)
 *   2. the work order in acp-backend-tucson/builder.html           (17 fields)
 *   3. the CLIENT INFO BLOCK in the contractor-website-generator skill (24 fields)
 *   4. a row of the ROC new-licenses CSV
 *
 * normalize() accepts any of them and returns one canonical object, so the
 * generator, the deploy function and the batch runner all read the same thing.
 */

import { tradeKey, trade as tradeInfo, inferTrade } from "./trades.mjs";
import { slug, telDisplay, clamp, prose } from "./html.mjs";

/** Pick the first key that is present and non-empty. */
function pick(src, keys, fallback = "") {
  for (const k of keys) {
    const v = k.split(".").reduce((o, part) => (o == null ? o : o[part]), src);
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return fallback;
}

/** Accept an array, or a comma / newline / pipe separated string. */
function toList(v) {
  if (Array.isArray(v)) return v.map(x => (typeof x === "string" ? x.trim() : x)).filter(Boolean);
  return String(v || "")
    .split(/[,\n|;]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function toBool(v, dflt = false) {
  if (v === undefined || v === null || v === "") return dflt;
  if (typeof v === "boolean") return v;
  return /^(y|yes|true|1|on)$/i.test(String(v).trim());
}

function toInt(v) {
  const n = parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** "auto", "", "n/a", "tbd" and "none" all mean "you decide". */
function isAuto(v) {
  return v === undefined || v === null || /^(auto|n\/?a|tbd|none|-)?$/i.test(String(v).trim());
}

/** "" for anything that means "not set yet": auto, TBD, N/A, none, -. */
function blank(v) {
  return isAuto(v) ? "" : String(v).trim();
}

const DEFAULT_HOURS = [
  { days: "Mo,Tu,We,Th,Fr", opens: "07:00", closes: "17:00" },
  { days: "Sa", opens: "08:00", closes: "14:00" }
];

/**
 * Normalize any accepted input shape into a canonical ClientSpec.
 * Returns { spec, issues } — issues are advisory, never thrown, so a batch
 * run over messy ROC data still produces sites.
 */
export function normalize(input = {}) {
  const raw = input || {};
  const issues = [];
  const note = (level, field, msg) => issues.push({ level, field, message: msg });

  // ---- business ------------------------------------------------------------
  const name = String(pick(raw, [
    "business.name", "businessName", "biz", "BUSINESS_NAME",
    "business_name", "Business Name", "dbaName", "name"
  ])).trim();
  if (!name) note("error", "business.name", "Business name is required.");

  const owner = String(pick(raw, [
    "business.owner", "owner", "ownerName", "contactName", "OWNER_NAME",
    "qualifyingParty", "qp", "Qualifying Party"
  ])).trim();

  const licenseClass = String(pick(raw, [
    "license.class", "licenseClass", "lic", "cls", "LICENSE_CLASS", "License Class"
  ])).trim();

  const classDescription = String(pick(raw, [
    "license.classDescription", "desc", "classDescription", "License Description"
  ])).trim();

  // Explicit trade wins; otherwise infer from the ROC class and its description.
  const tradeRaw = pick(raw, ["business.trade", "trade", "tradeType", "TRADE"]);
  const tKey = tradeRaw ? tradeKey(tradeRaw) : inferTrade(licenseClass, classDescription);
  const t = tradeInfo(tKey);

  const years = toInt(pick(raw, [
    "business.yearsInBusiness", "yearsInBusiness", "years", "YEARS_IN_BUSINESS"
  ]));

  const targetRaw = String(pick(raw, [
    "business.targetCustomer", "targetCustomer", "cust", "TARGET_CUSTOMER", "customers"
  ], "both")).toLowerCase();
  const targetCustomer = /^(home|resid)/.test(targetRaw) ? "homeowners"
    : /^(comm|business)/.test(targetRaw) ? "commercial" : "both";

  // ---- license -------------------------------------------------------------
  const rocNumber = String(pick(raw, [
    "license.rocNumber", "rocNumber", "roc", "ROC_NUMBER", "ROC Number", "licenseNumber"
  ])).replace(/[^0-9]/g, "");
  if (!rocNumber) {
    note("error", "license.rocNumber",
      "No ROC number. A.R.S. 32-1124(B)(4) lets a contractor advertise a URL instead of the " +
      "licence number only if the site's home page shows the name and number, so a site " +
      "without one cannot carry that advertising.");
  }

  // ---- contact -------------------------------------------------------------
  const phone = String(pick(raw, ["contact.phone", "phone", "PHONE", "Phone"])).trim();
  if (!phone) note("error", "contact.phone", "Phone number is required — it is the primary call to action.");

  const email = blank(pick(raw, ["contact.email", "email", "EMAIL", "Email"]));
  const city = String(pick(raw, [
    "contact.address.city", "city", "CITY", "City", "homeCity"
  ], "Phoenix")).trim();
  const zip = String(pick(raw, [
    "contact.address.zip", "zip", "ZIP", "Zip", "postalCode"
  ])).replace(/[^0-9]/g, "").slice(0, 5);
  const street = String(pick(raw, ["contact.address.street", "street", "address1", "STREET"])).trim();

  // ---- service area --------------------------------------------------------
  let cities = toList(pick(raw, [
    "serviceArea.cities", "serviceArea", "area", "SERVICE_AREA", "serviceAreaCities"
  ]));
  if (!cities.length) {
    cities = [city];
    note("warn", "serviceArea.cities", `No service area given — defaulting to ${city} only.`);
  }
  // Home city first, de-duplicated case-insensitively.
  const seen = new Set();
  cities = [city, ...cities].filter(c => {
    const k = c.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // ---- services ------------------------------------------------------------
  // Drop "auto" / "TBD" / "N/A" placeholders so they do not become a service
  // literally named "auto".
  const specRaw = toList(pick(raw, [
    "services", "specialties", "spec", "SPECIALTIES", "servicesOffered"
  ])).filter(s => (typeof s === "object" ? s : !isAuto(s)));
  let services;
  if (specRaw.length) {
    services = specRaw.map(s => {
      if (typeof s === "object" && s) {
        return {
          name: String(s.name || "").trim(),
          slug: s.slug || slug(s.name),
          blurb: String(s.blurb || "").trim(),
          priceFrom: s.priceFrom ?? null
        };
      }
      // Match a free-text service against the trade's own list so it inherits
      // a real blurb instead of a generated one.
      const match = t.services.find(([n]) => n.toLowerCase() === String(s).toLowerCase());
      return {
        name: String(s).trim(),
        slug: slug(s),
        blurb: match ? match[1] : "",
        priceFrom: null
      };
    }).filter(s => s.name);
  } else {
    services = t.services.map(([n, blurb]) => ({ name: n, slug: slug(n), blurb, priceFrom: null }));
    note("warn", "services", `No services listed — using the standard ${t.label} set.`);
  }

  // ---- proof ---------------------------------------------------------------
  const reviews = (Array.isArray(raw?.proof?.reviews) ? raw.proof.reviews
    : Array.isArray(raw?.reviews) ? raw.reviews : []).map(r => ({
      name: String(r.name || "").trim(),
      city: String(r.city || cities[0] || city).trim(),
      text: String(r.text || "").trim(),
      rating: toInt(r.rating) || 5,
      source: String(r.source || "").trim()
    })).filter(r => r.text && r.name);

  const gallery = (Array.isArray(raw?.proof?.gallery) ? raw.proof.gallery
    : Array.isArray(raw?.gallery) ? raw.gallery : []).map(g => ({
      src: String(g.src || "").trim(),
      thumb: String(g.thumb || "").trim(),
      alt: String(g.alt || "").trim(),
      city: String(g.city || "").trim(),
      service: String(g.service || "").trim()
    })).filter(g => g.src);

  // ---- site ----------------------------------------------------------------
  const domainRaw = blank(pick(raw, [
    "site.domain", "domain", "websiteUrl", "WEBSITE_URL", "web", "website"
  ]));
  const domain = domainRaw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "");
  const baseUrl = domain ? `https://${domain}` : "";
  if (!domain) note("warn", "site.domain", "No domain yet — canonical URLs and sitemap will use a relative base.");

  const pagesIn = raw?.site?.pages || {};
  const pages = {
    servicePages: toBool(pagesIn.servicePages, true),
    areaPages: toBool(pagesIn.areaPages, true),
    gallery: toBool(pagesIn.gallery, true),
    reviews: toBool(pagesIn.reviews, true),
    faq: toBool(pagesIn.faq, true),
    about: toBool(pagesIn.about, true),
    contact: toBool(pagesIn.contact, true)
  };

  const themeIn = raw?.site?.theme || {};
  const primary = isAuto(themeIn.primary ?? pick(raw, ["PRIMARY_COLOR_HEX", "primaryColor"]))
    ? t.palette.primary
    : String(themeIn.primary ?? pick(raw, ["PRIMARY_COLOR_HEX", "primaryColor"])).trim();
  const accent = isAuto(themeIn.accent ?? pick(raw, ["ACCENT_COLOR_HEX", "accentColor"]))
    ? t.palette.accent
    : String(themeIn.accent ?? pick(raw, ["ACCENT_COLOR_HEX", "accentColor"])).trim();

  const taglineRaw = pick(raw, ["business.tagline", "tagline", "TAGLINE"]);

  const spec = {
    slug: String(pick(raw, ["slug"], slug(name) || "contractor")),

    business: {
      name,
      owner,
      ownerFirstName: String(pick(raw, ["business.ownerFirstName", "OWNER_FIRST_NAME"], owner.split(/\s+/)[0] || "")),
      trade: tKey,
      tradeLabel: t.label,
      yearsInBusiness: years,
      targetCustomer,
      tagline: isAuto(taglineRaw) ? null : String(taglineRaw).trim()
    },

    license: {
      rocNumber,
      class: licenseClass,
      classDescription,
      status: String(pick(raw, ["license.status", "rocStatus", "ROC_STATUS"], "Active")),
      bonded: toBool(pick(raw, ["license.bonded", "bonded"]), true),
      insured: toBool(pick(raw, ["license.insured", "insured"]), true),
      warrantyYears: toInt(pick(raw, ["license.warrantyYears", "warrantyYears"])) ?? 2,
      verifyUrl: "https://azroc.my.site.com/AZRoc/s/contractor-search"
    },

    contact: {
      phone,
      phoneDisplay: telDisplay(phone),
      email,
      address: { street, city, state: "AZ", zip },
      hours: Array.isArray(raw?.contact?.hours) && raw.contact.hours.length ? raw.contact.hours : DEFAULT_HOURS,
      emergencyService: toBool(pick(raw, ["contact.emergencyService", "emergencyService", "emerg", "EMERGENCY_SERVICE"]))
    },

    serviceArea: {
      home: city,
      cities,
      radiusMiles: toInt(pick(raw, ["serviceArea.radiusMiles", "radiusMiles"])) ?? 35
    },

    services,

    proof: {
      reviews,
      gallery,
      stats: {
        yearsInBusiness: years,
        projectsCompleted: toInt(pick(raw, ["proof.stats.projectsCompleted", "projectsCompleted"])),
        rating: raw?.proof?.stats?.rating ?? null,
        reviewCount: toInt(pick(raw, ["proof.stats.reviewCount", "reviewCount"]))
      },
      certifications: toList(pick(raw, ["proof.certifications", "certifications"])),
      suppliers: toList(pick(raw, ["proof.suppliers", "suppliers"]))
    },

    offers: {
      freeEstimates: toBool(pick(raw, ["offers.freeEstimates", "freeEstimates"]), true),
      paymentPlans: toBool(pick(raw, ["offers.paymentPlans", "paymentPlans", "fin", "PAYMENT_PLANS"])),
      financingNote: String(pick(raw, ["offers.financingNote", "financingNote"])).trim()
    },

    integrations: {
      // The skill's CLIENT INFO BLOCK documents "TBD" as a legitimate value for
      // these, and the order form offers "N/A". Left as-is, "TBD" becomes the
      // literal URL the lead form posts to, so every enquiry goes nowhere while
      // the form still reports success. blank() turns those placeholders into
      // an empty string, which the checker then reports.
      leadEndpoint: blank(pick(raw, [
        "integrations.leadEndpoint", "leadEndpoint", "sheet", "GOOGLE_SHEET_URL", "googleSheetUrl"
      ])),
      notificationEmail: blank(pick(raw, [
        "integrations.notificationEmail", "notificationEmail", "NOTIFICATION_EMAIL"
      ], email)),
      googlePlaceId: blank(pick(raw, ["integrations.googlePlaceId", "googlePlaceId", "GOOGLE_PLACE_ID"])),
      // Where "Leave a review" goes. The VPS platform sets this to the site's
      // own /_acp/review/<slug> page; Google is the fallback.
      reviewUrl: blank(pick(raw, ["integrations.reviewUrl", "reviewUrl"])),
      facebookUrl: blank(pick(raw, ["integrations.facebookUrl", "facebookUrl", "FACEBOOK_URL"])),
      gaId: blank(pick(raw, ["integrations.gaId", "gaId"]))
    },

    site: {
      domain,
      baseUrl,
      pages,
      theme: { primary, accent, display: t.fonts.display, body: t.fonts.body }
    }
  };

  // A lead form that posts nowhere is the most expensive thing to miss: the
  // site looks finished and silently drops every enquiry.
  if (!spec.integrations.leadEndpoint) {
    note("warn", "integrations.leadEndpoint",
      "No lead endpoint. The form will show its success state but store nothing — set this before launch.");
  }
  if (!spec.contact.email && !spec.integrations.notificationEmail) {
    note("warn", "contact.email", "No email anywhere, so lead notifications cannot be sent.");
  }
  if (spec.serviceArea.cities.length < 2 && spec.site.pages.areaPages) {
    note("info", "serviceArea.cities",
      "Only one city, so no service-area pages will be built. Add nearby cities to get them.");
  }

  return { spec, issues };
}

export function isFatal(issues) {
  return issues.some(i => i.level === "error");
}

/** One-line summary used by the CLI and the batch runner. */
export function describe(spec) {
  return `${spec.business.name} — ${spec.business.tradeLabel}, ROC #${spec.license.rocNumber || "none"}, ` +
    `${spec.serviceArea.cities.length} cities, ${spec.services.length} services`;
}

export { prose, clamp };
