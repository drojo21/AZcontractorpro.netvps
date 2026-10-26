/** Reusable blocks shared by every page type. */

import { esc, telHref, prose } from "./html.mjs";
import { rel, slugify, areaHref } from "./layout.mjs";

/** Crisp inline SVG icons for trades, trust badges and interactive controls. */
export function icon(name) {
  const paths = {
    masonry: '<rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="10" width="8" height="5" rx="1"/><rect x="13" y="10" width="8" height="5" rx="1"/><rect x="3" y="16" width="18" height="4" rx="1"/>',
    concrete: '<path d="M3 17h18v3H3z"/><path d="M6 13h12l2 4H4z"/><path d="M9 9h6v4H9z"/><path d="M12 5v4"/>',
    hvac: '<path d="M12 2v20M4.93 4.93l14.14 14.14M2 12h20M4.93 19.07L19.07 4.93"/>',
    plumbing: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>',
    electrical: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    roofing: '<path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
    landscaping: '<path d="M12 22v-8"/><path d="M7 14c-2.5 0-4-2-4-4.5S5 5 8 6c1-3 5-3 6 0 3-1 5 1 5 3.5S17.5 14 15 14H7z"/>',
    painting: '<rect x="4" y="3" width="14" height="6" rx="1"/><path d="M18 6h2v5h-8v4"/><rect x="10" y="15" width="4" height="6" rx="1"/>',
    fencing: '<path d="M4 20V6l3-3 3 3v14M14 20V6l3-3 3 3v14M2 10h20M2 16h20"/>',
    flooring: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/>',
    carpentry: '<path d="M3 21h18L3 3v18z"/><path d="M7 17h5L7 12v5z"/>',
    excavating: '<path d="M3 19h18"/><path d="M5 15l4-8h6l3 8"/><circle cx="7.5" cy="15.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
    grading: '<path d="M2 18c3-2 6-2 9 0s6 2 11 0"/><path d="M2 13l20-5"/><path d="M17 6l5 2-3 4"/>',
    sheetrock: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 12h18M12 4v8"/>',
    general: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    map: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    spark: '<path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z"/>',
    quote: '<path d="M3 21c3 0 7-1 7-8V5H4v6h3c0 4-2 6-4 6v4zm11 0c3 0 7-1 7-8V5h-6v6h3c0 4-2 6-4 6v4z"/>',
    zoom: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    prev: '<path d="m15 18-6-6 6-6"/>',
    next: '<path d="m9 18 6-6-6-6"/>'
  };
  const body = paths[name] || paths.general;
  return `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function crumbs(items, depth = 0) {
  if (!items || items.length < 2) return "";
  const r = rel(depth);
  return `<nav class="crumbs wrap" aria-label="Breadcrumb">
  <ol>
    ${items.map((c, i) => {
      const last = i === items.length - 1;
      const href = c.path === undefined ? null : `${r}${c.path}`;
      return `<li>${last || !href ? `<span>${esc(c.name)}</span>` : `<a href="${esc(href)}">${esc(c.name)}</a>`}</li>`;
    }).join("\n    ")}
  </ol>
</nav>`;
}

/** The badge row. Every item is a verifiable fact from the spec. */
export function badges(spec) {
  const out = [];
  if (spec.license.rocNumber) out.push(`Arizona ROC #${spec.license.rocNumber}`);
  const li = [spec.license.bonded && "Bonded", spec.license.insured && "Insured"].filter(Boolean);
  out.push(li.length ? `Licensed, ${li.join(" & ").toLowerCase()}` : "Licensed");
  if (spec.business.yearsInBusiness) out.push(`${spec.business.yearsInBusiness} years in the trade`);
  if (spec.offers.freeEstimates) out.push("Free written estimates");
  if (spec.contact.emergencyService) out.push("Emergency service");
  if (spec.offers.paymentPlans) out.push("Payment plans");
  return out;
}

