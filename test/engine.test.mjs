import { test } from "node:test";
import assert from "node:assert/strict";

import { normalize, describe as describeSpec } from "../engine/spec.mjs";
import { inferTrade, tradeKey, TRADE_KEYS } from "../engine/trades.mjs";
import { contrast, onColor, fitTitle, telDisplay, telHref, slug } from "../engine/html.mjs";
import { build } from "../engine/site.mjs";
import { check } from "../engine/compliance.mjs";
import { loadRoster, parseCSV } from "../engine/roster.mjs";

const base = {
  biz: "Luis Rojo's Masonry LLC", owner: "Luis Rojo", years: 12, trade: "Masonry",
  lic: "KB-2", roc: "337881", phone: "520-481-7579", city: "Tucson", zip: "85706",
  area: "Tucson, Marana, Oro Valley, Vail, Sahuarita", cust: "Both", fin: "on",
  domain: "luisrojosmasonry.com", sheet: "https://script.google.com/macros/s/X/exec",
  email: "luis@example.com"
};

/* ------------------------------------------------------------ the spec */

test("normalize accepts all four legacy input shapes", () => {
  const workOrder = normalize(base).spec;
  const skillBlock = normalize({
    BUSINESS_NAME: "Luis Rojo's Masonry LLC", OWNER_NAME: "Luis Rojo", TRADE: "Masonry",
    LICENSE_CLASS: "KB-2", ROC_NUMBER: "337881", PHONE: "520-481-7579", CITY: "Tucson",
    SERVICE_AREA: "Tucson, Marana, Oro Valley, Vail, Sahuarita", YEARS_IN_BUSINESS: 12
  }).spec;
  const orderForm = normalize({
    businessName: "Luis Rojo's Masonry LLC", contactName: "Luis Rojo", tradeType: "masonry",
    phone: "520-481-7579", serviceArea: "Tucson, Marana, Oro Valley, Vail, Sahuarita",
    roc: "337881", city: "Tucson"
  }).spec;
  const csvRow = normalize({
    "Business Name": "Luis Rojo's Masonry LLC", "License Class": "KB-2",
    "License Description": "General Residential Contractor - Masonry",
    "ROC Number": "337881", Phone: "520-481-7579", City: "Tucson"
  }).spec;

  for (const s of [workOrder, skillBlock, orderForm, csvRow]) {
    assert.equal(s.business.name, "Luis Rojo's Masonry LLC");
    assert.equal(s.business.trade, "masonry");
    assert.equal(s.license.rocNumber, "337881");
    assert.equal(s.contact.address.city, "Tucson");
  }
  assert.equal(workOrder.serviceArea.cities.length, 5);
});

test("the home city is always first in the service area, without duplicates", () => {
  const { spec } = normalize({ ...base, city: "Marana", area: "Tucson, Marana, marana, Vail" });
  assert.equal(spec.serviceArea.cities[0], "Marana");
  assert.equal(spec.serviceArea.cities.filter(c => c.toLowerCase() === "marana").length, 1);
});

test('"auto" and "TBD" placeholders never become content', () => {
  const { sheet, ...noSheet } = base;
  const { spec } = normalize({ ...noSheet, spec: "auto", TAGLINE: "auto", GOOGLE_SHEET_URL: "TBD" });
  assert.ok(spec.services.length > 1);
  assert.ok(!spec.services.some(s => /^(auto|tbd|n\/a)$/i.test(s.name)));
  assert.equal(spec.business.tagline, null);
  assert.equal(spec.integrations.leadEndpoint, "");
});

test("a missing ROC number is a spec error, not a warning", () => {
  const { issues } = normalize({ ...base, roc: "" });
  assert.ok(issues.some(i => i.level === "error" && i.field === "license.rocNumber"));
});

/* ------------------------------------------------------- trade inference */

test("general license classes are not read as trade codes", () => {
  // KB-2's "2" is not the excavating code, and B-1's "1" is not electrical.
  assert.equal(inferTrade("KB-2", ""), "general");
  assert.equal(inferTrade("B-1", ""), "general");
  assert.equal(inferTrade("A", ""), "general");
  // but the ROC's own description wins over the class
  assert.equal(inferTrade("KB-2", "General Residential Contractor - Masonry"), "masonry");
});

test("specialty license codes map to their trade", () => {
  assert.equal(inferTrade("CR-39", ""), "hvac");
  assert.equal(inferTrade("C-11", ""), "electrical");
  assert.equal(inferTrade("CR-42", ""), "roofing");
  assert.equal(inferTrade("L-37", ""), "plumbing");
  assert.equal(inferTrade("", "Air Conditioning and Refrigeration"), "hvac");
});

test("every trade key resolves and carries Arizona knowledge", () => {
  for (const k of TRADE_KEYS) {
    const t = normalize({ ...base, trade: k }).spec;
    assert.equal(t.business.trade, k);
    assert.ok(t.services.length >= 4, `${k} has too few default services`);
  }
  assert.equal(tradeKey("AC"), "hvac");
  assert.equal(tradeKey("nonsense-trade"), "general");
});

