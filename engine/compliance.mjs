/**
 * Build-time checks.
 *
 * Three groups, in order of how much they can cost the contractor:
 *
 *  1. legal      — Arizona ROC licence display, and honesty of reviews/ratings
 *  2. functional — broken links, dead lead form, leaked template placeholders
 *  3. quality    — titles, descriptions, headings, alt text, contrast
 *
 * A `fail` means do not publish. `warn` means publish but fix it. The CLI exits
 * non-zero on any fail, so a batch run cannot quietly ship a broken site.
 */

import { contrast } from "./html.mjs";

const PLACEHOLDER = [
  /Project photo \d/i,
  /lorem ipsum/i,
  /\bTBD\b/,
  /\[(?:your|insert|business|phone|city)[^\]]*\]/i,
  /\bplaceholder\b/i,
  /\bundefined\b/,
  /\bnull\b/,
  /\bNaN\b/
];

/** Decode the entities we emit, so lengths are measured as a crawler sees them. */
function decode(s) {
  return String(s)
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "\u2013").replace(/&middot;/g, "\u00b7")
    .replace(/&amp;/g, "&");
}

export function check({ files, spec }) {
  const out = [];
  const add = (level, rule, message, where = "") => out.push({ level, rule, message, where });

  const htmlFiles = Object.entries(files).filter(([p]) => p.endsWith(".html"));
  // The legal checks compare against the rendered text, so entities have to be
  // decoded first: a business name like "Rincon Block & Stone, LLC" is escaped
  // to "&amp;" in the markup and would otherwise look absent.
  const home = decode(files["index.html"] || "");

  /* ============ 1. legal ============ */

  // A.R.S. 32-1124(B)(4) with ROC substantive policy statement 2021.02: a
  // contractor may advertise a URL instead of the licence number only if that
  // site shows the licensee name and licence number on the home page, clearly
  // visible, appropriately sized, and NOT in the footer.
  if (!spec.license.rocNumber) {
    add("fail", "roc.number",
      "No ROC licence number. Without one on the home page the contractor cannot use the " +
      "A.R.S. 32-1124(B)(4) option of advertising a URL in place of the number.");
  } else {
    const num = spec.license.rocNumber;
    if (!home.includes(num)) {
      add("fail", "roc.homepage", `ROC #${num} does not appear on the home page.`, "index.html");
    }
    if (!home.includes(spec.business.name)) {
      add("fail", "roc.name", "The licensee name does not appear on the home page.", "index.html");
    }
    // The number must be preceded by "ROC" per the ROC's own guidance.
    if (!new RegExp(`ROC\\s*#?\\s*${num}`).test(home)) {
      add("warn", "roc.prefix", `The number should be preceded by "ROC", as in "ROC #${num}".`, "index.html");
    }
    // Prominence: it has to be somewhere other than the footer.
    const footIdx = home.indexOf('<footer class="site-foot"');
    const firstIdx = home.indexOf(num);
    if (footIdx > -1 && firstIdx > footIdx) {
      add("fail", "roc.prominence",
        "The ROC number appears only inside the footer. Policy statement 2021.02 says it must not " +
        "be in the footer — put it in the header or the hero.", "index.html");
    }
    // Present on every page is not required, but it is the easy way to be safe.
    const missing = htmlFiles.filter(([p, h]) => p !== "404.html" && !decode(h).includes(num)).map(([p]) => p);
    if (missing.length) {
      add("warn", "roc.everypage", `ROC number missing from ${missing.length} page(s).`, missing.slice(0, 4).join(", "));
    }
  }

  // Honesty of social proof. The generator must never have invented these.
  const specReviews = spec.proof.reviews.length;
  const blockquotes = ((files["index.html"] || "").match(/<blockquote class="review"/g) || []).length;
  if (specReviews === 0 && blockquotes > 0) {
    add("fail", "reviews.fabricated",
      "Review quotes are rendered but the spec contains none, so they were generated. " +
      "Fabricated testimonials are a deceptive practice under 16 CFR part 465.", "index.html");
  }
  const allHtml = htmlFiles.map(([, h]) => h).join("\n");
  if (specReviews === 0 && /aggregateRating/.test(allHtml)) {
    add("fail", "reviews.rating",
      "aggregateRating is marked up with no real reviews behind it. This breaks Google's " +
      "structured data policy and is the kind of claim the FTC rule covers.");
  }
  for (const [p, h] of htmlFiles) {
    if (/★/.test(h) && !/<blockquote class="review"/.test(h) && !/aria-label="\d out of 5/.test(h)) {
      add("warn", "reviews.stars", "Star glyphs render without a review behind them.", p);
    }
  }

  /* ============ 2. functional ============ */

  // Every internal link must resolve to a file we actually generated.
  const known = new Set(Object.keys(files));
  for (const [p, h] of htmlFiles) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "";
    for (const m of h.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|tel:|#|data:)/.test(href)) continue;
      // /_acp/... is served by the hosting platform (lead and review endpoints), not a file.
      if (href.startsWith("/_acp/")) continue;
      // Strip the fragment and append index.html BEFORE normalizing, or the
      // trailing slash that marks a directory link is lost.
      let target = (href.startsWith("/") ? href.slice(1) : dir + href).split("#")[0].split("?")[0];
      if (target === "" || target.endsWith("/")) target += "index.html";
      target = normalizePath(target);
      if (!known.has(target)) {
        add("fail", "link.broken", `Link to "${href}" resolves to "${target}", which was not generated.`, p);
      }
    }
  }

  // Leaked template syntax means a page is showing code to a visitor.
  for (const [p, h] of htmlFiles) {
    if (/\$\{/.test(h)) add("fail", "template.leak", "Unresolved ${...} left in the output.", p);
  }

  // Placeholder text that should never reach a live site.
  for (const [p, h] of htmlFiles) {
    const text = h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    for (const re of PLACEHOLDER) {
      const m = text.match(re);
      if (m) add("fail", "content.placeholder", `Placeholder text in the page body: "${m[0]}".`, p);
    }
  }

  // JSON-LD must parse, and every @id it references must exist in the graph.
  for (const [p, h] of htmlFiles) {
    for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let doc;
      try {
        doc = JSON.parse(m[1].replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"));
      } catch (e) {
        add("fail", "schema.parse", `JSON-LD does not parse: ${e.message}`, p);
        continue;
      }
      const nodes = doc["@graph"] || [doc];
      const ids = new Set(nodes.map(n => n["@id"]).filter(Boolean));
      const refs = [];
      JSON.stringify(nodes, (k, v) => {
        if (v && typeof v === "object" && !Array.isArray(v) &&
            Object.keys(v).length === 1 && typeof v["@id"] === "string") refs.push(v["@id"]);
        return v;
      });
      for (const ref of new Set(refs)) {
        if (ids.has(ref)) continue;
        // An absolute @id is a cross-document reference that resolves at the
        // site root, which is normal linked data. A bare "#fragment" is a
        // same-document reference, so if it is missing it really is dangling.
        if (ref.startsWith("#")) {
          add("warn", "schema.dangling", `Same-document @id "${ref}" is not in this page's graph.`, p);
        }
      }
    }
  }

  if (!spec.integrations.leadEndpoint) {
    add("warn", "lead.endpoint",
      "No lead endpoint configured. The form shows its success message but the enquiry goes nowhere. " +
      "This is the most expensive thing to leave unset.");
  }
  if (!spec.contact.phone) add("fail", "contact.phone", "No phone number — the primary call to action is dead.");

  /* ============ 3. quality ============ */

  const titles = new Map(), descs = new Map();
  for (const [p, h] of htmlFiles) {
    if (p === "404.html") continue;

    const title = decode((h.match(/<title>([^<]*)<\/title>/) || [])[1] || "");
    const desc = decode((h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");

    if (!title) add("fail", "seo.title", "No <title>.", p);
    else if (title.length > 65) add("warn", "seo.title", `Title is ${title.length} chars; it will be truncated in results.`, p);
    else if (title.length < 15) add("warn", "seo.title", `Title is only ${title.length} chars.`, p);

    if (!desc) add("fail", "seo.description", "No meta description.", p);
    else if (desc.length > 160) add("warn", "seo.description", `Meta description is ${desc.length} chars.`, p);
    else if (desc.length < 50) add("warn", "seo.description", `Meta description is only ${desc.length} chars.`, p);

    if (titles.has(title)) add("warn", "seo.duplicate", `Title duplicates ${titles.get(title)}.`, p);
    else titles.set(title, p);
    if (descs.has(desc)) add("warn", "seo.duplicate", `Meta description duplicates ${descs.get(desc)}.`, p);
    else descs.set(desc, p);

    const h1s = (h.match(/<h1[\s>]/g) || []).length;
    if (h1s === 0) add("fail", "a11y.h1", "No <h1>.", p);
    if (h1s > 1) add("warn", "a11y.h1", `${h1s} <h1> elements; there should be one.`, p);

    if (!/<html lang="/.test(h)) add("fail", "a11y.lang", "No lang attribute on <html>.", p);
    if (!/class="skip"/.test(h)) add("warn", "a11y.skip", "No skip-to-content link.", p);

    // Every image needs alt text (empty alt is only correct for decoration,
    // and nothing generated here is decorative).
    for (const m of h.matchAll(/<img\b([^>]*)>/g)) {
      if (!/\balt="[^"]+"/.test(m[1])) add("warn", "a11y.alt", "An <img> has no non-empty alt text.", p);
    }

    // Every form control needs a label pointing at its id.
    for (const m of h.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
      const attrs = m[2];
      if (/type="(hidden|submit|button)"/.test(attrs)) continue;
      const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
      if (!id) { add("warn", "a11y.label", `A <${m[1]}> has no id, so no label can reference it.`, p); continue; }
      if (!h.includes(`for="${id}"`)) add("warn", "a11y.label", `No <label for="${id}">.`, p);
    }

    if (spec.site.baseUrl && !/<link rel="canonical"/.test(h)) {
      add("warn", "seo.canonical", "No canonical URL.", p);
    }
  }

  // Sitemap must cover every indexable page, and nothing else.
  const sm = files["sitemap.xml"] || "";
  const indexable = htmlFiles.filter(([p]) => p !== "404.html").map(([p]) => p);
  for (const p of indexable) {
    const loc = p.replace(/index\.html$/, "");
    if (!sm.includes(`/${loc}<`) && !sm.includes(`/${loc}</loc>`)) {
      add("warn", "seo.sitemap", `Not listed in sitemap.xml.`, p);
    }
  }

  // Contrast of the theme's own colour pairs. A trade accent like #FBBF24 with
  // white text is 1.67:1, which is what the old hardcoded colours produced.
  const tk = spec.__tokens;
  if (tk) {
    const pairs = [
      ["brand / on-brand (light)", tk.light.brand, tk.light.onBrand],
      ["accent / on-accent (light)", tk.light.accent, tk.light.onAccent],
      ["ink / surface (light)", tk.light.ink, tk.light.surface],
      ["ink-muted / surface (light)", tk.light.inkMuted, tk.light.surface],
      ["brand / surface (dark)", tk.dark.brand, tk.dark.surface],
      ["ink-muted / surface (dark)", tk.dark.inkMuted, tk.dark.surface],
      ["on-night / night", tk.night.ink, tk.night.bg],
      ["on-night-muted / night", tk.night.inkMuted, tk.night.bg]
    ];
    for (const [label, a, b] of pairs) {
      const ratio = contrast(a, b);
      if (ratio < 4.5) {
        add(ratio < 3 ? "fail" : "warn", "a11y.contrast",
          `${label} is ${ratio.toFixed(2)}:1, below the 4.5:1 needed for body text.`);
      }
    }
  }

  // The same link twice on one page is one problem, not two.
  const seen = new Set();
  const issues = out.filter(i => {
    const k = `${i.level}|${i.rule}|${i.message}|${i.where}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const counts = { fail: 0, warn: 0, info: 0 };
  for (const i of issues) counts[i.level] = (counts[i.level] || 0) + 1;
  return { issues, counts, ok: counts.fail === 0 };
}

/** Resolve "services/../areas/x.html" without the URL class. */
function normalizePath(p) {
  const parts = [];
  for (const seg of p.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

export function format(result) {
  if (!result.issues.length) return "All checks passed.";
  const order = { fail: 0, warn: 1, info: 2 };
  const icon = { fail: "FAIL", warn: "WARN", info: "INFO" };
  return result.issues
    .slice()
    .sort((a, b) => order[a.level] - order[b.level] || a.rule.localeCompare(b.rule))
    .map(i => `  ${icon[i.level].padEnd(4)} ${i.rule.padEnd(22)} ${i.message}${i.where ? `  [${i.where}]` : ""}`)
    .join("\n");
}
