/**
 * One function per page type. Each returns { path, html, title, desc }.
 *
 * This is the upgrade that matters: the old builder produced a single
 * index.html with anchor links. Every Arizona contractor site worth copying is
 * multi-page — New Era Masonry runs six service pages plus city pages for
 * Gilbert, Mesa, Paradise Valley, Phoenix and Scottsdale; Primo's Concrete has
 * six service pages; F&S Masonry has thirteen under Commercial alone. A single
 * page cannot rank for "block wall repair Marana" and it cannot be linked to
 * from an ad for one service.
 */

import { esc, telHref, prose, fitTitle, clamp } from "./html.mjs";
import { head, header, footer, tail, slugify, areaHref, areaCities } from "./layout.mjs";
import * as C from "./components.mjs";
import * as S from "./schema.mjs";
import { homeCopy, serviceCopy, areaCopy } from "./copy.mjs";

const page = (spec, { depth, current, title, desc, path, schema, crumbs, body }) => ({
  path,
  title,
  desc,
  html: [
    head({ spec, title, desc, depth, schema, canonical: spec.site.baseUrl ? `${spec.site.baseUrl}/${path}`.replace(/\/index\.html$/, "/") : "" }),
    header(spec, { depth, current }),
    crumbs ? C.crumbs(crumbs, depth) : "",
    `<main id="main" tabindex="-1">`,
    body,
    `</main>`,
    footer(spec, { depth }),
    tail(spec, { depth })
  ].filter(Boolean).join("\n")
});

/* ---------------------------------------------------------- home */
export function home(spec) {
  const cp = spec.__copy.home;
  const depth = 0;
  const nodes = [
    S.businessNode(spec, { catalog: true, reviews: true }),
    S.websiteNode(spec),
    ...spec.services.map(s => S.serviceNode(spec, s)),
    S.webPageNode(spec, { path: "", title: cp.title, desc: cp.metaDesc, crumbs: [{ name: "Home", path: "" }] }),
    S.faqNode(spec, cp.faqs.slice(0, 6), "")
  ];

  const body = [
    C.hero({ spec, eyebrow: cp.heroEyebrow, h1: cp.tagline, lede: cp.heroLine, depth }),
    C.trustStrip(spec),
    `<section class="reveal">
  <div class="wrap">
    <p class="eyebrow">Our Services</p>
    <h2>What we do</h2>
    <p class="lede">${esc(cp.servicesIntro)}</p>
    <div style="margin-top:var(--space-8)">${C.servicesGrid(spec, { depth })}</div>
  </div>
</section>`,
    C.azNotes(cp.azConcerns, {
      band: true,
      title: `${spec.business.tradeLabel} in Arizona is its own problem`,
      lede: "The things that decide whether this work lasts here are not the same things that matter elsewhere."
    }),
    C.processBlock(cp.processSteps),
    `<section class="reveal">
  <div class="wrap grid-2">
    <div>
      <p class="eyebrow">Local &amp; Licensed</p>
      <h2>About ${esc(spec.business.name)}</h2>
      <p class="lede">${esc(cp.about)}</p>
      <ul class="ticks">${cp.why.map(w => `<li>${esc(w)}</li>`).join("")}</ul>
      ${spec.license.rocNumber ? `<p class="muted" style="margin-top:var(--space-6);font-size:15px">
        Arizona ROC #${esc(spec.license.rocNumber)}${spec.license.class ? ` · ${esc(spec.license.class)}` : ""} ·
        <a href="${esc(spec.license.verifyUrl)}" target="_blank" rel="noopener">Look this license up</a>
      </p>` : ""}
    </div>
    <div class="aside-card">
      <span class="aside-ico">${C.icon("phone")}</span>
      <h3>Straight to a person</h3>
      <p class="muted">No call centre and no quote form that goes nowhere.</p>
      <div class="btn-row">
        <a class="btn btn-secondary" href="tel:${esc(telHref(spec.contact.phone))}">${C.icon("phone")}<span>Call ${esc(spec.contact.phoneDisplay)}</span></a>
      </div>
      <ul class="ticks">
        <li>${esc(spec.contact.hours.map(h => `${h.days.replace(/,/g, " ")} ${h.opens}–${h.closes}`).join(" · "))}</li>
        ${spec.contact.emergencyService ? "<li>Emergency service available</li>" : ""}
        <li>Serving ${esc(prose(spec.serviceArea.cities))}</li>
      </ul>
    </div>
  </div>
</section>`,
    C.galleryBlock(spec, { depth, limit: 6 }),
    C.reviewsBlock(spec, { depth, limit: 3 }),
    C.areasBlock(spec, { depth }),
    C.faqBlock(cp.faqs, { limit: 6, depth, showAll: spec.site.pages.faq && cp.faqs.length > 6 }),
    C.quoteForm(spec, { depth })
  ].filter(Boolean).join("\n");

  return page(spec, { depth, current: "", title: cp.title, desc: cp.metaDesc, path: "index.html", schema: [S.graph(nodes)], body });
}

