/**
 * Copy engine.
 *
 * Deterministic: the same spec always produces the same words, so a rebuild is
 * a no-op and a diff means something actually changed. Variety across clients
 * comes from hashing the business name, not from randomness.
 *
 * Two things this deliberately does NOT generate:
 *
 *  - Customer reviews. builder.html invented testimonials with fabricated
 *    names and cities ("Marisol R.", Oro Valley) and shipped them to live
 *    contractor sites as real quotes. The FTC rule on consumer reviews and
 *    testimonials (16 CFR part 465, in force since October 2024) treats
 *    fabricated reviews as a deceptive practice carrying civil penalties, and
 *    it is the contractor whose name is on the site. Reviews now come only
 *    from the spec; when there are none the section asks for them instead.
 *
 *  - Gallery images. "Project photo 3" placeholders went live the same way.
 *    No photos in the spec means no gallery, and the build flags it.
 */

import { trade as tradeInfo, AZ } from "./trades.mjs";
import { prose, clamp, fitTitle } from "./html.mjs";

/** Stable 32-bit hash — used to vary wording per client without randomness. */
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const choose = (arr, seed) => arr[hash(seed) % arr.length];

/**
 * Compose a meta description from required head segments plus optional tail
 * segments, dropping optional ones until it fits. Clamping the whole string
 * would cut the phone number in half, which is the one part that must survive.
 */
function meta(required, optional, max = 155) {
  let parts = [...required, ...optional];
  while (parts.join(" ").length > max && optional.length) {
    optional.pop();
    parts = [...required, ...optional];
  }
  const out = parts.join(" ");
  return out.length > max ? clamp(out, max) : out;
}

/** Lowercase a service name for mid-sentence use, without leaving a bare "&". */
function lower(name) {
  return String(name).replace(/\s*&\s*/g, " and ").toLowerCase();
}

const TAGLINES = {
  masonry: ["Built Solid. Built to Last.", "Block, Brick and Stone, Done Right.", "Walls That Stay Where We Put Them."],
  concrete: ["Flat, Smooth, Built to Code.", "Poured Right the First Time.", "Concrete That Holds Up Out Here."],
  hvac: ["Cool When It Counts.", "Sized Right. Runs Right.", "Comfort That Survives July."],
  plumbing: ["Fast Fixes. Fair Prices. Licensed.", "We Find It Before We Open It.", "Straight Answers on Your Plumbing."],
  electrical: ["Powered Properly. Permitted Properly.", "Safe Work, Shown to You.", "The Calculation Before the Quote."],
  roofing: ["Your Roof. Our Reputation.", "We Fix the Layer That Actually Leaks.", "Built for Sun and Monsoon."],
  landscaping: ["Desert Landscapes That Actually Thrive.", "Low Water. Still Beautiful.", "Built for This Climate."],
  painting: ["Color Done Right the First Time.", "Coatings That Survive Our Sun.", "Prep First. Always."],
  fencing: ["Boundaries Built to Last.", "Set Deep. Built Straight.", "Fences That Take the Wind."],
  flooring: ["Level Slab. Lasting Floor.", "Prepped Right, Laid Right.", "Floors Built on a Real Base."],
  carpentry: ["Shade, Built to Stay Up.", "Measured Twice. Built Once.", "Woodwork That Holds in Dry Heat."],
  excavating: ["We Price the Caliche Honestly.", "Dug Right. Hauled Clean.", "Blue Staked. Then Dug."],
  grading: ["We Move Water Away From You.", "Graded for Monsoon.", "Drainage Sized for Real Storms."],
  sheetrock: ["Patches You Cannot Find.", "Texture Matched, Not Guessed.", "Finished Flat and Clean."],
  general: ["Licensed. Local. Ready to Build.", "One Schedule. One Contact.", "Permitted, Built, Inspected."]
};

const WHY_POOL = [
  ["Arizona ROC licensed", s => !!s.license.rocNumber],
  ["Licensed, bonded and insured", s => s.license.bonded && s.license.insured],
  ["Free written estimates", s => s.offers.freeEstimates],
  ["Owner on every job", s => !!s.business.owner],
  ["Payment plans available", s => s.offers.paymentPlans],
  ["Same-day emergency service", s => s.contact.emergencyService],
  [s => `${s.business.yearsInBusiness} years in the trade`, s => s.business.yearsInBusiness >= 3],
  [s => `${s.license.warrantyYears}-year workmanship warranty`, s => s.license.warrantyYears > 0],
  ["No surprise change orders", () => true],
  [s => `Local to ${s.serviceArea.home}`, () => true]
];