export function hero({ spec, eyebrow, h1, lede, showBadges = true, depth = 0, ctaQuote = true }) {
  const r = rel(depth);
  const media = spec.proof.gallery[0];
  const hasMedia = !!(media && media.src);
  const quickServices = spec.services.slice(0, 5);
  const ownerFirst = spec.business.owner ? spec.business.owner.split(" ")[0] : "";

  return `<header class="hero${hasMedia ? " has-media" : ""}">
  ${hasMedia ? `<img class="hero-img" src="${esc(media.src.startsWith("http") ? media.src : r + media.src)}" alt="${esc(media.alt || `${spec.business.tradeLabel} work by ${spec.business.name}`)}" fetchpriority="high">` : ""}
  <div class="hero-in hero-grid">
    <div class="hero-copy">
      <div class="hero-pill" data-hours="${esc(JSON.stringify(spec.contact.hours || []))}">
        <span class="status-dot" aria-hidden="true"></span>
        <span class="status-text">${spec.contact.emergencyService ? "Same-day emergency service available" : `Local ${esc(spec.serviceArea.home)} crew · Fast callbacks`}</span>
      </div>
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}
      <h1>${esc(h1)}</h1>
      ${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
      <div class="btn-row">
        ${ctaQuote ? `<a class="btn btn-primary" href="${r}contact/"><span>Get a free estimate</span>${icon("arrow")}</a>` : ""}
        <a class="btn btn-outline" href="tel:${esc(telHref(spec.contact.phone))}">${icon("phone")}<span>Call ${esc(spec.contact.phoneDisplay)}</span></a>
      </div>
      ${showBadges ? `<ul class="badges">${badges(spec).map(b => `<li>${icon("shield")}<span>${esc(b)}</span></li>`).join("")}</ul>` : ""}
    </div>
    <aside class="hero-card" aria-label="Quick project planner">
      <div class="hero-card-head">
        <span class="hero-card-ico">${icon(spec.business.trade)}</span>
        <div>
          <strong>What are you planning?</strong>
          <span>Pick a service to start your estimate</span>
        </div>
      </div>
      <div class="hero-chips">
        ${quickServices.map(s => `<a class="hero-chip" href="#quote" data-pick-service="${esc(s.name)}"><span>${esc(s.name)}</span>${icon("arrow")}</a>`).join("\n        ")}
      </div>
      <div class="hero-card-foot">
        <span>${ownerFirst ? `Straight to ${esc(ownerFirst)} — no call center` : "Straight to the crew that does the work"}</span>
        <a href="tel:${esc(telHref(spec.contact.phone))}">${esc(spec.contact.phoneDisplay)}</a>
      </div>
    </aside>
  </div>
</header>`;
}

/** Only renders facts the spec actually has. No invented project counts. */
export function trustStrip(spec) {
  const s = spec.proof.stats;
  const items = [];
  if (s.yearsInBusiness) items.push({ val: `${s.yearsInBusiness}`, label: "Years in the trade", count: s.yearsInBusiness, suffix: "" });
  if (s.projectsCompleted) items.push({ val: `${s.projectsCompleted.toLocaleString("en-US")}+`, label: "Projects completed", count: s.projectsCompleted, suffix: "+" });
  if (s.rating && s.reviewCount) items.push({ val: `${s.rating}★`, label: `From ${s.reviewCount} reviews` });
  if (spec.license.rocNumber) items.push({ val: `#${spec.license.rocNumber}`, label: "Arizona ROC license" });
  if (spec.license.warrantyYears) items.push({ val: `${spec.license.warrantyYears} yr`, label: "Workmanship warranty", count: spec.license.warrantyYears, suffix: " yr" });
  if (spec.serviceArea.cities.length > 1) items.push({ val: `${spec.serviceArea.cities.length}`, label: "Cities served", count: spec.serviceArea.cities.length, suffix: "" });
  if (items.length < 3) return "";
  return `<div class="strip">
  <div class="strip-in">
    ${items.slice(0, 5).map(it => `<div class="stat"><b${it.count ? ` data-count="${it.count}" data-suffix="${esc(it.suffix || "")}"` : ""}>${esc(it.val)}</b><span>${esc(it.label)}</span></div>`).join("\n    ")}
  </div>
</div>`;
}

export function servicesGrid(spec, { depth = 0, limit = 99, linked = true } = {}) {
  const r = rel(depth);
  const linkable = linked && spec.site.pages.servicePages;
  const tradeIco = icon(spec.business.trade);
  return `<div class="grid">
  ${spec.services.slice(0, limit).map((s, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const top = `<div class="card-top"><span class="card-icon">${tradeIco}</span><span class="card-num">${num}</span></div>`;
    const inner = `${top}<h3>${esc(s.name)}</h3>${s.blurb ? `<p>${esc(s.blurb)}</p>` : ""}` +
      (linkable ? `<span class="more"><span>What this involves</span>${icon("arrow")}</span>` : "");
    return linkable
      ? `<a class="card" style="--i:${idx}" href="${r}services/${esc(s.slug)}.html">${inner}</a>`
      : `<article class="card" style="--i:${idx}">${inner}</article>`;
  }).join("\n  ")}
</div>`;
}

