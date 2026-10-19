/**
 * ROC roster: a CSV of licences in, a list of ClientSpecs out.
 *
 * The parser is the RFC4180-ish one from builder.html, kept because it handles
 * the quoting the ROC export actually uses. The header mapping is widened so
 * it survives the column renames between exports, and every row goes through
 * normalize() so a roster row and a hand-written spec are the same shape.
 */

import { normalize } from "./spec.mjs";
import { inferTrade } from "./trades.mjs";

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  const t = String(text).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ""));
}

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const COLS = {
  biz:    ["businessname", "dbaname", "name", "companyname", "licensee", "legalname", "entityname"],
  roc:    ["licensenumber", "license", "rocnumber", "roc", "licno", "licensenum"],
  cls:    ["licenseclass", "class", "classification", "classcode", "lictype"],
  desc:   ["classificationdescription", "classdescription", "description", "licensedescription", "scope"],
  phone:  ["phone", "phonenumber", "businessphone", "telephone", "primaryphone"],
  city:   ["city", "businesscity", "mailingcity", "cityname"],
  zip:    ["zip", "zipcode", "postalcode", "businesszip", "mailingzip"],
  state:  ["state", "businessstate", "mailingstate"],
  street: ["address", "address1", "businessaddress", "streetaddress", "mailingaddress"],
  owner:  ["qualifyingparty", "qp", "owner", "ownername", "principal", "qualifyingpartyname"],
  email:  ["email", "emailaddress", "businessemail"],
  web:    ["website", "websiteurl", "url", "webaddress", "web"],
  issued: ["issuedate", "dateissued", "issued", "licenseissuedate", "effectivedate"],
  status: ["status", "licensestatus"]
};

export function mapHeaders(header) {
  const h = header.map(norm);
  const map = {};
  for (const key of Object.keys(COLS)) {
    let idx = h.findIndex(x => COLS[key].includes(x));
    // Fall back to a containment match for columns like
    // "Business Phone Number (primary)".
    if (idx === -1) idx = h.findIndex(x => x && COLS[key].some(c => c.length > 4 && x.includes(c)));
    if (idx !== -1) map[key] = idx;
  }
  return map;
}

/** True when the row already lists a website, i.e. not a prospect. */
export function hasWebsite(row) {
  return /[a-z0-9-]+\.[a-z]{2,}/i.test(String(row.web || ""));
}

/**
 * Parse a roster into rows. Rows carry both the raw fields and a normalized
 * spec, so a UI can show the licence data and build from the same object.
 */
export function loadRoster(text, { defaultCity = "Phoenix" } = {}) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("That file has no data rows.");

  const map = mapHeaders(rows[0]);
  if (map.biz === undefined) {
    throw new Error(
      `Could not find a business-name column. Headers seen: ${rows[0].slice(0, 8).join(", ")}`
    );
  }

  const get = (r, k) => (map[k] === undefined ? "" : String(r[map[k]] ?? "").trim());

  return rows.slice(1).map((r, i) => {
    const raw = {
      biz: get(r, "biz"),
      roc: get(r, "roc").replace(/[^0-9]/g, ""),
      cls: get(r, "cls"),
      desc: get(r, "desc"),
      phone: get(r, "phone"),
      city: get(r, "city") || defaultCity,
      zip: get(r, "zip").slice(0, 5),
      street: get(r, "street"),
      owner: get(r, "owner"),
      email: get(r, "email"),
      web: get(r, "web"),
      issued: get(r, "issued"),
      status: get(r, "status") || "Active"
    };
    const trade = inferTrade(raw.cls, raw.desc);
    const { spec, issues } = normalize({
      ...raw,
      trade,
      "license.classDescription": raw.desc,
      serviceArea: { cities: [raw.city || defaultCity] },
      "contact.address.street": raw.street
    });
    return { index: i, raw, trade, hasWebsite: hasWebsite(raw), spec, issues };
  }).filter(x => x.raw.biz);
}
