/** Reusable blocks shared by every page type. */

import { esc, telHref, prose } from "./html.mjs";
import { rel, slugify, areaHref } from "./layout.mjs";

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
  return `<header class="hero${hasMedia ? " has-media" : ""}">
  ${hasMedia ? `<img class="hero-img" src="${esc(media.src.startsWith("http") ? media.src : r + media.src)}" alt="${esc(media.alt || `${spec.business.tradeLabel} work by ${spec.business.name}`)}" fetchpriority="high">` : ""}
  <div class="hero-in">
    <div class="hero-copy">
      ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}
      <h1>${esc(h1)}</h1>
      ${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
      <div class="btn-row">
        ${ctaQuote ? `<a class="btn btn-primary" href="${r}contact/">Get a free estimate</a>` : ""}
        <a class="btn btn-outline" href="tel:${esc(telHref(spec.contact.phone))}">Call ${esc(spec.contact.phoneDisplay)}</a>
      </div>
    </div>
    ${showBadges ? `<ul class="badges">${badges(spec).map(b => `<li>${esc(b)}</li>`).join("")}</ul>` : ""}
  </div>
</header>`;
}

/** Only renders facts the spec actually has. No invented project counts. */
export function trustStrip(spec) {
  const s = spec.proof.stats;
  const items = [];
  if (s.yearsInBusiness) items.push([`${s.yearsInBusiness}`, "Years in the trade"]);
  if (s.projectsCompleted) items.push([`${s.projectsCompleted.toLocaleString("en-US")}+`, "Projects completed"]);
  if (s.rating && s.reviewCount) items.push([`${s.rating}★`, `From ${s.reviewCount} reviews`]);
  if (spec.license.rocNumber) items.push([`#${spec.license.rocNumber}`, "Arizona ROC license"]);
  if (spec.license.warrantyYears) items.push([`${spec.license.warrantyYears} yr`, "Workmanship warranty"]);
  if (spec.serviceArea.cities.length > 1) items.push([`${spec.serviceArea.cities.length}`, "Cities served"]);
  if (items.length < 3) return "";
  return `<div class="strip">
  <div class="strip-in">
    ${items.slice(0, 5).map(([b, l]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(l)}</span></div>`).join("\n    ")}
  </div>
</div>`;
}

export function servicesGrid(spec, { depth = 0, limit = 99, linked = true } = {}) {
  const r = rel(depth);
  const linkable = linked && spec.site.pages.servicePages;
  return `<div class="grid">
  ${spec.services.slice(0, limit).map(s => {
    const inner = `<h3>${esc(s.name)}</h3>${s.blurb ? `<p>${esc(s.blurb)}</p>` : ""}` +
      (linkable ? `<span class="more">What this involves</span>` : "");
    return linkable
      ? `<a class="card" href="${r}services/${esc(s.slug)}.html">${inner}</a>`
      : `<article class="card">${inner}</article>`;
  }).join("\n  ")}
</div>`;
}

export function processBlock(steps, { band = false, title = "How we run a job" } = {}) {
  return `<section class="${band ? "band" : "alt"} reveal">
  <div class="wrap">
    <h2>${esc(title)}</h2>
    <ol class="steps" style="margin-top:var(--space-8)">
      ${steps.map(s => `<li class="step"><b>${esc(s.n)}</b><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></li>`).join("\n      ")}
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
    <h2>${esc(title)}</h2>
    ${lede ? `<p class="lede">${esc(lede)}</p>` : ""}
    <ul class="notes${band ? "" : " notes-light"}" style="margin-top:var(--space-8)">
      ${notes.map(n => `<li>${esc(n)}</li>`).join("\n      ")}
    </ul>
  </div>