export function processBlock(steps, { band = false, title = "How we run a job" } = {}) {
  const stepIcons = ["map", "check", "clock", "shield"];
  return `<section class="${band ? "band" : "alt"} reveal">
  <div class="wrap">
    <p class="eyebrow">How It Works</p>
    <h2>${esc(title)}</h2>
    <ol class="steps" style="margin-top:var(--space-8)">
      ${steps.map((s, idx) => `<li class="step" style="--i:${idx}">
        <div class="step-head">
          <b>Step ${esc(s.n)}</b>
          <span class="step-ico">${icon(stepIcons[idx % stepIcons.length])}</span>
        </div>
        <h3>${esc(s.title)}</h3>
        <p>${esc(s.body)}</p>
      </li>`).join("\n      ")}
    </ol>
  </div>
</section>`;
}

/**
 * The Arizona-specific block. This is the part a generic template cannot
 * produce, and the part that makes a service page worth indexing.
 */
export function azNotes(notes, { band = true, title = "What we deal with out here", lede = "" } = {}) {
  if (!notes || !notes.length) return "";
  return `<section class="${band ? "band" : ""} reveal">
  <div class="wrap">
    <p class="eyebrow">Arizona Field Conditions</p>
    <h2>${esc(title)}</h2>
    ${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
    <ul class="notes${band ? "" : " notes-light"}" style="margin-top:var(--space-8)">
      ${notes.map((n, idx) => `<li style="--i:${idx}">${esc(n)}</li>`).join("\n      ")}
    </ul>
  </div>
</section>`;
}

export function galleryBlock(spec, { depth = 0, limit = 99, heading = "Recent work" } = {}) {
  const r = rel(depth);
  const imgs = spec.proof.gallery.slice(0, limit);
  if (!imgs.length) return "";
  const resolveImg = u => (u.startsWith("http") ? u : r + u);
  const firstFull = resolveImg(imgs[0].src);
  const firstAlt = imgs[0].alt || `${spec.business.tradeLabel} project by ${spec.business.name}`;

  return `<section class="reveal">
  <div class="wrap">
    ${heading ? `<p class="eyebrow">Project Gallery</p>` : ""}
    <h2>${esc(heading)}</h2>
    <div class="gallery" style="margin-top:var(--space-8)">
      ${imgs.map((g, idx) => {
        const thumbSrc = resolveImg(g.thumb || g.src);
        const fullSrc = resolveImg(g.src);
        const altText = g.alt || `${spec.business.tradeLabel} project by ${spec.business.name}`;
        const cap = [g.service, g.city].filter(Boolean).join(" · ");
        return `<figure class="gallery-item" style="--i:${idx}">
        <button type="button" class="gallery-btn" data-full="${esc(fullSrc)}" data-alt="${esc(altText)}" data-caption="${esc(cap || altText)}" aria-label="View larger photo: ${esc(altText)}">
          <img src="${esc(thumbSrc)}" alt="${esc(altText)}" loading="lazy" width="800" height="600">
          <span class="gallery-zoom" aria-hidden="true">${icon("zoom")}<span>Inspect photo</span></span>
        </button>
        ${cap ? `<figcaption>${esc(cap)}</figcaption>` : ""}
      </figure>`;
      }).join("\n      ")}
    </div>
    <dialog class="lightbox" closedby="any" aria-label="Project photo viewer">
      <div class="lb-inner">
        <div class="lb-bar">
          <span class="lb-cap"></span>
          <div class="lb-actions">
            <button type="button" class="lb-nav" data-lb-prev aria-label="Previous photo">${icon("prev")}</button>
            <button type="button" class="lb-nav" data-lb-next aria-label="Next photo">${icon("next")}</button>
            <button type="button" class="lb-close" data-lb-close aria-label="Close photo viewer">${icon("close")}</button>
          </div>
        </div>
        <img class="lb-img" src="${esc(firstFull)}" alt="${esc(firstAlt)}">
      </div>
    </dialog>
  </div>
</section>`;
}

/**
 * Reviews. When the spec has none, this asks for them rather than inventing
 * them — see the note at the top of copy.mjs.
 */
