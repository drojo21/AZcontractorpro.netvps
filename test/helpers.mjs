/**
 * Test harness. Import FIRST in a test file: it sets the environment before
 * any src/ module reads it (node --test runs each file in its own process).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import zlib from "node:zlib";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acp-test-"));

// A four-licence stand-in for the 58k-row ROC list.
const roc = {
  fields: ["roc_number", "business_name", "dba", "license_class", "license_class_description", "class_type", "address", "city", "state", "zip", "qualifying_party", "expiration_date", "roc_status"],
  snapshot_date: "2026-09-08",
  rows: [
    ["337881", "Luis Rojo Masonry LLC", "", "CR-31", "Masonry", "Specialty Dual", "130 W VIRGINIA ST", "TUCSON", "AZ", "85706", "Luis Rojo", "2028-05-31", "Active"],
    ["363035", "D.E.A.L.S ENTERPRISES LLC", "", "CR-77", "Plumbing Including Solar", "Specialty Dual", "1 Main", "TUCSON", "AZ", "85713", "Eduardo Aguilar", "2028-01-31", "Active"],
    ["355392", "Creative Construction Management LLC", "", "KB-2", "Dual Residential and Small Commercial", "General Dual", "2 Main", "TUCSON", "AZ", "85746", "QP Exempt", "2027-12-31", "Active"],
    ["300100", "Desert Bloom Landscaping LLC", "", "CR-21", "Landscaping and Irrigation Systems", "Specialty Dual", "3 Main", "MARANA", "AZ", "85653", "Ana Ruiz", "2028-03-31", "Active"],
  ],
};
fs.writeFileSync(path.join(dir, "roc.json.gz"), zlib.gzipSync(JSON.stringify(roc)));

Object.assign(process.env, {
  ACP_NO_DOTENV: "1",
  ACP_QUIET: "1",
  DATA_DIR: path.join(dir, "data"),
  ROC_INDEX: path.join(dir, "roc.json.gz"),
  APP_URL: "http://app.test",
  SALES_HOSTS: "sales.test",
  SITES_DOMAIN: "sites.test",
  ADMIN_EMAIL: "admin@example.com",
  ADMIN_PASSWORD: "correct-horse-battery",
  SESSION_SECRET: "test-secret",
  MAIL_TRANSPORT: "log",
  TRUST_PROXY: "false",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  ANTHROPIC_API_KEY: "",
});

export const TMP = dir;

let server;
let port;

export async function startServer() {
  const { start } = await import("../server.mjs");
  const { config } = await import("../src/config.mjs");
  config.port = 0;
  server = start();
  await new Promise((r) => server.once("listening", r));
  port = server.address().port;
  return server;
}

export function stopServer() {
  return new Promise((r) => server.close(() => r()));
}

/** Raw HTTP with a chosen Host header (fetch will not let us set one). */
export function req(method, urlPath, { host = "app.test", headers = {}, body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null
      : Buffer.isBuffer(body) ? body
        : typeof body === "string" ? Buffer.from(body) : Buffer.from(JSON.stringify(body));
    const r = http.request({
      host: "127.0.0.1", port, method, path: urlPath,
      headers: {
        Host: host,
        ...(payload ? { "Content-Length": payload.length } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json, buf });
      });
    });
    r.on("error", reject);
    if (payload) r.write(payload);
    r.end();
  });
}

/** Signed-in admin: returns a request function that sends the cookie and CSRF header. */
export async function admin() {
  const r = await req("POST", "/api/admin/login", { body: { email: "admin@example.com", password: "correct-horse-battery" } });
  if (r.status !== 200) throw new Error(`login failed: ${r.text}`);
  const cookie = String(r.headers["set-cookie"][0]).split(";")[0];
  return (method, p, opts = {}) => req(method, p, {
    ...opts, cookie, headers: { "x-acp-csrf": "1", "Content-Type": "application/json", ...(opts.headers || {}) },
  });
}

/** Contractor + site from the fixture licence, published and active. */
export async function liveSite(api, { roc: rocNo = "337881", status = "active" } = {}) {
  const c = await api("POST", "/api/admin/contractors", { body: { roc: rocNo, phone: "520-481-7579", email: "owner@example.com" } });
  const id = c.json.contractor.id;
  const s = await api("POST", "/api/admin/sites", { body: { contractor_id: id, tier: "pro" } });
  const site = s.json.site;
  await api("PATCH", `/api/admin/sites/${site.id}`, {
    body: { status, spec: { ...site.spec, serviceArea: { cities: ["Tucson", "Marana", "Oro Valley"] } } },
  });
  const p = await api("POST", `/api/admin/sites/${site.id}/publish`, { body: {} });
  if (p.status !== 200) throw new Error(`publish failed: ${p.text}`);
  return { contractorId: id, site: p.json.site };
}