/* -------------------------------------------------------------- colours */

test("on-colour is chosen by contrast, not assumed", () => {
  // White on the electrical yellow is 1.67:1. Picking it would be unreadable.
  assert.ok(contrast("#FBBF24", "#FFFFFF") < 3);
  assert.notEqual(onColor("#FBBF24"), "#FFFFFF");
  assert.equal(onColor("#105A67"), "#FFFFFF");
});

test("every trade theme meets 4.5:1 on its own colours", () => {
  for (const k of TRADE_KEYS) {
    const result = build({ ...normalize({ ...base, trade: k }).spec });
    const tk = result.spec.__tokens;
    for (const [a, b, label] of [
      [tk.light.brand, tk.light.onBrand, "brand"],
      [tk.light.accent, tk.light.onAccent, "accent"],
      [tk.dark.brand, tk.dark.surface, "dark brand"]
    ]) {
      assert.ok(contrast(a, b) >= 4.5, `${k} ${label} is ${contrast(a, b).toFixed(2)}:1`);
    }
  }
});

/* ------------------------------------------------------------ the build */

test("one spec produces a whole multi-page site", () => {
  const r = build(base);
  const paths = Object.keys(r.files);
  assert.ok(paths.includes("index.html"));
  assert.ok(paths.includes("services/index.html"));
  assert.ok(paths.includes("areas/marana.html"));
  assert.ok(paths.includes("contact/index.html"));
  assert.ok(paths.includes("sitemap.xml"));
  assert.ok(paths.includes("robots.txt"));
  assert.ok(paths.includes("404.html"));
  assert.ok(paths.includes("assets/site.css"));
  assert.ok(r.manifest.pageCount > 10, `only ${r.manifest.pageCount} pages`);
});

test("the home city gets no area page of its own", () => {
  // Otherwise it competes with the home page for the same query.
  const r = build(base);
  assert.ok(!Object.keys(r.files).includes("areas/tucson.html"));
  assert.ok(Object.keys(r.files).includes("areas/marana.html"));
});

test("the build is deterministic", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  const a = build(base, { now });
  const b = build(base, { now });
  assert.deepEqual(Object.keys(a.files), Object.keys(b.files));
  for (const k of Object.keys(a.files)) assert.equal(a.files[k], b.files[k], `${k} differs between builds`);
});

test("a clean spec passes every check", () => {
  const r = build(base);
  const v = check(r);
  assert.equal(v.counts.fail, 0, JSON.stringify(v.issues.filter(i => i.level === "fail"), null, 1));
  assert.equal(v.counts.warn, 0, JSON.stringify(v.issues.filter(i => i.level === "warn"), null, 1));
});

/* ---------------------------------------------------------- the honesty */

test("no reviews in the spec means no review quotes and no rating markup", () => {
  const r = build({ ...base, proof: { reviews: [] } });
  const all = Object.values(r.files).join("\n");
  assert.ok(!/aggregateRating/.test(all), "aggregateRating emitted with no reviews behind it");
  assert.ok(!/<blockquote class="review"/.test(all), "review quotes rendered with no reviews in the spec");
  // and it asks for them instead
  assert.match(r.files["index.html"], /collecting reviews/i);
  assert.equal(check(r).counts.fail, 0);
});

test("real reviews are rendered and marked up", () => {
  const r = build({
    ...base,
    proof: {
      reviews: [
        { name: "Marisol R.", city: "Marana", text: "Showed up when they said and the invoice matched the estimate.", rating: 5, source: "Google" },
        { name: "Dan K.", city: "Vail", text: "Clean work, hauled everything off at the end of the day.", rating: 5, source: "Google" }
      ]
    }
  });
  assert.match(r.files["index.html"], /Marisol R\./);
  assert.match(r.files["index.html"], /aggregateRating/);
  assert.equal(check(r).counts.fail, 0);
});

test("the checker catches fabricated reviews", () => {
  const r = build(base);
  // Simulate a template that invented a testimonial.
  r.files["index.html"] = r.files["index.html"].replace(
    "</main>",
    '<blockquote class="review"><p>Great job!</p><cite>Totally Real Person</cite></blockquote></main>'
  );
  const v = check(r);
  assert.ok(v.issues.some(i => i.rule === "reviews.fabricated" && i.level === "fail"));
});

/* --------------------------------------------------------- ROC display */