/* ------------------------------------------------- service index */
export function serviceIndex(spec) {
  const depth = 1;
  const t = spec.business.tradeLabel;
  const title = fitTitle(`${t} Services in ${spec.serviceArea.home}, AZ`, spec.business.name);
  const desc = clamp(`${t} services from ${spec.business.name} in ${spec.serviceArea.home}, AZ. ${prose(spec.services.slice(0, 3).map(s => s.name))}. Call ${spec.contact.phoneDisplay}.`, 155);
  const crumbs = [{ name: "Home", path: "index.html" }, { name: "Services" }];
  const nodes = [
    S.businessNode(spec, { catalog: true }), S.websiteNode(spec),
    ...spec.services.map(s => S.serviceNode(spec, s)),
    S.webPageNode(spec, { path: "services/", title, desc, crumbs: [{ name: "Home", path: "" }, { name: "Services", path: "services/" }] })
  ];

  const body = [
    `<section class="reveal">
  <div class="wrap">
    <p class="eyebrow">${esc(spec.serviceArea.home)}, Arizona</p>
    <h1>${esc(t)} services</h1>
    <p class="lede">${esc(spec.__copy.home.servicesIntro)}</p>
    <div style="margin-top:var(--space-8)">${C.servicesGrid(spec, { depth })}</div>
  </div>
</section>`,
    C.processBlock(spec.__copy.home.processSteps, { band: true }),
    C.areasBlock(spec, { depth }),
    C.ctaBand(spec, { depth })
  ].join("\n");

  return page(spec, { depth, current: "services", title, desc, path: "services/index.html", schema: [S.graph(nodes)], crumbs, body });
}

/* ------------------------------------------------- service page */
export function service(spec, svc) {
  const depth = 1;
  const cp = serviceCopy(spec, svc);
  const crumbs = [{ name: "Home", path: "index.html" }, { name: "Services", path: "services/" }, { name: svc.name }];
  const nodes = [
    S.businessNode(spec), S.websiteNode(spec), S.serviceNode(spec, svc),
    S.webPageNode(spec, {
      path: `services/${svc.slug}.html`, title: cp.title, desc: cp.metaDesc,
      crumbs: [{ name: "Home", path: "" }, { name: "Services", path: "services/" }, { name: svc.name, path: `services/${svc.slug}.html` }]
    }),
    S.faqNode(spec, cp.faqs, `services/${svc.slug}.html`)
  ];

  const others = spec.services.filter(s => s.slug !== svc.slug).slice(0, 5);

  const body = [
    C.hero({ spec, eyebrow: `${spec.business.tradeLabel} · ${spec.serviceArea.home}, AZ`, h1: cp.h1, lede: cp.intro, depth }),
    C.azNotes(cp.notes, { band: true, title: "What matters on this job in Arizona" }),
    C.processBlock(cp.processSteps, { band: false }),
    C.galleryBlock(spec, { depth, limit: 3, heading: `${svc.name} we have done` }),
    C.faqBlock(cp.faqs, { limit: 5, depth, showAll: spec.site.pages.faq }),
    others.length ? `<section class="reveal">
  <div class="wrap">
    <p class="eyebrow">Related Services</p>
    <h2>Other work we do</h2>
    <ul class="pills">
      ${others.map(s => `<li><a href="${esc(s.slug)}.html">${C.icon(spec.business.trade)}<span>${esc(s.name)}</span></a></li>`).join("\n      ")}
    </ul>
  </div>
</section>` : "",
    C.areasBlock(spec, { depth, heading: `Where we do ${svc.name.toLowerCase()}` }),
    C.quoteForm(spec, { depth, heading: `Get a quote for ${svc.name.toLowerCase()}`, defaultService: svc.name })
  ].filter(Boolean).join("\n");

  return page(spec, { depth, current: "services", title: cp.title, desc: cp.metaDesc, path: `services/${svc.slug}.html`, schema: [S.graph(nodes)], crumbs, body });
}