</section>`;
}

export function galleryBlock(spec, { depth = 0, limit = 99, heading = "Recent work" } = {}) {
  const r = rel(depth);
  const imgs = spec.proof.gallery.slice(0, limit);
  if (!imgs.length) return "";
  return `<section class="reveal">
  <div class="wrap">
    <h2>${esc(heading)}</h2>
    <div class="gallery" style="margin-top:var(--space-8)">
      ${imgs.map(g => `<figure>
        <img src="${esc((g.thumb || g.src).startsWith("http") ? (g.thumb || g.src) : r + (g.thumb || g.src))}" alt="${esc(g.alt || `${spec.business.tradeLabel} project by ${spec.business.name}`)}" loading="lazy" width="800" height="600">
        ${g.city || g.service ? `<figcaption>${esc([g.service, g.city].filter(Boolean).join(" · "))}</figcaption>` : ""}
      </figure>`).join("\n      ")}
    </div>
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
    <h2>${esc(heading)}</h2>
    <div class="reviews" style="margin-top:var(--space-8)">
      ${revs.map(rv => `<blockquote class="review">
        <div class="stars" aria-label="${rv.rating} out of 5 stars">${"★".repeat(rv.rating)}${"☆".repeat(5 - rv.rating)}</div>
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
    <h2>${esc(heading)}</h2>
    <p class="lede">Based in ${esc(spec.serviceArea.home)}, working across ${esc(prose(cities))}.</p>
    <ul class="pills">
      ${cities.map(c => linked
        ? `<li><a href="${esc(areaHref(spec, c, depth))}">${esc(c)}</a></li>`
        : `<li><span>${esc(c)}</span></li>`).join("\n      ")}
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

export function quoteForm(spec, { depth = 0, band = true, heading = "Get a free estimate", lede = "" } = {}) {
  const services = spec.services.map(s => `<option>${esc(s.name)}</option>`).join("");
  return `<section id="quote" class="${band ? "band" : "alt"} reveal">
  <div class="wrap">
    <h2>${esc(heading)}</h2>
    <p class="lede">${esc(lede || `Tell us about the job. ${spec.business.owner ? spec.business.owner.split(" ")[0] : "We"} will get back to you, usually the same day.`)}</p>
    <div id="form-ok" class="form-ok" role="status" style="margin-top:var(--space-8)">
      <strong>Thanks — that is in.</strong>
      <p style="margin-top:var(--space-2)">We will call you on the number you gave us. If it is urgent, call ${esc(spec.contact.phoneDisplay)} and you will get a person.</p>
    </div>
    <form class="quote" id="quote-form" style="margin-top:var(--space-8)" novalidate
          data-endpoint="${esc(spec.integrations.leadEndpoint)}"
          data-business="${esc(spec.business.name)}"
          data-phone="${esc(spec.contact.phoneDisplay)}">
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
      <div class="field">
        <label for="f-email">Email <span class="muted">(optional)</span></label>
        <input id="f-email" name="email" type="email" autocomplete="email">
        <span class="err" aria-live="polite"></span>
      </div>
      <div class="field">
        <label for="f-city">City</label>
        <select id="f-city" name="city">
          ${spec.serviceArea.cities.map(c => `<option>${esc(c)}</option>`).join("")}
          <option>Somewhere else</option>
        </select>
      </div>
      <div class="field">
        <label for="f-service">What do you need?</label>
        <select id="f-service" name="service">${services}<option>Something else</option></select>
      </div>
      <div class="field">
        <label for="f-when">Timeline</label>
        <select id="f-when" name="timeline">
          <option>As soon as possible</option>
          <option>Within a month</option>
          <option>One to three months</option>
          <option>Just pricing it out</option>
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
      <button class="btn btn-primary" type="submit" style="width:100%">Request my estimate</button>
      <p class="form-note">No obligation, and we do not sell your details to anyone.</p>
    </form>
  </div>
</section>`;
}

export function ctaBand(spec, { depth = 0, heading = "", lede = "" } = {}) {
  const r = rel(depth);
  return `<section class="alt reveal">
  <div class="wrap center">
    <h2>${esc(heading || `Need ${spec.business.tradeLabel.toLowerCase()} work in ${spec.serviceArea.home}?`)}</h2>
    <p class="lede" style="margin:0 auto">${esc(lede || `${spec.offers.freeEstimates ? "Estimates are free and in writing. " : ""}Call and talk to someone who does the work.`)}</p>
    <div class="btn-row" style="justify-content:center">
      <a class="btn btn-primary" href="tel:${esc(telHref(spec.contact.phone))}">Call ${esc(spec.contact.phoneDisplay)}</a>
      <a class="btn btn-outline" href="${r}contact/">Request an estimate</a>
    </div>
  </div>
</section>`;
}
