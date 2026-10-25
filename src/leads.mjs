/**
 * leads.mjs — quote requests from contractor sites.
 *
 * Same contract as the Apps Script router and the AzcontractorproVPs server:
 * honeypot, name plus phone-or-email, a 10-minute duplicate window (a
 * double-click is one lead), a per-IP limit, then the email. The lead is in
 * the database before the email is tried, so a mail outage loses nothing.
 */
import crypto from "node:crypto";
import { config } from "./config.mjs";
import { db, nowIso, overLimit, parseJson } from "./db.mjs";
import { HttpError, clean, isEmail } from "./http.mjs";
import { notify } from "./mail.mjs";
import { getContractor, addActivity } from "./contractors.mjs";

export const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost", "spam"];
const FIELDS = ["name", "phone", "email", "city", "service", "timeline", "message", "page"];
const IGNORED = new Set([...FIELDS, "business", "submitted", "company_url", "company_website", "action", "client_id", "user_agent", "source"]);
const DEDUPE_MS = 10 * 60 * 1000;

export async function recordLead(site, data, { ip = "" } = {}) {
  // Honeypot: answer ok so the bot does not retry with a new shape.
  if (clean(data.company_url || data.company_website)) return { ok: true, id: "ignored" };
  if (["suspended", "expired"].includes(site.status)) throw new HttpError(403, "this business is not taking online requests right now");
  if (ip && overLimit(`lead:${ip}`, 20, DEDUPE_MS)) throw new HttpError(429, "too many requests");

  const rec = Object.fromEntries(FIELDS.map((f) => [f, clean(data[f], f === "message" ? 4000 : 300)]));
  if (!rec.name) throw new HttpError(400, "Please add your name.");
  if (rec.phone.replace(/[^0-9]/g, "").length < 7 && !rec.email) throw new HttpError(400, "Please add a phone number or an email.");

  const extra = {};
  for (const [k, v] of Object.entries(data)) {
    if (!IGNORED.has(k) && typeof v !== "object" && Object.keys(extra).length < 20) extra[clean(k, 40)] = clean(v, 500);
  }
  const key = crypto.createHash("sha256").update([site.id, rec.name, rec.phone, rec.email, rec.message].join("|")).digest("hex").slice(0, 24);
  const cutoff = new Date(Date.now() - DEDUPE_MS).toISOString();
  if (db().get("SELECT id FROM leads WHERE site_id = ? AND dedupe_key = ? AND created_at >= ?", [site.id, key, cutoff])) {
    return { ok: true, id: "duplicate" };
  }
  const { id } = db().run(
    `INSERT INTO leads (site_id, ${FIELDS.join(", ")}, extra, dedupe_key, created_at) VALUES (?, ${FIELDS.map(() => "?").join(", ")}, ?, ?, ?)`,
    [site.id, ...FIELDS.map((f) => rec[f]), JSON.stringify(extra), key, nowIso()],
  );
  addActivity(site.contractor_id, "lead", `Lead from ${rec.name}${rec.service ? ` — ${rec.service}` : ""}`, "website");

  const c = getContractor(site.contractor_id);
  const to = site.notify_email || c?.email || config.adminEmail;
  const lines = [
    `Name:     ${rec.name}`,
    `Phone:    ${rec.phone || "—"}`,
    `Email:    ${rec.email || "—"}`,
    `City:     ${rec.city || "—"}`,
    `Service:  ${rec.service || "—"}`,
    `Timeline: ${rec.timeline || "—"}`,
    ...Object.entries(extra).map(([k, v]) => `${k}: ${v}`),
    "",
    rec.message || "(no details)",
    "",
    `Sent from ${rec.page || "your website"}.`,
    `See every lead: ${config.appUrl}/portal/`,
  ];
  notify({
    to,
    subject: `New estimate request — ${rec.name}${rec.service ? ` (${rec.service})` : ""}`,
    text: lines.join("\n"),
    // A single valid address only: "a@x.com, b@y.com" would add a stranger to the reply.
    replyTo: isEmail(rec.email) ? rec.email : undefined,
  }, "lead");
  return { ok: true, id };
}

export function listLeads({ siteId = null, contractorId = null, status = "", limit = 300 } = {}) {
  const where = [];
  const params = [];
  if (siteId) { where.push("l.site_id = ?"); params.push(Number(siteId)); }
  if (contractorId) { where.push("s.contractor_id = ?"); params.push(Number(contractorId)); }
  if (status) { where.push("l.status = ?"); params.push(status); }
  return db().all(`
    SELECT l.*, s.slug, c.business_name, c.id AS contractor_id
    FROM leads l LEFT JOIN sites s ON s.id = l.site_id LEFT JOIN contractors c ON c.id = s.contractor_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY l.id DESC LIMIT ?`, [...params, Math.min(Number(limit) || 300, 5000)])
    .map((l) => ({ ...l, extra: parseJson(l.extra, {}), dedupe_key: undefined }));
}

export function updateLead(id, { status, notes }, { siteId = null } = {}) {
  const lead = db().get("SELECT * FROM leads WHERE id = ?", [Number(id)]);
  if (!lead || (siteId && lead.site_id !== Number(siteId))) throw new HttpError(404, "no such lead");
  if (status !== undefined && !LEAD_STATUSES.includes(status)) throw new HttpError(400, `status must be one of ${LEAD_STATUSES.join(", ")}`);
  db().run("UPDATE leads SET status = ?, notes = ? WHERE id = ?",
    [status ?? lead.status, notes !== undefined ? clean(notes, 4000) : lead.notes, lead.id]);
  return db().get("SELECT * FROM leads WHERE id = ?", [lead.id]);
}

const CSV_COLS = ["created_at", "name", "phone", "email", "city", "service", "timeline", "message", "page", "status", "notes"];

/** Spreadsheet-safe CSV: a cell starting with = + - @ is prefixed so Excel will not run it. */
export function leadsCsv(leads) {
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = leads.map((l) => CSV_COLS.map((c) => cell(l[c])).join(","));
  return "﻿" + [CSV_COLS.join(","), ...rows].join("\r\n") + "\r\n";
}
