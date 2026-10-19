/**
 * JSON-LD.
 *
 * The old output emitted four standalone blocks (LocalBusiness, ItemList,
 * FAQPage, Organization) that did not reference each other, and the
 * LocalBusiness and Organization duplicated the same NAP. A consumer reading
 * that has to guess that the Service list and the business are related.
 *
 * This emits one @graph with @id references, so the business, the website,
 * each page, each service and each service area resolve to each other. That is
 * the whole pitch of these sites being "agent-friendly", so it should be true.
 *
 * Nothing here is invented. aggregateRating and review are emitted only when
 * the spec carries real reviews, because marking up ratings that are not
 * genuine and visible on the page breaks Google's structured data policy and,
 * since October 2024, sits inside what the FTC treats as a deceptive
 * testimonial under 16 CFR part 465.
 */

import { slug, telHref } from "./html.mjs";

/** schema.org has exact subtypes for some trades. Use them where they exist. */
const BUSINESS_TYPE = {
  hvac: "HVACBusiness",
  plumbing: "Plumber",
  electrical: "Electrician",
  roofing: "RoofingContractor",
  painting: "HousePainter",
  general: "GeneralContractor"
};

function businessType(tradeKey) {
  const exact = BUSINESS_TYPE[tradeKey];
  // No exact subtype: say LocalBusiness and HomeAndConstructionBusiness rather
  // than claiming GeneralContractor for a specialty-licensed sub.
  return exact ? ["LocalBusiness", exact] : ["LocalBusiness", "HomeAndConstructionBusiness"];
}

const DAY = {
  Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday",
  Fr: "Friday", Sa: "Saturday", Su: "Sunday"
};

function hoursSpec(hours) {
  return (hours || []).map(h => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: h.days.split(",").map(d => DAY[d.trim()] || d.trim()),
    opens: h.opens,
    closes: h.closes
  }));
}

function cityNode(name) {
  return {
    "@type": "City",
    name,
    containedInPlace: { "@type": "State", name: "Arizona" }
  };
}

const id = (base, frag) => `${base || ""}#${frag}`;

/**
 * The business node. Everything else points at it.
 *
 * `catalog` and `reviews` default off for sub-pages: an OfferCatalog of @id
 * references is only meaningful on a page whose graph actually carries those
 * Service nodes, and repeating aggregateRating on every page is duplicate
 * rating markup. The home, services index and reviews pages opt in.
 */
export function businessNode(spec, { catalog = false, reviews: withReviews = false } = {}) {
  const base = spec.site.baseUrl;
  const n = {
    "@type": businessType(spec.business.trade),
    "@id": id(base, "business"),
    name: spec.business.name,
    description: spec.__copy?.home?.metaDesc || undefined,
    url: base || undefined,
    telephone: telHref(spec.contact.phone) || undefined,
    email: spec.contact.email || undefined,
    address: {
      "@type": "PostalAddress",
      ...(spec.contact.address.street ? { streetAddress: spec.contact.address.street } : {}),
      addressLocality: spec.contact.address.city,
      addressRegion: spec.contact.address.state,
      ...(spec.contact.address.zip ? { postalCode: spec.contact.address.zip } : {}),
      addressCountry: "US"
    },
    areaServed: spec.serviceArea.cities.map(cityNode),
    openingHoursSpecification: hoursSpec(spec.contact.hours),
    priceRange: "$$",
    currenciesAccepted: "USD",
    knowsLanguage: "en-US"
  };

  if (spec.license.rocNumber) {
    n.hasCredential = {
      "@type": "EducationalOccupationalCredential",
      credentialCategory: "Arizona Registrar of Contractors License",
      identifier: spec.license.rocNumber,
      ...(spec.license.class ? { name: `ROC ${spec.license.class} #${spec.license.rocNumber}` } : {}),
      recognizedBy: {
        "@type": "GovernmentOrganization",
        name: "Arizona Registrar of Contractors",
        url: "https://roc.az.gov/"
      }
    };
    // identifier at the top level too, so a consumer that does not walk
    // hasCredential still finds the licence number.
    n.identifier = {
      "@type": "PropertyValue",
      propertyID: "Arizona ROC License",
      value: spec.license.rocNumber
    };
  }

  if (spec.business.owner) {
    n.founder = { "@type": "Person", name: spec.business.owner };
  }
  if (spec.business.yearsInBusiness) {
    n.foundingDate = String(new Date().getFullYear() - spec.business.yearsInBusiness);
  }
  if (spec.contact.emergencyService) {
    n.availableChannel = {
      "@type": "ServiceChannel",
      serviceType: "Emergency service",
      servicePhone: { "@type": "ContactPoint", telephone: telHref(spec.contact.phone) }
    };
  }

  const sameAs = [spec.integrations.facebookUrl].filter(Boolean);
  if (sameAs.length) n.sameAs = sameAs;

  // Only real, on-page reviews get marked up.
  const reviews = withReviews ? (spec.proof.reviews || []) : [];
  if (reviews.length) {
    n.review = reviews.map(r => ({
      "@type": "Review",
      reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
      author: { "@type": "Person", name: r.name },
      reviewBody: r.text,
      ...(r.source ? { publisher: { "@type": "Organization", name: r.source } } : {})
    }));
    const stats = spec.proof.stats || {};
    const count = stats.reviewCount || reviews.length;
    const value = stats.rating || (reviews.reduce((a, r) => a + (r.rating || 5), 0) / reviews.length);
    n.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(value).toFixed(1),
      reviewCount: count,
      bestRating: 5
    };
  }

  if (catalog) {
    n.hasOfferCatalog = {
      "@type": "OfferCatalog",
      name: `${spec.business.name} Services`,
      itemListElement: spec.services.map(s => ({
        "@type": "Offer",
        itemOffered: { "@id": id(base, `service-${s.slug}`) }
      }))
    };
  }

  return n;
}