/* ---------------------------------------------------- area index */
export function areaIndex(spec) {
  const depth = 1;
  const t = spec.business.tradeLabel;
  const title = fitTitle(`${t} Service Area in ${spec.serviceArea.home}, AZ`, spec.business.name);
  const desc = clamp(`${spec.business.name} serves ${prose(spec.serviceArea.cities.slice(0, 5))} and nearby. Licensed ${t.toLowerCase()} contractor. Call ${spec.contact.phoneDisplay}.`, 155);
  const crumbs = [{ name: "Home", path: "index.html" }, { name: "Service Area" }];
  const nodes = [
    S.businessNode(spec), S.websiteNode(spec),
    ...spec.serviceArea.cities.map(c => S.areaNode(spec, c)),
    S.webPageNode(spec, { path: "areas/", title, desc, crumbs: [{ name: "Home", path: "" }, { name: "Service Area", path: "areas/" }] })
  ];

  const body = [
    `<section class="reveal">
  <div class="wrap">
    <p class="eyebrow">Arizona Coverage</p>
    <h1>Where we work</h1>
    <p class="lede">Based in ${esc(spec.serviceArea.home)}, and generally anywhere within about ${spec.serviceArea.radiusMiles} miles of it. Each city outside ${esc(spec.serviceArea.home)} has its own page.</p>
    <div class="grid" style="margin-top:var(--space-8)">
      ${spec.serviceArea.cities.map((c, idx) => {
        const isHome = c === spec.serviceArea.home;
        return `<a class="card" style="--i:${idx}" href="${esc(areaHref(spec, c, depth))}">
        <div class="card-top"><span class="card-icon">${C.icon("map")}</span><span class="card-num">${isHome ? "HQ" : "AZ"}</span></div>
        <h3>${esc(c)}, AZ${isHome ? " <span class=\"muted\" style=\"font-size:14px;font-weight:400\">(home base)</span>" : ""}</h3>
        <p>${esc(t)} work in ${esc(c)} — ${esc(prose(spec.services.slice(0, 3).map(s => s.name.toLowerCase())))}.</p>
        <span class="more"><span>${isHome ? "Main page" : esc(c) + " details"}</span>${C.icon("arrow")}</span>
      </a>`;
      }).join("\n      ")}
    </div>
  </div>
</section>`,
    C.ctaBand(spec, { depth })
  ].join("\n");

  return page(spec, { depth, current: "areas", title, desc, path: "areas/index.html", schema: [S.graph(nodes)], crumbs, body });
}

/* ----------------------------------------------------- area page */
export function area(spec, cityName) {
  const depth = 1;
  const cp = areaCopy(spec, cityName);
  const sl = slugify(cityName);
  const crumbs = [{ name: "Home", path: "index.html" }, { name: "Service Area", path: "areas/" }, { name: cityName }];
  const nodes = [
    S.businessNode(spec), S.websiteNode(spec), S.areaNode(spec, cityName),
    S.webPageNode(spec, {
      path: `areas/${sl}.html`, title: cp.title, desc: cp.metaDesc,
      crumbs: [{ name: "Home", path: "" }, { name: "Service Area", path: "areas/" }, { name: cityName, path: `areas/${sl}.html` }]
    })
  ];

  const body = [
    C.hero({ spec, eyebrow: `${cityName}, Arizona`, h1: cp.h1, lede: cp.intro, depth }),
    `<section class="reveal">
  <div class="wrap">
    <p class="eyebrow">Local Services</p>
    <h2>What we are called for in ${esc(cityName)}</h2>
    <div style="margin-top:var(--space-8)">${C.servicesGrid(spec, { depth, limit: 6 })}</div>
    <p class="muted" style="margin-top:var(--space-8)">${esc(cp.seasonNote)}</p>
  </div>
</section>`,
    C.azNotes(cp.notes, { band: true, title: `${spec.business.tradeLabel} conditions around ${cityName}` }),
    C.galleryBlock(spec, { depth, limit: 3, heading: "Recent work" }),
    C.reviewsBlock(spec, { depth, limit: 3 }),
    cp.nearby.length ? `<section class="reveal">
  <div class="wrap">
    <p class="eyebrow">Nearby Communities</p>
    <h2>Also serving</h2>
    <ul class="pills">
      ${cp.nearby.map(c => `<li><a href="${esc(areaHref(spec, c, depth))}">${C.icon("map")}<span>${esc(c)}</span></a></li>`).join("\n      ")}
    </ul>
  </div>
</section>` : "",
    C.quoteForm(spec, { depth, heading: `Get an estimate in ${cityName}`, defaultCity: cityName })
  ].filter(Boolean).join("\n");

  return page(spec, { depth, current: "areas", title: cp.title, desc: cp.metaDesc, path: `areas/${sl}.html`, schema: [S.graph(nodes)], crumbs, body });
}

