/**
 * Assemble a whole site from one spec.
 *
 * Returns { files, spec, issues, manifest } where files is a plain
 * { "path": "contents" } map. Nothing here touches the filesystem, so the same
 * function serves the CLI, the batch runner and the Netlify deploy function.
 */

import { tidy, slug, esc } from "./html.mjs";
import { tokens } from "./theme.mjs";
import { stylesheet, script, slugify, areaCities } from "./layout.mjs";
import { normalize } from "./spec.mjs";
import { homeCopy } from "./copy.mjs";
import * as P from "./pages.mjs";

export function build(input, { now = new Date(), copy: copyOverrides = null } = {}) {
  // Accept a raw spec or an already-normalized one.
  const { spec, issues } = input && input.__normalized
    ? { spec: input, issues: [] }
    : normalize(input);

  spec.__normalized = true;
  spec.__tokens = tokens(spec);
  // Copy enrichment from /api/copy is optional and additive: the generator's
  // own copy is always a complete, valid baseline, and only the fields the
  // enricher actually returned are replaced.
  spec.__copy = { home: { ...homeCopy(spec), ...(copyOverrides || {}) } };

  const p = spec.site.pages;
  const multiCity = spec.serviceArea.cities.length > 1;
  const pages = [P.home(spec)];

  if (p.servicePages) {
    pages.push(P.serviceIndex(spec));
    for (const s of spec.services) pages.push(P.service(spec, s));
  }
  if (p.areaPages && multiCity) {
    pages.push(P.areaIndex(spec));
    // areaCities() excludes the home city — the home page already owns that query.
    for (const c of areaCities(spec)) pages.push(P.area(spec, c));
  }
  if (p.gallery && spec.proof.gallery.length) pages.push(P.gallery(spec));
  if (p.reviews) pages.push(P.reviews(spec));
  if (p.about) pages.push(P.about(spec));
  if (p.faq) pages.push(P.faq(spec));
  if (p.contact) pages.push(P.contact(spec));

  const files = {};
  for (const pg of pages) files[pg.path] = tidy(pg.html);

  files["assets/site.css"] = stylesheet(spec.__tokens);
  files["assets/site.js"] = script();
  files["sitemap.xml"] = sitemap(spec, pages, now);
  files["robots.txt"] = robots(spec);
  files["404.html"] = notFound(spec);

  const manifest = {
    slug: spec.slug,
    business: spec.business.name,
    trade: spec.business.trade,
    rocNumber: spec.license.rocNumber,
    generatedAt: now.toISOString(),
    pageCount: pages.length,
    fileCount: Object.keys(files).length,
    // TextEncoder rather than Buffer: this module runs in Node (CLI, Netlify
    // function) and in the browser (builder.html imports it directly), so the
    // generator is literally the same code in all three places.
    bytes: Object.values(files).reduce((a, f) => a + new TextEncoder().encode(f).length, 0),
    pages: pages.map(pg => ({ path: pg.path, title: pg.title }))
  };

  return { files, spec, issues, manifest, pages };
}

/* ---------------------------------------------------------------- sitemap */

function sitemap(spec, pages, now) {
  const base = spec.site.baseUrl || "";
  const stamp = now.toISOString().slice(0, 10);
  // The home page outranks a service page, which outranks a city page. Giving
  // everything 1.0 tells a crawler nothing.
  const priority = path =>
    path === "index.html" ? "1.0"
      : /^(services|areas)\/index\.html$/.test(path) ? "0.8"
      : path.startsWith("services/") ? "0.7"
      : path.startsWith("areas/") ? "0.6"
      : path.startsWith("contact/") ? "0.8"
      : "0.5";

  const loc = path => {
    const clean = path.replace(/index\.html$/, "");
    return base ? `${base}/${clean}` : `/${clean}`;
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(pg => `  <url>
    <loc>${loc(pg.path)}</loc>
    <lastmod>${stamp}</lastmod>
    <changefreq>${pg.path === "index.html" ? "weekly" : "monthly"}</changefreq>
    <priority>${priority(pg.path)}</priority>
  </url>`).join("\n")}
</urlset>
`;
}

function robots(spec) {
  const base = spec.site.baseUrl;
  return `User-agent: *
Allow: /

# Answer engines and assistants are a real referral channel for this trade,
# so they are allowed explicitly rather than left to a default.
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

${base ? `Sitemap: ${base}/sitemap.xml` : "Sitemap: /sitemap.xml"}
`;
}

function notFound(spec) {
  const t = spec.business.tradeLabel;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found | ${esc(spec.business.name)}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<main id="main">
<section>
  <div class="wrap narrow">
    <p class="eyebrow">404</p>
    <h1>That page is not here</h1>
    <p class="lede">It may have moved. ${esc(spec.business.name)} is a licensed ${t.toLowerCase()} contractor in
    ${esc(spec.contact.address.city)}, Arizona${spec.license.rocNumber ? `, ROC #${spec.license.rocNumber}` : ""}.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="/">Back to the home page</a>
      <a class="btn btn-outline" href="tel:${spec.contact.phone.replace(/[^0-9+]/g, "")}">Call ${esc(spec.contact.phoneDisplay)}</a>
    </div>
  </div>
</section>
</main>
</body>
</html>
`;
}

export { slugify, slug };
