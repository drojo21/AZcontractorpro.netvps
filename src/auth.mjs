/**
 * auth.mjs — three kinds of caller.
 *
 *   admin     you and your team: email + password, a session cookie, and a
 *             custom header on every write (a cross-site form cannot send one,
 *             so that is the CSRF defence). Scripts can use API_KEY instead.
 *   portal    a contractor: a one-time link, emailed to the address on their
 *             contractor record, buys a signed, expiring token sent as
 *             x-portal-token. No cookie, so nothing to forge cross-site.
 *   public    everyone else: lead forms, review forms, the demo form, Stripe.
 */
import crypto from "node:crypto";
import { config } from "./config.mjs";
import { db, nowIso, getSetting, setSetting } from "./db.mjs";
import { HttpError, isEmail } from "./http.mjs";
import { sendMail } from "./mail.mjs";
import { getContractor } from "./contractors.mjs";

const SESSION_DAYS = 14;
// Signing in takes a trip to the inbox, so a portal session lasts a month.
const PORTAL_TTL_MS = 30 * 864e5;

/* ------------------------------------------------------------ secrets */

/** SESSION_SECRET, or one generated on first run and kept in the database. */
export function secret() {
  if (config.sessionSecret && config.sessionSecret !== "change-me") return config.sessionSecret;
  let s = getSetting("session_secret");
  if (!s) {
    s = crypto.randomBytes(32).toString("hex");
    setSetting("session_secret", s);
  }
  return s;
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? "")), y = Buffer.from(String(b ?? ""));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------------------------------------------------------- passwords */