/* ------------------------------------------------------- gallery */
export function gallery(spec) {
  const depth = 1;
  const title = fitTitle(`${spec.business.tradeLabel} Projects in ${spec.serviceArea.home}, AZ`, spec.business.name);
  const desc = clamp(`Photos of ${spec.business.tradeLabel.toLowerCase()} projects by ${spec.business.name} across ${prose(spec.serviceArea.cities.slice(0, 3))}.`, 155);
  const crumbs = [{ name: "Home", path: "index.html" }, { name: "Our Work" }];
  const nodes = [
    S.businessNode(spec), S.websiteNode(spec),
    S.webPageNode(spec, { path: "gallery/", title, desc, crumbs: [{ name: "Home", path: "" }, { name: "Our Work", path: "gallery/" }] }),
    {
      "@type": "ImageGallery",
      name: `${spec.business.name} project photos`,
      about: { "@id": `${spec.site.baseUrl}#business` },
      image: spec.proof.gallery.map(g => ({
        "@type": "ImageObject",
        contentUrl: g.src.startsWith("http") ? g.src : `${spec.site.baseUrl}/${g.src}`,
        ...(g.alt ? { caption: g.alt } : {})
      }))
    }
  ];

  const body = [
    `<section class="reveal">
  <div class="wrap">
    <p class="eyebrow">Completed Projects</p>
    <h1>Our work</h1>
    <p class="lede">Real jobs, photographed as they were finished. Click any photo to inspect it full-size.</p>
  </div>
</section>`,
    C.galleryBlock(spec, { depth, heading: "" }).replace("<h2></h2>", ""),
    C.ctaBand(spec, { depth })
  ].join("\n");

  return page(spec, { depth, current: "gallery", title, desc, path: "gallery/index.html", schema: [S.graph(nodes)], crumbs, body });
}

/* ------------------------------------------------------- reviews */
export function reviews(spec) {
  const depth = 1;
  const title = fitTitle(`Reviews — ${spec.business.tradeLabel} in ${spec.serviceArea.home}, AZ`, spec.business.name);
  const desc = clamp(spec.proof.reviews.length
    ? `What customers say about ${spec.business.name}, a licensed ${spec.business.tradeLabel.toLowerCase()} contractor in ${spec.serviceArea.home}, AZ.`
    : `${spec.business.name} is collecting customer reviews. Licensed ${spec.business.tradeLabel.toLowerCase()} contractor in ${spec.serviceArea.home}, AZ.`, 155);
  const crumbs = [{ name: "Home", path: "index.html" }, { name: "Reviews" }];
  const nodes = [
    S.businessNode(spec, { reviews: true }), S.websiteNode(spec),
    S.webPageNode(spec, { path: "reviews/", title, desc, crumbs: [{ name: "Home", path: "" }, { name: "Reviews", path: "reviews/" }] })
  ];

  const body = [
    `<section class="reveal">
  <div class="wrap">
    <p class="eyebrow">Verified Feedback</p>
    <h1>Reviews</h1>
    <p class="lede">${spec.proof.reviews.length
      ? "From customers in " + esc(prose([...new Set(spec.proof.reviews.map(r => r.city).filter(Boolean))])) + "."
      : "We would rather show you nothing than show you something we wrote ourselves."}</p>
  </div>
</section>`,
    C.reviewsBlock(spec, { depth, limit: 99, heading: "" }).replace("<h2></h2>", ""),
    C.ctaBand(spec, { depth })
  ].join("\n");

  return page(spec, { depth, current: "reviews", title, desc, path: "reviews/index.html", schema: [S.graph(nodes)], crumbs, body });
}