/** The four-step process every studied Arizona site had some version of. */
function processSteps(spec) {
  const t = tradeInfo(spec.business.trade);
  const walk = spec.business.targetCustomer === "commercial"
    ? "We review the plans and walk the site."
    : "We come out, look at the actual job, and talk through options.";
  return [
    { n: "01", title: "Site walk", body: walk },
    { n: "02", title: "Written scope", body: "You get the scope and the price in writing, itemised, before anyone starts." },
    { n: "03", title: "Scheduled work", body: `We give you a start date and keep it. ${t.az.seasons.note}` },
    { n: "04", title: "Walkthrough", body: "We walk the finished work with you, clean up, and leave the warranty in writing." }
  ];
}

/**
 * The FAQs every page set needs: licensing, area, estimates, process — plus
 * the trade's own Arizona-specific questions.
 */
function faqs(spec) {
  const t = tradeInfo(spec.business.trade);
  const b = spec.business.name;
  const cities = prose(spec.serviceArea.cities);
  const out = [];

  if (spec.license.rocNumber) {
    out.push({
      q: "Are you licensed, bonded and insured?",
      a: `Yes. ${b} holds Arizona ROC license #${spec.license.rocNumber}` +
        `${spec.license.class ? ` (${spec.license.class})` : ""}` +
        `${spec.license.bonded ? ", is bonded" : ""}` +
        `${spec.license.insured ? " and carries liability insurance" : ""}. ` +
        `You do not have to take our word for it — you can look the license up by number ` +
        `on the Arizona Registrar of Contractors site, and we would rather you did.`
    });
  }

  out.push({
    q: "What areas do you serve?",
    a: `We work in ${cities}` +
      `${spec.serviceArea.radiusMiles ? `, and generally anywhere within about ${spec.serviceArea.radiusMiles} miles of ${spec.serviceArea.home}` : ""}. ` +
      `If you are just outside that, call and ask — depending on the job it is often still worth the drive.`
  });

  if (spec.offers.freeEstimates) {
    out.push({
      q: "Do you charge for an estimate?",
      a: `No. Estimates are free and come to you in writing with the scope itemised, so you can compare it ` +
        `against anyone else's on the same terms. There is no obligation and we do not run a pressure close.`
    });
  }

  // Trade-specific Arizona questions carry the weight here.
  for (const [q, a] of t.az.faqs) out.push({ q, a });

  out.push({
    q: "How soon can you start?",
    a: `It depends on the season — ${t.az.seasons.peak} is our busiest stretch. ` +
      `${spec.contact.emergencyService ? "Emergency work gets handled the same day. " : ""}` +
      `For scheduled work we will give you a real date rather than a vague one, and tell you ` +
      `straight away if we are booked out past what you need.`
  });

  if (spec.offers.paymentPlans) {
    out.push({
      q: "Do you offer payment plans?",
      a: `Yes. ${spec.offers.financingNote || "We can split larger projects into scheduled payments tied to progress rather than asking for the whole amount up front."} Ask about it when we quote.`
    });
  }

  return out;
}