export function hashSecret(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(plain), salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifySecret(stored, plain) {
  if (!stored || !plain) return false;
  const [algo, salt, hash] = String(stored).split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const got = crypto.scryptSync(String(plain), salt, 32);
  const want = Buffer.from(hash, "hex");
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/* -------------------------------------------------------------- users */

export function createUser({ email, password, name = "" }) {
  email = String(email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new HttpError(400, "a valid email is required");
  if (String(password || "").length < 10) throw new HttpError(400, "passwords need at least 10 characters");
  if (db().get("SELECT id FROM users WHERE email = ?", [email])) throw new HttpError(409, "that user already exists");
  const { id } = db().run("INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
    [email, name, hashSecret(password)]);
  return publicUser(db().get("SELECT * FROM users WHERE id = ?", [id]));
}

export function setPassword(email, password, { keepSession = "" } = {}) {
  if (String(password || "").length < 10) throw new HttpError(400, "passwords need at least 10 characters");
  const r = db().run("UPDATE users SET password_hash = ? WHERE email = ?", [hashSecret(password), String(email).toLowerCase()]);
  if (!r.changes) throw new HttpError(404, "no such user");
  // Every other session signs out; the one making the change, if any, stays.
  db().run("DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?) AND id <> ?",
    [String(email).toLowerCase(), keepSession ? sha256(keepSession) : ""]);
}

export const publicUser = (u) => (u ? { id: u.id, email: u.email, name: u.name, created_at: u.created_at } : null);

/** Create the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when there are no users. */
export function bootstrapAdmin() {
  const n = db().get("SELECT COUNT(*) AS n FROM users").n;
  if (n > 0 || !config.adminEmail || !config.adminPassword) return null;
  return createUser({ email: config.adminEmail, password: config.adminPassword, name: "Admin" });
}

/* ----------------------------------------------------------- sessions */

export const sessionCookie = () => (config.secure ? "__Host-acp" : "acp_session");

export function login(email, password) {
  const u = db().get("SELECT * FROM users WHERE email = ?", [String(email || "").trim().toLowerCase()]);
  // Hash even on a miss so response time does not reveal which emails exist.
  const ok = verifySecret(u?.password_hash || "scrypt$00$00", password);
  if (!u || !ok) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db().run("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", [sha256(token), u.id, expires]);
  db().run("DELETE FROM sessions WHERE expires_at < ?", [nowIso()]);
  return { token, user: publicUser(u), maxAge: SESSION_DAYS * 86400 };
}

export function logout(token) {
  if (token) db().run("DELETE FROM sessions WHERE id = ?", [sha256(token)]);
}

export function sessionUser(token) {
  if (!token) return null;
  const row = db().get(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                        WHERE s.id = ? AND s.expires_at > ?`, [sha256(token), nowIso()]);
  return publicUser(row);
}

/**
 * Admin gate. Cookie sessions must also send x-acp-csrf on writes; a bearer
 * API key is not ambient (the browser never attaches it), so it does not.
 */
export function requireAdmin(ctx) {
  const auth = String(ctx.header("authorization") || "");
  if (config.apiKey && auth.startsWith("Bearer ") && safeEqual(auth.slice(7), config.apiKey)) {
    return (ctx.state.user = { id: 0, email: "api-key", name: "API key" });
  }
  const user = sessionUser(ctx.cookies[sessionCookie()]);
  if (!user) throw new HttpError(401, "sign in");
  if (!["GET", "HEAD"].includes(ctx.method) && ctx.header("x-acp-csrf") !== "1") {
    throw new HttpError(403, "missing x-acp-csrf header");
  }
  return (ctx.state.user = user);
}

/* ------------------------------------------------------ signed tokens */

/** HMAC-signed JSON payload with an expiry, for portal sessions and links. */
export function signToken(payload, ttlMs) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  const sig = b64url(crypto.createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(token) {
  if (typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = b64url(crypto.createHmac("sha256", secret()).update(body).digest());
  if (!safeEqual(sig, want)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { return null; }
  if (!p || typeof p.exp !== "number" || Date.now() > p.exp) return null;
  return p;
}

// Changes with the site's portal epoch, so "sign out everywhere" ends every session.
const epochStamp = (epoch) => sha256(`portal:${epoch}`).slice(0, 16);

export function issuePortalToken(site) {
  const token = signToken({ kind: "portal", sid: site.id, ep: epochStamp(site.portal_epoch) }, PORTAL_TTL_MS);
  return { token, expires: new Date(Date.now() + PORTAL_TTL_MS).toISOString() };
}

/** Site id the portal token on this request belongs to, or a 401. */
export function requirePortal(ctx) {
  const p = verifyToken(String(ctx.header("x-portal-token") || ""));
  if (!p || p.kind !== "portal" || !p.sid) throw new HttpError(401, "sign in again");
  const site = db().get("SELECT portal_epoch FROM sites WHERE id = ?", [Number(p.sid)]);
  if (!site || !safeEqual(p.ep, epochStamp(site.portal_epoch))) throw new HttpError(401, "sign in again");
  return p.sid;
}

/* ------------------------------------------------ portal sign-in links */

/** Asked for on the portal, a link is used within minutes; one from you may wait a few days. */
export const LINK_TTL = { request: 30 * 60 * 1000, invite: 3 * 864e5 };

/** A one-time sign-in link to a site's portal. Only a hash of it is stored. */
export function createPortalLink(siteId, { ttlMs = LINK_TTL.request, sentTo = "" } = {}) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + ttlMs).toISOString();
  db().run("INSERT INTO portal_links (token_hash, site_id, sent_to, expires_at) VALUES (?, ?, ?, ?)",
    [sha256(token), Number(siteId), sentTo, expires]);
  // In the fragment the token reaches no server log or Referer, and a mail
  // scanner that fetches the page cannot spend it: the page asks for a tap.
  return { url: `${config.appUrl}/portal/#link=${token}`, expires };
}

/** Spend a link, returning the site it was for. Each works once, until it expires. */
export function redeemPortalLink(token) {
  const hash = sha256(String(token || ""));
  const now = nowIso();
  const r = db().run("UPDATE portal_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?", [now, hash, now]);
  if (!r.changes) throw new HttpError(410, "that sign-in link has expired or was already used — ask for a new one");
  return db().get("SELECT site_id FROM portal_links WHERE token_hash = ?", [hash]).site_id;
}

/** End every portal session for a site, and every link not used yet. */
export function signOutPortal(siteId) {
  db().tx(() => {
    db().run("UPDATE sites SET portal_epoch = ? WHERE id = ?", [crypto.randomBytes(12).toString("hex"), Number(siteId)]);
    db().run("DELETE FROM portal_links WHERE site_id = ? AND used_at IS NULL", [Number(siteId)]);
  });
}

const forHow = (ms) => (ms >= 864e5 ? `${Math.round(ms / 864e5)} days` : `${Math.round(ms / 60000)} minutes`);

/**
 * Email a sign-in link to the address on the contractor record: never to one
 * typed into a form, and not to the lead email, which a portal user can change.
 * Returns { to, sending } with the send's promise, or null when there is no address.
 */
export function emailPortalLink(site, { ttlMs = LINK_TTL.request } = {}) {
  const c = getContractor(site.contractor_id);
  if (!isEmail(c?.email)) return null;
  const { url } = createPortalLink(site.id, { ttlMs, sentTo: c.email });
  const business = site.spec?.business?.name || c.business_name || site.slug;
  const sending = sendMail({
    to: c.email,
    subject: `Sign in to your ${config.brand.name} portal`,
    text: [
      `Tap to sign in to the portal for ${business}: your leads, job photos, reviews and site details.`,
      "",
      url,
      "",
      `The link works once, for ${forHow(ttlMs)}. If you did not ask for it, ignore this email.`,
      "",
      `— ${config.brand.name}${config.brand.phone ? ` · ${config.brand.phone}` : ""}`,
    ].join("\n"),
  });
  return { to: c.email, sending };
}