export function reviewsBlock(spec, { depth = 0, limit = 6, heading = "What customers say" } = {}) {
  const r = rel(depth);
  const revs = spec.proof.reviews.slice(0, limit);
  const place = spec.integrations.reviewUrl || (spec.integrations.googlePlaceId
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(spec.integrations.googlePlaceId)}`
    : "");
  if (!revs.length) {
    return `<section class="alt reveal">
  <div class="wrap">
    <h2 class="center">Reviews</h2>
    <div class="review-ask" style="margin-top:var(--space-8)">
      <span class="review-ask-ico">${icon("quote")}</span>
      <p><strong>We are collecting reviews from recent customers.</strong></p>
      <p class="muted">Rather than put words in anyone's mouth, this space stays empty until real customers fill it.
      ${place ? "If we have worked for you, a review helps the next person decide." : "If we have worked for you, call and we will send you a link."}</p>
      ${place ? `<div class="btn-row" style="justify-content:center"><a class="btn btn-secondary" href="${esc(place)}" target="_blank" rel="noopener">Leave a review</a></div>` : ""}
    </div>
  </div>
</section>`;
  }
  return `<section class="alt reveal">
  <div class="wrap">
    ${heading ? `<p class="eyebrow">Customer Feedback</p>` : ""}
    <h2>${esc(heading)}</h2>
    <div class="reviews" style="margin-top:var(--space-8)">
      ${revs.map((rv, idx) => `<blockquote class="review" style="--i:${idx}">
        <div class="review-top">
          <div class="stars" aria-label="${rv.rating} out of 5 stars">${"★".repeat(rv.rating)}${"☆".repeat(5 - rv.rating)}</div>
          <span class="review-quo" aria-hidden="true">${icon("quote")}</span>
        </div>
        <p>${esc(rv.text)}</p>
        <footer><cite>${esc(rv.name)}</cite>${rv.city ? `${esc(rv.city)}, AZ` : ""}${rv.source ? ` · via ${esc(rv.source)}` : ""}</footer>
      </blockquote>`).join("\n      ")}
    </div>
    <div class="btn-row">
      ${spec.site.pages.reviews && depth === 0 ? `<a class="btn btn-outline" href="${r}reviews/">All reviews</a>` : ""}
      ${place ? `<a class="btn btn-outline" href="${esc(place)}" rel="noopener">Leave a review</a>` : ""}
    </div>
  </div>
</section>`;
}

export function areasBlock(spec, { depth = 0, heading = "Where we work", exclude = "" } = {}) {
  const r = rel(depth);
  const cities = spec.serviceArea.cities.filter(c => c !== exclude);
  if (!cities.length) return "";
  const linked = spec.site.pages.areaPages && spec.serviceArea.cities.length > 1;
  return `<section class="reveal">
  <div class="wrap">
    <p class="eyebrow">Service Coverage</p>
    <h2>${esc(heading)}</h2>
    <p class="lede">Based in ${esc(spec.serviceArea.home)}, working across ${esc(prose(cities))}${spec.serviceArea.radiusMiles ? ` (within ~${spec.serviceArea.radiusMiles} miles)` : ""}.</p>
    <ul class="pills">
      ${cities.map(c => linked
        ? `<li><a href="${esc(areaHref(spec, c, depth))}">${icon("map")}<span>${esc(c)}</span></a></li>`
        : `<li><span>${icon("map")}<span>${esc(c)}</span></span></li>`).join("\n      ")}
    </ul>
  </div>
</section>`;
}

export function faqBlock(faqs, { limit = 99, heading = "Questions we get", openFirst = true, depth = 0, showAll = false } = {}) {
  const r = rel(depth);
  const list = faqs.slice(0, limit);
  if (!list.length) return "";
  return `<section class="alt reveal">
  <div class="wrap">
    ${heading ? `<p class="eyebrow">Common Questions</p>` : ""}
    <h2>${esc(heading)}</h2>
    <div class="faq" style="margin-top:var(--space-8)">
      ${list.map((f, i) => `<details${openFirst && i === 0 ? " open" : ""}>
        <summary>${esc(f.q)}</summary>
        <p>${esc(f.a)}</p>
      </details>`).join("\n      ")}
    </div>
    ${showAll ? `<div class="btn-row"><a class="btn btn-outline" href="${r}faq/">All questions</a></div>` : ""}
  </div>
</section>`;
}

export function quoteForm(spec, { depth = 0, band = true, heading = "Get a free estimate", lede = "", defaultService = "", defaultCity = "" } = {}) {
  const services = spec.services.map(s => `<option${s.name === defaultService ? " selected" : ""}>${esc(s.name)}</option>`).join("");
  const ownerFirst = spec.business.owner ? spec.business.owner.split(" ")[0] : "We";
  const timelines = ["As soon as possible", "Within a month", "One to three months", "Just pricing it out"];

  return `<section id="quote" class="${band ? "band" : "alt"} reveal">
  <div class="wrap quote-split">
    <div class="quote-pitch">
      <p class="eyebrow">Free Written Estimate</p>
      <h2>${esc(heading)}</h2>
      <p class="lede">${esc(lede || `Tell us about the job. ${ownerFirst} will get back to you, usually the same day.`)}</p>
      <ol class="quote-expect">
        <li><b>01</b><div><strong>Quick review</strong><span>We read your notes and check the schedule for ${esc(defaultCity || spec.serviceArea.home)}.</span></div></li>
        <li><b>02</b><div><strong>Direct callback</strong><span>You talk straight to someone who does the work — no call center.</span></div></li>
        <li><b>03</b><div><strong>Written scope &amp; price</strong><span>Clear, itemized estimate in writing before any work starts.</span></div></li>
      </ol>
      <div class="quote-direct">
        <span class="quote-direct-ico">${icon("phone")}</span>
        <div>
          <span>Prefer to talk right now?</span>
          <a href="tel:${esc(telHref(spec.contact.phone))}">Call ${esc(spec.contact.phoneDisplay)}</a>
        </div>
      </div>
    </div>
    <div class="quote-col">
      <div id="form-ok" class="form-ok" role="status">
        <strong>Thanks — that is in.</strong>
        <p style="margin-top:var(--space-2)">We will call you on the number you gave us. If it is urgent, call ${esc(spec.contact.phoneDisplay)} and you will get a person.</p>
      </div>
      <form class="quote" id="quote-form" novalidate
            data-endpoint="${esc(spec.integrations.leadEndpoint)}"
            data-business="${esc(spec.business.name)}"
            data-phone="${esc(spec.contact.phoneDisplay)}">
        <div class="field-row">
          <div class="field">
            <label for="f-name">Your name</label>
            <input id="f-name" name="name" autocomplete="name" required>
            <span class="err" aria-live="polite"></span>
          </div>
          <div class="field">
            <label for="f-phone">Phone</label>
            <input id="f-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required>
            <span class="err" aria-live="polite"></span>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="f-email">Email <span class="muted">(optional)</span></label>
            <input id="f-email" name="email" type="email" autocomplete="email">
            <span class="err" aria-live="polite"></span>
          </div>
          <div class="field">
            <label for="f-city">City</label>
            <select id="f-city" name="city">
              ${spec.serviceArea.cities.map(c => `<option${c === defaultCity ? " selected" : ""}>${esc(c)}</option>`).join("")}
              <option>Somewhere else</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="f-service">What do you need?</label>
          <select id="f-service" name="service">${services}<option>Something else</option></select>
        </div>
        <div class="field">
          <label for="f-when">Timeline</label>
          <div class="time-pills" role="group" aria-label="Select timeline">
            ${timelines.map((t, i) => `<button type="button" class="time-pill${i === 0 ? " active" : ""}" data-timeline="${esc(t)}">${esc(t)}</button>`).join("")}
          </div>
          <select id="f-when" name="timeline" class="sr-select">
            ${timelines.map(t => `<option>${esc(t)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="f-msg">Details <span class="muted">(optional)</span></label>
          <textarea id="f-msg" name="message" placeholder="Size, location, anything we should know before we come out"></textarea>
        </div>
        <div class="hp" aria-hidden="true">
          <label for="f-cu">Leave this empty</label>
          <input id="f-cu" name="company_url" tabindex="-1" autocomplete="off">
        </div>
        <p class="form-err" id="form-err" role="alert" hidden></p>
        <button class="btn btn-primary" type="submit" style="width:100%"><span>Request my estimate</span>${icon("arrow")}</button>
        <p class="form-note">No obligation, and we do not sell your details to anyone.</p>
      </form>
    </div>
  </div>
</section>`;
}

export function ctaBand(spec, { depth = 0, heading = "", lede = "" } = {}) {
  const r = rel(depth);
  return `<section class="alt reveal">
  <div class="wrap">
    <div class="cta-card">
      <div class="cta-copy">
        <p class="eyebrow">Ready When You Are</p>
        <h2>${esc(heading || `Need ${spec.business.tradeLabel.toLowerCase()} work in ${spec.serviceArea.home}?`)}</h2>
        <p class="lede">${esc(lede || `${spec.offers.freeEstimates ? "Estimates are free and in writing. " : ""}Call and talk to someone who does the work.`)}</p>
      </div>
      <div class="btn-row" style="margin-top:0">
        <a class="btn btn-primary" href="tel:${esc(telHref(spec.contact.phone))}">${icon("phone")}<span>Call ${esc(spec.contact.phoneDisplay)}</span></a>
        <a class="btn btn-outline" href="${r}contact/"><span>Request an estimate</span>${icon("arrow")}</a>
      </div>
    </div>
  </div>
</section>`;
}
