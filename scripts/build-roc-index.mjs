#!/usr/bin/env node
/**
 * build-roc-index.mjs — turn the Registrar's "ROC Posting List" CSV into
 * data/roc-index.json.gz, the active-licence list src/roc.mjs reads.
 *
 *   node scripts/build-roc-index.mjs <ROC_Posting-List.csv> [out.json.gz]
 *
 * The CSV is the "Current Active Contractor Licenses" download from azroc.gov:
 * a title line ("… File created: Oct 20, 2026 - 58444 Records"), a header, then
 * one row per active licence. Only rows whose Status is Active are kept, because
 * absence from the index is what the demo form treats as "not licensed".
 *
 * Checks before it writes anything: the header is the one we expect, the row
 * count matches the title line, and no licence number repeats. A bad download
 * stops here instead of silently shrinking the list.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIELDS = ["roc_number", "business_name", "dba", "license_class", "license_class_description", "class_type", "address", "city", "state", "zip", "qualifying_party", "expiration_date", "roc_status"];
const HEADER = ["#", "License No", "Business Name", "Doing Business As", "Class", "Class Detail", "Class Type", "Address", "City", "State", "Zip", "Qualifying Party", "Issued Date", "Expiration Date", "Status"];

/**
 * This export is one record per line, every field in double quotes, fields
 * separated by `","`. Quotes inside a field are written three ways (\\", "", or
 * not escaped at all: `Way "C"`, `o"Malley`), so quote-state parsing derails and
 * can swallow thousands of rows. Splitting on the `","` boundary does not care.
 * `repairs` lists every field that had a quote inside it, for a human to glance at.
 */
export function parseCsv(text, repairs = []) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (!(line.startsWith('"') && line.endsWith('"') && line.length >= 2)) throw new Error(`line is not fully quoted: ${line.slice(0, 80)}`);
    const row = line.slice(1, -1).split('","').map((f) => {
      const v = f.replace(/\\"/g, '"').replace(/""/g, '"');
      if (v.includes('"') && rows.length > 1) repairs.push(`${rows.length - 1}: quote inside "${v}"`);
      return v;
    });
    rows.push(row);
  }
  return rows;
}

// A quote between two letters is a mistyped apostrophe (o"Malley), never punctuation.
const tidy = (s) => String(s ?? "").replace(/(\p{L})"(\p{L})/gu, "$1'$2").replace(/\s+/g, " ").trim();

/** A name wholly wrapped in quotes ("\"ACME, LLC\"") loses them; quotes inside a name stay. */
const unquote = (s) => s.replace(/^"([^"]*)"$/, "$1");

export function buildIndex(csvText) {
  const repairs = [];
  const rows = parseCsv(csvText.replace(/^﻿/, ""), repairs);
  const title = rows.shift()?.[0] || "";
  const header = rows.shift() || [];
  if (HEADER.some((h, i) => header[i] !== h)) throw new Error(`unexpected header: ${header.join(" | ")}`);
  const created = /File created:\s*([A-Za-z]+ \d{1,2}, \d{4})/.exec(title)?.[1];
  const stated = Number(/(\d[\d,]*)\s+Records/.exec(title)?.[1]?.replace(/,/g, ""));
  const snapshot = created ? new Date(`${created} 12:00:00 UTC`).toISOString().slice(0, 10) : "";
  if (!snapshot) throw new Error(`cannot read the file date from the title line: ${title}`);

  const seen = new Set();
  const out = [];
  let expected = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.length !== HEADER.length) throw new Error(`row ${r[0]} has ${r.length} columns, not ${HEADER.length}`);
    if (Number(r[0]) !== ++expected) throw new Error(`row numbers jump from ${expected - 1} to ${r[0]}: a quote probably swallowed rows`);
    const status = tidy(r[14]);
    if (!/^active$/i.test(status)) { skipped++; continue; }
    const roc = tidy(r[1]);
    if (!/^\d+$/.test(roc)) throw new Error(`odd licence number "${roc}" on row ${r[0]}`);
    if (seen.has(roc)) throw new Error(`licence ${roc} appears twice`);
    seen.add(roc);
    const cls = tidy(r[4]);
    // "CR-3 Awnings Canopies …" → "Awnings Canopies …", the way the old index stored it.
    const detail = tidy(r[5]);
    const desc = detail.startsWith(`${cls} `) ? detail.slice(cls.length + 1) : detail;
    out.push([roc, unquote(tidy(r[2])), unquote(tidy(r[3])), cls, desc, tidy(r[6]), tidy(r[7]), tidy(r[8]), tidy(r[9]), tidy(r[10]), tidy(r[11]), tidy(r[13]), "Active"]);
  }
  if (stated && rows.length !== stated) throw new Error(`the title says ${stated} records but the file has ${rows.length} rows`);
  return { fields: FIELDS, snapshot_date: snapshot, count: out.length, rows: out, skipped, repairs };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [src, dest = path.join(ROOT, "data", "roc-index.json.gz")] = process.argv.slice(2);
  if (!src) { console.error("usage: node scripts/build-roc-index.mjs <ROC_Posting-List.csv> [out.json.gz]"); process.exit(2); }
  const { skipped, repairs, ...index } = buildIndex(fs.readFileSync(src, "utf8"));
  for (const r of repairs) console.log(`  repaired ${r}`);
  fs.writeFileSync(dest, zlib.gzipSync(JSON.stringify(index), { level: 9 }));
  console.log(`${index.count} active licences, snapshot ${index.snapshot_date}${skipped ? ` (${skipped} not active, left out)` : ""} → ${dest}`);
}