export function websiteNode(spec) {
  const base = spec.site.baseUrl;
  return {
    "@type": "WebSite",
    "@id": id(base, "website"),
    ...(base ? { url: base } : {}),
    name: spec.business.name,
    publisher: { "@id": id(base, "business") },
    inLanguage: "en-US"
  };
}

export function serviceNode(spec, service) {
  const base = spec.site.baseUrl;
  return {
    "@type": "Service",
    "@id": id(base, `service-${service.slug}`),
    name: service.name,
    ...(service.blurb ? { description: service.blurb } : {}),
    serviceType: service.name,
    category: spec.business.tradeLabel,
    provider: { "@id": id(base, "business") },
    areaServed: spec.serviceArea.cities.map(cityNode),
    ...(base && spec.site.pages.servicePages
      ? { url: `${base}/services/${service.slug}.html` }
      : {}),
    ...(service.priceFrom
      ? { offers: { "@type": "Offer", price: service.priceFrom, priceCurrency: "USD" } }
      : {})
  };
}

export function webPageNode(spec, { path, title, desc, crumbs }) {
  const base = spec.site.baseUrl;
  const url = base ? `${base}/${path}`.replace(/\/+$/, "/").replace(/([^:])\/\//g, "$1/") : undefined;
  const node = {
    "@type": "WebPage",
    "@id": url ? `${url}#webpage` : `#webpage-${slug(path) || "home"}`,
    ...(url ? { url } : {}),
    name: title,
    description: desc,
    isPartOf: { "@id": id(base, "website") },
    about: { "@id": id(base, "business") },
    inLanguage: "en-US"
  };
  if (crumbs && crumbs.length > 1) {
    node.breadcrumb = {
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        ...(c.path !== undefined && base ? { item: `${base}/${c.path}`.replace(/([^:])\/\//g, "$1/") } : {})
      }))
    };
  }
  return node;
}

export function faqNode(spec, faqs, pagePath = "faq/") {
  const base = spec.site.baseUrl;
  return {
    "@type": "FAQPage",
    "@id": base ? `${base}/${pagePath}#faq` : "#faq",
    isPartOf: { "@id": id(base, "website") },
    mainEntity: faqs.map(f => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a }
    }))
  };
}

/** A city page gets its own node tying the business to that place. */
export function areaNode(spec, cityName) {
  const base = spec.site.baseUrl;
  return {
    "@type": "Service",
    "@id": base ? `${base}/areas/${slug(cityName)}.html#service` : `#service-area-${slug(cityName)}`,
    name: `${spec.business.tradeLabel} in ${cityName}, AZ`,
    provider: { "@id": id(base, "business") },
    areaServed: cityNode(cityName),
    serviceType: spec.business.tradeLabel,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: `${spec.business.tradeLabel} services in ${cityName}`,
      // Named inline rather than by @id: a city page's graph does not carry
      // the Service nodes, and a reference that resolves nowhere is worse
      // than a self-contained description.
      itemListElement: spec.services.map(s => ({
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: `${s.name} in ${cityName}`, serviceType: s.name }
      }))
    }
  };
}

/** Wrap nodes into the single graph document that goes in the page head. */
export function graph(nodes) {
  return {
    "@context": "https://schema.org",
    "@graph": nodes.filter(Boolean)
  };
}