test("the ROC number is on the home page outside the footer", () => {
  const r = build(base);
  const home = r.files["index.html"];
  const firstMention = home.indexOf("337881");
  const footerStart = home.indexOf('<footer class="site-foot"');
  assert.ok(firstMention > -1, "ROC number missing from the home page");
  assert.ok(firstMention < footerStart, "ROC number appears only in the footer");
  assert.match(home, /ROC\s*#?\s*337881/);
});

test("the checker rejects a footer-only ROC number", () => {
  const r = build(base);
  // Strip every mention above the footer, the way a footer-only template would.
  const footerAt = r.files["index.html"].indexOf('<footer class="site-foot"');
  r.files["index.html"] =
    r.files["index.html"].slice(0, footerAt).split("337881").join("XXXXXX") +
    r.files["index.html"].slice(footerAt);
  const v = check(r);
  assert.ok(v.issues.some(i => i.rule === "roc.prominence" && i.level === "fail"));
});

/* ------------------------------------------------------------- the web */

test("every internal link resolves to a generated file", () => {
  const v = check(build(base));
  assert.equal(v.issues.filter(i => i.rule === "link.broken").length, 0);
});

test("the checker catches a broken link", () => {
  const r = build(base);
  r.files["index.html"] = r.files["index.html"].replace('href="contact/"', 'href="nope/"');
  assert.ok(check(r).issues.some(i => i.rule === "link.broken"));
});

test("titles and descriptions are unique and fit a search result", () => {
  const v = check(build(base));
  assert.equal(v.issues.filter(i => i.rule === "seo.duplicate").length, 0);
  assert.equal(v.issues.filter(i => i.rule === "seo.title").length, 0);
  assert.equal(v.issues.filter(i => i.rule === "seo.description").length, 0);
});

test("fitTitle drops the brand before it truncates the subject", () => {
  assert.equal(fitTitle("Short", "Brand", 60), "Short | Brand");
  const long = "A Really Quite Long Service Name in Some Arizona City, AZ";
  assert.equal(fitTitle(long, "An Extremely Long Business Name LLC", 60), long);
});

test("JSON-LD parses and uses one connected graph", () => {
  const r = build(base);
  const m = r.files["index.html"].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, "no JSON-LD on the home page");
  const doc = JSON.parse(m[1].replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&"));
  assert.ok(Array.isArray(doc["@graph"]), "schema is not a @graph");
  const types = doc["@graph"].flatMap(n => [].concat(n["@type"]));
  assert.ok(types.includes("LocalBusiness"));
  assert.ok(types.includes("WebSite"));
  assert.ok(types.includes("Service"));
  assert.ok(types.includes("FAQPage"));
  const biz = doc["@graph"].find(n => [].concat(n["@type"]).includes("LocalBusiness"));
  assert.equal(biz.identifier.value, "337881");
});

test("script-closing sequences in data cannot break out of the JSON-LD block", () => {
  const r = build({ ...base, biz: 'Rojo </script><img src=x> Masonry' });
  const m = r.files["index.html"].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m);
  assert.doesNotThrow(() => JSON.parse(m[1].replace(/\\u003c/g, "<").replace(/\\u003e/g, ">").replace(/\\u0026/g, "&")));
  assert.ok(!r.files["index.html"].includes("<img src=x>"), "unescaped markup reached the page");
});

/* ---------------------------------------------------------- the roster */

test("the CSV parser handles quotes, commas and newlines inside fields", () => {
  const rows = parseCSV('a,b\n"x, y","line1\nline2"\n"say ""hi""",z\n');
  assert.deepEqual(rows[1], ["x, y", "line1\nline2"]);
  assert.deepEqual(rows[2], ['say "hi"', "z"]);
});

test("a roster row becomes a buildable spec", () => {
  const csv = [
    "Business Name,License Number,License Class,Classification Description,Business Phone Number,City,Website",
    '"Saguaro Roofing Services",355010,CR-42,"Roofing","623-555-0177",Surprise,',
    '"Ocotillo Electric Inc",318455,CR-11,"Electrical","480-555-0190",Chandler,http://ocotilloelectric.com'
  ].join("\n");
  const rows = loadRoster(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].trade, "roofing");
  assert.equal(rows[0].hasWebsite, false);
  assert.equal(rows[1].trade, "electrical");
  assert.equal(rows[1].hasWebsite, true);
  const r = build(rows[0].spec);
  assert.ok(r.manifest.pageCount > 5);
  assert.equal(check(r).counts.fail, 0);
});

/* ------------------------------------------------------------- helpers */

test("phone formatting", () => {
  assert.equal(telDisplay("5204817579"), "(520) 481-7579");
  assert.equal(telHref("520-481-7579"), "+15204817579");
  assert.equal(telHref("1 (520) 481-7579"), "+15204817579");
});

test("slugs are URL-safe and keep ampersands readable", () => {
  assert.equal(slug("Block Walls & Fences"), "block-walls-and-fences");
  assert.equal(slug("Luis Rojo's Masonry LLC"), "luis-rojos-masonry-llc");
});

test("describe gives a one-line summary", () => {
  assert.match(describeSpec(normalize(base).spec), /Masonry.*337881.*5 cities/);
});