export function homeCopy(spec) {
  const t = tradeInfo(spec.business.trade);
  const seed = spec.business.name + spec.business.trade;
  const city = spec.serviceArea.home;
  const cities = spec.serviceArea.cities;

  const tagline = spec.business.tagline || choose(TAGLINES[spec.business.trade] || TAGLINES.general, seed);

  const audience = spec.business.targetCustomer === "commercial" ? "commercial clients"
    : spec.business.targetCustomer === "homeowners" ? "homeowners" : "homeowners and businesses";

  const heroLine =
    `${t.label} work for ${audience} in ${city}` +
    `${cities.length > 1 ? ` and across ${prose(cities.slice(1, 4))}` : ""}. ` +
    `${spec.license.rocNumber ? `Arizona ROC #${spec.license.rocNumber}. ` : ""}` +
    `${spec.offers.freeEstimates ? "Free written estimates." : ""}`;

  const about = [
    `${spec.business.name} is a licensed ${t.label.toLowerCase()} contractor based in ${city}, Arizona` +
      `${spec.business.yearsInBusiness ? `, working in the trade for ${spec.business.yearsInBusiness} years` : ""}.`,
    spec.business.owner
      ? `${spec.business.owner} runs every job start to finish, so the person who quotes the work is the person accountable for it.`
      : `The same crew that quotes the work does the work, so nothing gets lost in a handoff.`,
    `We work in ${prose(cities)}.`
  ].join(" ");

  const why = WHY_POOL
    .filter(([, test]) => test(spec))
    .map(([label]) => (typeof label === "function" ? label(spec) : label))
    .slice(0, 6);

  const metaDesc = meta(
    [
      `${spec.business.name} — licensed ${t.label.toLowerCase()} contractor in ${city}, AZ.`,
      spec.license.rocNumber ? `ROC #${spec.license.rocNumber}.` : "",
      `Call ${spec.contact.phoneDisplay}.`
    ].filter(Boolean),
    [
      `Serving ${prose(cities.slice(0, 4))}.`,
      spec.offers.freeEstimates ? "Free estimates." : ""
    ].filter(Boolean)
  );

  return {
    tagline,
    heroLine,
    heroEyebrow: `${t.label} Contractor · ${city}, Arizona`,
    about,
    why,
    metaDesc,
    title: fitTitle(`${t.label} Contractor in ${city}, AZ`, spec.business.name, 62),
    servicesIntro:
      `${t.label} work for ${audience} across ${prose(cities.slice(0, 4))}. ` +
      `Each of these has its own page with what is involved and what it costs to get wrong.`,
    processSteps: processSteps(spec),
    faqs: faqs(spec),
    azConcerns: t.az.concerns
  };
}

export function serviceCopy(spec, service) {
  const t = tradeInfo(spec.business.trade);
  const city = spec.serviceArea.home;
  const cities = spec.serviceArea.cities;
  // Give each service page a different pair of Arizona notes so the set does
  // not read as the same page with the heading swapped.
  const concerns = t.az.concerns;
  const i = hash(service.slug) % concerns.length;
  const picked = [concerns[i], concerns[(i + 1) % concerns.length]].filter(Boolean);

  return {
    title: fitTitle(`${service.name} in ${city}, AZ`, spec.business.name),
    h1: `${service.name} in ${city}`,
    metaDesc: meta(
      [
        `${service.name} in ${city}, AZ by ${spec.business.name}.`,
        spec.license.rocNumber ? `Licensed, ROC #${spec.license.rocNumber}.` : "",
        `Call ${spec.contact.phoneDisplay}.`
      ].filter(Boolean),
      [`Also serving ${prose(cities.slice(1, 4))}.`]
    ),
    intro: service.blurb
      ? `${service.blurb} We do this work across ${prose(cities.slice(0, 4))}.`
      : `${service.name} for ${spec.business.targetCustomer === "commercial" ? "commercial clients" : "homeowners and businesses"} in ${prose(cities.slice(0, 4))}.`,
    notes: picked,
    processSteps: processSteps(spec),
    faqs: faqs(spec).slice(0, 5)
  };
}

export function areaCopy(spec, cityName) {
  const t = tradeInfo(spec.business.trade);
  const others = spec.serviceArea.cities.filter(c => c !== cityName);
  const topServices = spec.services.slice(0, 4).map(s => s.name);

  return {
    title: fitTitle(`${t.label} Contractor in ${cityName}, AZ`, spec.business.name),
    h1: `${t.label} contractor serving ${cityName}`,
    metaDesc: meta(
      [
        `Licensed ${t.label.toLowerCase()} contractor in ${cityName}, AZ.`,
        spec.license.rocNumber ? `${spec.business.name}, ROC #${spec.license.rocNumber}.` : spec.business.name + ".",
        `Call ${spec.contact.phoneDisplay}.`
      ].filter(Boolean),
      [`${prose(topServices.slice(0, 2))}.`]
    ),
    intro:
      `${spec.business.name} works in ${cityName} out of ${spec.serviceArea.home}` +
      `${spec.business.yearsInBusiness ? `, and has been in the trade ${spec.business.yearsInBusiness} years` : ""}. ` +
      `In ${cityName} we are usually called for ${prose(topServices.map(lower))}.`,
    // A city page that is only the home page with the name swapped is a thin
    // page. The Arizona notes and the neighbouring-city links give it substance.
    notes: tradeInfo(spec.business.trade).az.concerns.slice(0, 2),
    nearby: others,
    seasonNote: `${t.az.seasons.peak} is the busy season for ${t.label.toLowerCase()} work around ${cityName}. ${t.az.seasons.note}`
  };
}

export const buildFaqs = faqs;
export const buildProcess = processSteps;
export { AZ };
