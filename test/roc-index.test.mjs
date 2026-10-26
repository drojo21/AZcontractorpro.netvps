import "./helpers.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex } from "../scripts/build-roc-index.mjs";

const HEAD = '"#","License No","Business Name","Doing Business As","Class","Class Detail","Class Type","Address","City","State","Zip","Qualifying Party","Issued Date","Expiration Date","Status"';
const rec = (n, o = {}) => {
  const f = { roc: String(100000 + n).padStart(6, "0"), name: `Contractor ${n}`, dba: "", cls: "CR-31", detail: "CR-31 Masonry", type: "Specialty Dual", addr: "1 Main St", city: "Tucson", st: "AZ", zip: "85701", qp: "QP Exempt", issued: "2020-01-01", exp: "2028-01-31", status: "Active", ...o };
  return [n, f.roc, f.name, f.dba, f.cls, f.detail, f.type, f.addr, f.city, f.st, f.zip, f.qp, f.issued, f.exp, f.status].map((v) => `"${v}"`).join(",");
};
const file = (rows, title) => [title ?? `"Current Active Contractor Licenses - File created: Oct 20, 2026 - ${rows.length} Records"`, HEAD, ...rows].join("\r\n");

test("the ROC list: columns map to the index, the class prefix comes off, leading zeros stay", () => {
  const idx = buildIndex(file([rec(1, { roc: "002386", cls: "CR-3", detail: "CR-3 Awnings Canopies Carports and Patio Covers" })]));
  assert.equal(idx.snapshot_date, "2026-10-20");
  assert.equal(idx.count, 1);
  assert.deepEqual(idx.rows[0], ["002386", "Contractor 1", "", "CR-3", "Awnings Canopies Carports and Patio Covers", "Specialty Dual", "1 Main St", "Tucson", "AZ", "85701", "QP Exempt", "2028-01-31", "Active"]);
});

test("the ROC list: the export's three ways of writing a quote do not swallow neighbouring rows", () => {
  const idx = buildIndex(file([
    rec(1, { addr: 'Way "C"' }),
    rec(2, { qp: 'Alexander Richard o"Malley' }),
    rec(3, { name: '\\"CANIGLIA DEVELOPMENT, LLC\\"' }),
    rec(4, { name: '"I Am" Handyman L.L.C.' }),
    rec(5, { name: "Plain" }),
  ]));
  assert.equal(idx.count, 5);
  assert.equal(idx.rows[0][6], 'Way "C"');
  assert.equal(idx.rows[1][10], "Alexander Richard o'Malley", "a quote between letters is an apostrophe");
  assert.equal(idx.rows[2][1], "CANIGLIA DEVELOPMENT, LLC", "a name wrapped in quotes loses them, comma and all");
  assert.equal(idx.rows[3][1], '"I Am" Handyman L.L.C.');
  assert.equal(idx.repairs.length, 4, "each field with a quote is reported");
});

test("the ROC list: anything not Active is left out, and a bad download is refused", () => {
  const idx = buildIndex(file([rec(1), rec(2, { status: "Suspended" }), rec(3)]));
  assert.deepEqual([idx.count, idx.skipped], [2, 1]);
  assert.throws(() => buildIndex(file([rec(1), rec(2)], '"Current Active Contractor Licenses - File created: Oct 20, 2026 - 99 Records"')), /title says 99/);
  assert.throws(() => buildIndex(file([rec(1), rec(3)])), /row numbers jump/);
  assert.throws(() => buildIndex(file([rec(1), rec(2, { roc: "100001" })])), /appears twice/);
  assert.throws(() => buildIndex(file([rec(1)]).replace('"Status"', '"State"')), /unexpected header/);
  assert.throws(() => buildIndex(file([rec(1)], '"No date here"')), /file date/);
});
