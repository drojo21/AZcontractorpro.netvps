/** Tiny HTML helpers. No dependencies, no template engine. */

const AMP = /&/g, LT = /</g, GT = />/g, QUOT = /"/g, APOS = /'/g;

/** Escape for HTML text and double-quoted attribute values. */
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(AMP, "&amp;").replace(LT, "&lt;").replace(GT, "&gt;")
    .replace(QUOT, "&quot;").replace(APOS, "&#39;");
}

const LINE_SEPS = new RegExp(
  "[" + String.fromCharCode(0x2028) + String.fromCharCode(0x2029) + "]", "g"
);

/**
 * Escape for embedding inside a <script> element. JSON.stringify alone is not
 * enough: a "</script>" inside any string value would close the element early.
 */
export function jsonScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LINE_SEPS, (c) => (c.charCodeAt(0) === 0x2028 ? "\\u2028" : "\\u2029"));
}

export function slug(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "520-481-7579" -> "+15204817579" for tel: and schema. */
export function telHref(phone) {
  const d = String(phone || "").replace(/[^0-9]/g, "");
  if (!d) return "";
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return `+${d}`;
}

/** "5204817579" -> "(520) 481-7579" */
export function telDisplay(phone) {
  const d = String(phone || "").replace(/[^0-9]/g, "");
  const n = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (n.length !== 10) return String(phone || "");
  return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
}

/** Join a list the way a person would: "a, b and c". */
export function prose(list, conj = "and") {
  const a = (list || []).filter(Boolean).map(String);
  if (a.length === 0) return "";
  if (a.length === 1) return a[0];
  if (a.length === 2) return `${a[0]} ${conj} ${a[1]}`;
  return `${a.slice(0, -1).join(", ")} ${conj} ${a[a.length - 1]}`;
}

/** Clamp text to a length without cutting a word in half. */
export function clamp(s, max) {
  const t = String(s || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, "");
}

/** Lighten (pct > 0) or darken (pct < 0) a #rrggbb hex. */
export function shade(hex, pct) {
  const h = String(hex || "#000000").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const target = pct > 0 ? 255 : 0;
    return Math.round(v + (target - v) * Math.abs(pct));
  });
  return "#" + ch.map(v => v.toString(16).padStart(2, "0")).join("");
}

/**
 * Relative luminance per WCAG, used to decide whether text on a brand colour
 * should be white or near-black. Generated sites get a lot of trade colours,
 * and a few of them (yellow accents especially) fail badly with white text.
 */
export function luminance(hex) {
  const h = String(hex || "#000000").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16);
  const srgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Pick whichever of white / near-black reads better on `bg`. */
export function onColor(bg, dark = "#13242D", light = "#FFFFFF") {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark;
}

/** Collapse blank-line runs so generated HTML stays readable. */
export function tidy(html) {
  return String(html).replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "");
}

/**
 * Build a "<subject> | <brand>" title that survives a search result. Drops the
 * brand suffix before it truncates the subject, because the subject is what
 * someone searched for.
 */
export function fitTitle(subject, brand, max = 60) {
  const full = `${subject} | ${brand}`;
  if (full.length <= max) return full;
  if (subject.length <= max) return subject;
  return clamp(subject, max);
}