/* --------------------------------------------------------- about */
export function about(spec) {
  const depth = 1;
  const cp = spec.__copy.home;
  const title = fitTitle(`About — ${spec.business.tradeLabel} Contractor in ${spec.serviceArea.home}, AZ`, spec.business.name);
  const desc = clamp(`${spec.business.name}${spec.business.owner ? `, run by ${spec.business.owner}` : ""} — licensed ${spec.business.tradeLabel.toLowerCase()} contractor in ${spec.serviceArea.home}, AZ${spec.license.rocNumber ? `. ROC #${spec.license.rocNumber}` : ""}.`, 155);
  const crumbs = [{ name: "Home", path: "index.html" }, { name: "About" }];
  const nodes = [
    S.businessNode(spec), S.websiteNode(spec),
    S.webPageNode(spec, { path: "about/", title, desc, crumbs: [{ name: "Home", path: "" }, { name: "About", path: "about/" }] }),
    ...(spec.business.owner ? [{
      "@type": "Person",
      name: spec.business.owner,
      worksFor: { "@id": `${spec.site.baseUrl}#business` },
      jobTitle: "Owner"
    }] : [])
  ];

  const body = [
    `<section class="reveal">
  <div class="wrap narrow">
    <p class="eyebrow">Who We Are</p>
    <h1>About ${esc(spec.business.name)}</h1>
    <p class="lede">${esc(cp.about)}</p>
    <ul class="ticks">${cp.why.map(w => `<li>${esc(w)}</li>`).join("")}</ul>
  </div>
</section>`,
    `<section class="alt reveal">
  <div class="wrap grid-2">
    <div class="aside-card">
      <span class="aside-ico">${C.icon("shield")}</span>
      <h2>The license</h2>
      ${spec.license.rocNumber ? `<p>${esc(spec.business.name)} holds Arizona ROC license
        <strong>#${esc(spec.license.rocNumber)}</strong>${spec.license.class ? ` in class ${esc(spec.license.class)}` : ""}${spec.license.classDescription ? ` (${esc(spec.license.classDescription)})` : ""}.
        ${spec.license.bonded ? "The license is bonded. " : ""}${spec.license.insured ? "We carry liability insurance. " : ""}</p>
      <p>You can check all of that yourself, by license number, on the Arizona Registrar of Contractors site.
        We would rather you did than take our word for it.</p>
      <div class="btn-row"><a class="btn btn-outline" href="${esc(spec.license.verifyUrl)}" target="_blank" rel="noopener">Look up ROC #${esc(spec.license.rocNumber)}</a></div>`
        : `<p>License details are being updated. Call us and we will give you the number so you can look it up.</p>`}
    </div>
    <div>
      <p class="eyebrow">Consumer Protection</p>
      <h2>Why the license matters</h2>
      <p class="muted">In Arizona, most contracting work over $1,000 requires an active ROC license. An unlicensed
      contractor cannot pull a permit, is not bonded, and leaves you without recourse through the Registrar if the
      work goes wrong. The license number is the one thing on this page you can independently verify.</p>
    </div>
  </div>
</section>`,
    C.azNotes(cp.azConcerns, { band: true, title: "What we have learned working here" }),
    C.processBlock(cp.processSteps, { band: false }),
    C.areasBlock(spec, { depth }),
    C.ctaBand(spec, { depth })
  ].join("\n");

  return page(spec, { depth, current: "about", title, desc, path: "about/index.html", schema: [S.graph(nodes)], crumbs, body });
}

/* ----------------------------------------------------------- faq */
export function faq(spec) {
  const depth = 1;
  const cp = spec.__copy.home;
  const title = fitTitle(`${spec.business.tradeLabel} FAQ — ${spec.serviceArea.home}, AZ`, spec.business.name);
  const desc = clamp(`Straight answers about licensing, estimates, timelines and ${spec.business.tradeLabel.toLowerCase()} work in ${spec.serviceArea.home}, AZ.`, 155);
  const crumbs = [{ name: "Home", path: "index.html" }, { name: "FAQ" }];
  const nodes = [
    S.businessNode(spec), S.websiteNode(spec),
    S.faqNode(spec, cp.faqs, "faq/"),
    S.webPageNode(spec, { path: "faq/", title, desc, crumbs: [{ name: "Home", path: "" }, { name: "FAQ", path: "faq/" }] })
  ];

  const body = [
    `<section class="reveal">
  <div class="wrap">
    <p class="eyebrow">Straight Answers</p>
    <h1>Questions we get</h1>
    <p class="lede">If yours is not here, call and ask.</p>
  </div>
</section>`,
    C.faqBlock(cp.faqs, { limit: 99, depth, heading: "", openFirst: false }).replace("<h2></h2>", ""),
    C.ctaBand(spec, { depth })
  ].join("\n");

  return page(spec, { depth, current: "faq", title, desc, path: "faq/index.html", schema: [S.graph(nodes)], crumbs, body });
}

/* ------------------------------------------------------- contact */
export function contact(spec) {
  const depth = 1;
  const title = fitTitle(`Contact — ${spec.business.tradeLabel} in ${spec.serviceArea.home}, AZ`, spec.business.name);
  const desc = clamp(`Call ${spec.contact.phoneDisplay} or request a free estimate from ${spec.business.name}, licensed ${spec.business.tradeLabel.toLowerCase()} contractor in ${spec.serviceArea.home}, AZ.`, 155);
  const crumbs = [{ name: "Home", path: "index.html" }, { name: "Contact" }];
  const nodes = [
    S.businessNode(spec), S.websiteNode(spec),
    S.webPageNode(spec, { path: "contact/", title, desc, crumbs: [{ name: "Home", path: "" }, { name: "Contact", path: "contact/" }] }),
    {
      "@type": "ContactPage",
      name: title,
      about: { "@id": `${spec.site.baseUrl}#business` }
    }
  ];

  const body = [
    `<section class="reveal">
  <div class="wrap grid-2">
    <div>
      <p class="eyebrow">Talk to Us</p>
      <h1>Get an estimate</h1>
      <p class="lede">${spec.offers.freeEstimates ? "Free, in writing, no obligation." : "Tell us about the job."}
      ${spec.contact.emergencyService ? "Emergency work is handled same day." : ""}</p>
      <ul class="ticks">
        <li><a href="tel:${esc(telHref(spec.contact.phone))}">${esc(spec.contact.phoneDisplay)}</a></li>
        ${spec.contact.email ? `<li><a href="mailto:${esc(spec.contact.email)}">${esc(spec.contact.email)}</a></li>` : ""}
        <li>${esc(spec.contact.address.city)}, AZ ${esc(spec.contact.address.zip)}</li>
        <li>${esc(spec.contact.hours.map(h => `${h.days.replace(/,/g, " ")} ${h.opens}–${h.closes}`).join(" · "))}</li>
        ${spec.license.rocNumber ? `<li>Arizona ROC #${esc(spec.license.rocNumber)}</li>` : ""}
      </ul>
    </div>
    <div class="aside-card">
      <span class="aside-ico">${C.icon("map")}</span>
      <h2>Serving</h2>
      <p class="muted">Based in ${esc(spec.serviceArea.home)} and working across surrounding communities.</p>
      <ul class="pills">
        ${spec.serviceArea.cities.map(c => spec.site.pages.areaPages && spec.serviceArea.cities.length > 1
          ? `<li><a href="${esc(areaHref(spec, c, depth))}">${C.icon("map")}<span>${esc(c)}</span></a></li>`
          : `<li><span>${C.icon("map")}<span>${esc(c)}</span></span></li>`).join("\n        ")}
      </ul>
    </div>
  </div>
</section>`,
    C.quoteForm(spec, { depth, band: true })
  ].join("\n");

  return page(spec, { depth, current: "contact", title, desc, path: "contact/index.html", schema: [S.graph(nodes)], crumbs, body });
}

export { homeCopy };
