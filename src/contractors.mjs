/**
 * contractors.mjs — the CRM side: who the contractor is and where they are in
 * the pipeline. Ported from CRM-Az-Contractor, minus the integration layer that
 * existed only because the CRM and the builder were separate servers.
 *
 *   prospect → demo → contacted → paid → live      (and lost, from anywhere)
 *
 * Events move a contractor forward on their own: publishing a demo makes a
 * prospect a "demo", a payment makes them "paid", publishing a paid site makes
 * them "live". Automatic moves never go backwards; a person can set any stage.
 */
import { db, nowIso } from "./db.mjs";
import { HttpError, clean } from "./http.mjs";
import { tradeKey } from "../engine/trades.mjs";

export const STAGES = [
  { id: "prospect", label: "Prospect" },
  { id: "demo", label: "Demo site" },
  { id: "contacted", label: "Contacted" },
  { id: "paid", label: "Paid" },
  { id: "live", label: "Live" },
  { id: "lost", label: "Lost" },
];
const STAGE_IDS = STAGES.map((s) => s.id);
const RANK = { prospect: 0, demo: 1, contacted: 2, paid: 3, live: 4 };

const FIELDS = ["business_name", "owner_name", "email", "phone", "trade", "roc_number",
  "license_class", "city", "stage", "source", "next_follow_up"];

function normalize(input) {
  const out = {};
  for (const f of FIELDS) {
    if (input[f] === undefined) continue;
    let v = input[f];
    if (f === "roc_number") v = String(v ?? "").replace(/[^0-9]/g, "");
    else if (f === "trade") v = tradeKey(v);
    else if (f === "email") v = clean(v, 200).toLowerCase();
    else if (f === "stage") {
      v = String(v || "").toLowerCase();
      if (!STAGE_IDS.includes(v)) throw new HttpError(400, `stage must be one of ${STAGE_IDS.join(", ")}`);
    } else if (f === "next_follow_up") v = v ? clean(v, 10) : null;
    else v = clean(v, 300);
    out[f] = v;
  }
  return out;
}

export function getContractor(id) {
  return db().get("SELECT * FROM contractors WHERE id = ?", [Number(id)]);
}

export function findByRoc(roc) {
  const r = String(roc || "").replace(/[^0-9]/g, "");
  return r ? db().get("SELECT * FROM contractors WHERE roc_number = ?", [r]) : null;
}

export function createContractor(input, author = "") {
  const c = normalize(input);
  if (!c.business_name) throw new HttpError(400, "business_name is required");
  if (c.roc_number && findByRoc(c.roc_number)) {
    throw new HttpError(409, `a contractor with ROC #${c.roc_number} already exists`, { id: findByRoc(c.roc_number).id });
  }
  const cols = Object.keys(c);
  const { id } = db().run(
    `INSERT INTO contractors (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
    cols.map((k) => c[k]),
  );
  addActivity(id, "system", `Added (${c.source || "manual"})`, author);
  return getContractor(id);
}

export function updateContractor(id, input, author = "") {
  const before = getContractor(id);
  if (!before) throw new HttpError(404, "no such contractor");
  const c = normalize(input);
  if (c.roc_number && c.roc_number !== before.roc_number) {
    const other = findByRoc(c.roc_number);
    if (other && other.id !== before.id) throw new HttpError(409, `ROC #${c.roc_number} belongs to another contractor`);
  }
  const cols = Object.keys(c);
  if (!cols.length) return before;
  db().run(`UPDATE contractors SET ${cols.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
    [...cols.map((k) => c[k]), nowIso(), before.id]);
  if (c.stage && c.stage !== before.stage) addActivity(before.id, "stage", `Stage: ${before.stage} → ${c.stage}`, author);
  return getContractor(before.id);
}

/** Move forward only. Used by publish, payment and demo events. */
export function advanceStage(id, stage, why = "") {
  const c = getContractor(id);
  if (!c || c.stage === "lost") return c;
  if ((RANK[stage] ?? -1) <= (RANK[c.stage] ?? -1)) return c;
  db().run("UPDATE contractors SET stage = ?, updated_at = ? WHERE id = ?", [stage, nowIso(), c.id]);
  addActivity(c.id, "stage", `Stage: ${c.stage} → ${stage}${why ? ` (${why})` : ""}`, "system");
  return getContractor(c.id);
}

export function addActivity(contractorId, kind, body, author = "") {
  db().run("INSERT INTO activity (contractor_id, kind, body, author) VALUES (?, ?, ?, ?)",
    [Number(contractorId), kind, clean(body, 4000), author]);
}

export function activityFor(contractorId, limit = 100) {
  return db().all("SELECT * FROM activity WHERE contractor_id = ? ORDER BY id DESC LIMIT ?", [Number(contractorId), limit]);
}

export function listContractors({ q = "", stage = "", limit = 500 } = {}) {
  const where = [];
  const params = [];
  if (stage) { where.push("c.stage = ?"); params.push(stage); }
  if (q) {
    where.push("(c.business_name LIKE ? OR c.owner_name LIKE ? OR c.email LIKE ? OR c.roc_number LIKE ? OR c.city LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  return db().all(`
    SELECT c.*,
      (SELECT COUNT(*) FROM sites s WHERE s.contractor_id = c.id) AS site_count,
      (SELECT COUNT(*) FROM leads l JOIN sites s ON s.id = l.site_id WHERE s.contractor_id = c.id) AS lead_count,
      (SELECT s.slug FROM sites s WHERE s.contractor_id = c.id ORDER BY s.id LIMIT 1) AS first_site
    FROM contractors c
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY c.updated_at DESC LIMIT ?`, [...params, limit]);
}

export function deleteContractor(id) {
  return db().run("DELETE FROM contractors WHERE id = ?", [Number(id)]).changes > 0;
}
