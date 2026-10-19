/**
 * roc.mjs — the Arizona ROC active-licence list, for lookups and the licence gate.
 *
 * data/roc-index.json.gz is the registrar's posting list of every ACTIVE
 * licence (built by AzcontractorproVPs/scripts/build_roc_index.py). Absence
 * from it means "not active", which is why the free-demo form refuses to build
 * a site for a number that is not on it: every generated page says "Licensed"
 * and links to the ROC verify page.
 *
 * Name matching is ported from core/roc-active.js and keeps its rule: when one
 * name maps to different businesses, return nothing rather than attach another
 * contractor's licence to someone.
 */
import fs from "node:fs";
import zlib from "node:zlib";
import { config } from "./config.mjs";
import { inferTrade } from "../engine/trades.mjs";

const SUFFIX = /\b(llc|l l c|inc|incorporated|co|company|corp|corporation|ltd|limited|lp|llp|pllc|dba)\b/g;

export const digits = (v) => String(v ?? "").replace(/[^0-9]/g, "");
export const normBusiness = (name) => String(name ?? "").toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ").replace(SUFFIX, " ").replace(/\s+/g, " ").trim();

let _index = null;

function indexFrom(payload) {
  const F = payload.fields;
  const records = new Map();
  const byName = new Map();
  for (const row of payload.rows) {
    const rec = {};
    for (let i = 0; i < F.length; i++) rec[F[i]] = row[i];
    records.set(rec.roc_number, rec);
    for (const n of new Set([normBusiness(rec.business_name), normBusiness(rec.dba)])) {
      if (!n) continue;
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push(rec.roc_number);
    }
  }
  return { available: true, snapshotDate: payload.snapshot_date || "", records, byName };
}

export function rocIndex() {
  if (_index) return _index;
  if (!fs.existsSync(config.rocIndexPath)) {
    return (_index = { available: false, snapshotDate: "", records: new Map(), byName: new Map() });
  }
  return (_index = indexFrom(JSON.parse(zlib.gunzipSync(fs.readFileSync(config.rocIndexPath)).toString("utf8"))));
}

/** Tests load a small fixture instead of the 2.5 MB file; null reloads the real one. */
export function useRocIndex(payload) {
  _index = payload ? indexFrom(payload) : null;
}

export function getLicense(roc) {
  const d = digits(roc);
  if (!d) return null;
  const { records } = rocIndex();
  return records.get(d) || records.get(d.padStart(6, "0")) || null;
}

export const isActive = (roc) => Boolean(getLicense(roc));

export function findByName(name, { city = "" } = {}) {
  const { byName, records } = rocIndex();
  const ids = byName.get(normBusiness(name)) || [];
  if (!ids.length) return null;
  const hits = ids.map((id) => records.get(id));
  let groups = new Map();
  for (const rec of hits) {
    const k = `${String(rec.address || "").trim().toLowerCase()}|${rec.zip}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(rec);
  }
  if (groups.size > 1 && city) {
    const want = city.trim().toLowerCase();
    const narrowed = new Map([...groups].filter(([, v]) => v.some((r) => String(r.city).toLowerCase() === want)));
    if (narrowed.size === 1) groups = narrowed;
  }
  if (groups.size !== 1) return null;
  // One business, several licences: prefer a specialty class, then the latest expiry.
  const same = [...groups.values()][0];
  const rank = (r) => `${String(r.class_type || "").toLowerCase().startsWith("specialty") ? 1 : 0}${r.expiration_date}`;
  return same.reduce((a, b) => (rank(b) > rank(a) ? b : a));
}

/** Typeahead for the admin: exact number first, then name contains. */
export function searchLicenses(q, limit = 12) {
  const { records, available } = rocIndex();
  if (!available || !q) return [];
  const d = digits(q);
  const out = [];
  if (d.length >= 4) {
    const exact = getLicense(d);
    if (exact) out.push(exact);
  }
  const needle = normBusiness(q);
  if (needle.length >= 3) {
    for (const rec of records.values()) {
      if (out.length >= limit) break;
      if (out[0] === rec) continue;
      if (normBusiness(rec.business_name).includes(needle) || normBusiness(rec.dba).includes(needle)) out.push(rec);
    }
  }
  return out.slice(0, limit);
}

const KEEP_UPPER = new Set(["LLC", "INC", "LLP", "PLLC", "LP", "AZ", "HVAC", "CO", "II", "III", "DBA"]);

/** "D.E.A.L.S ENTERPRISES LLC" → "D.E.A.L.S Enterprises LLC". Leaves mixed case alone. */
export function tidyName(s) {
  const t = String(s || "").trim();
  if (!t || t !== t.toUpperCase()) return t;
  return t.split(/\s+/).map((w) => {
    if (KEEP_UPPER.has(w.replace(/[^A-Z]/g, "")) || /\./.test(w)) return w;
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join(" ");
}

const titleCity = (c) => String(c || "").toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());

/** A licence record as a starting ClientSpec. Phone and email come from a person. */
export function specFromLicense(rec, extra = {}) {
  const name = tidyName(rec.dba || rec.business_name);
  const city = titleCity(extra.city || rec.city || "Phoenix");
  const owner = /exempt/i.test(rec.qualifying_party || "") ? "" : tidyName(rec.qualifying_party || "");
  return {
    business: {
      name,
      owner: extra.owner || owner,
      trade: extra.trade || inferTrade(rec.license_class, rec.license_class_description),
    },
    license: {
      rocNumber: rec.roc_number,
      class: rec.license_class,
      classDescription: rec.license_class_description,
      status: rec.roc_status || "Active",
    },
    contact: {
      phone: extra.phone || "",
      email: extra.email || "",
      address: { street: "", city, state: "AZ", zip: String(rec.zip || "").slice(0, 5) },
    },
    serviceArea: { cities: [city] },
  };
}
