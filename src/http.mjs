/**
 * http.mjs — the plumbing between node:http and the route handlers.
 *
 * Handlers take a ctx and write through it (ctx.json, ctx.html, ctx.file …).
 * Bodies are parsed leniently: contractor sites post JSON as text/plain (a
 * "simple" request needs no CORS preflight, which is one less thing between a
 * visitor and a lead), and no-JS forms post urlencoded.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.mjs";

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const fail = (status, message, extra) => { throw new HttpError(status, message, extra); };

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8", ".csv": "text/csv; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".pdf": "application/pdf",
};
export const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

export function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, "payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** JSON whatever the Content-Type says, then urlencoded, else {}. */
export function parseBody(buf) {
  const raw = buf.toString("utf8");
  if (!raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { /* not JSON */ }
  try { return Object.fromEntries(new URLSearchParams(raw)); } catch { return {}; }
}

export function createCtx(req, res) {
  const proto = (config.trustProxy && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim())
    || (req.socket?.encrypted ? "https" : "http");
  const host = String(req.headers.host || config.appHost).toLowerCase();
  const url = new URL(req.url || "/", `${proto}://${host}`);
  const ip = (config.trustProxy && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim())
    || req.socket?.remoteAddress || "";
  let rawPromise = null;
  let bodyCache;
  let cookieCache;

  const ctx = {
    req, res, url, proto, host,
    hostname: url.hostname,
    method: req.method || "GET",
    path: url.pathname,
    query: url.searchParams,
    ip,
    state: {},
    get cookies() { return (cookieCache ??= parseCookies(req.headers.cookie)); },
    header: (name) => req.headers[name.toLowerCase()],

    raw(limit = 2 * 1024 * 1024) {
      if (ctx.method === "GET" || ctx.method === "HEAD") return Promise.resolve(Buffer.alloc(0));
      return (rawPromise ??= readRaw(req, limit));
    },
    async body(limit) {
      if (bodyCache === undefined) bodyCache = parseBody(await ctx.raw(limit));
      return bodyCache;
    },

    setCookie(name, value, { maxAge, httpOnly = true, sameSite = "Lax", path: p = "/" } = {}) {
      const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${p}`, `SameSite=${sameSite}`];
      if (httpOnly) parts.push("HttpOnly");
      if (config.secure) parts.push("Secure");
      if (maxAge !== undefined) parts.push(`Max-Age=${Math.floor(maxAge)}`);
      const prev = res.getHeader("Set-Cookie");
      res.setHeader("Set-Cookie", [...(Array.isArray(prev) ? prev : prev ? [prev] : []), parts.join("; ")]);
    },

    send(status, body, headers = {}) {
      if (res.headersSent) return;
      const buf = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
      res.writeHead(status, { ...BASE_HEADERS, ...(buf ? { "Content-Length": buf.length } : {}), ...headers });
      res.end(ctx.method === "HEAD" ? undefined : buf || undefined);
    },
    json(status, obj, headers = {}) {
      ctx.send(status, JSON.stringify(obj), {
        "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers,
      });
    },
    html(status, body, headers = {}) {
      ctx.send(status, body, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers });
    },
    text(status, body, headers = {}) {
      ctx.send(status, body, { "Content-Type": "text/plain; charset=utf-8", ...headers });
    },
    redirect(location, status = 302) {
      ctx.send(status, null, { Location: location, "Cache-Control": "no-store" });
    },

    /** Stream a file with ETag / 304 support. */
    file(file, { cacheControl = "no-cache", headers = {}, status = 200, stat = null } = {}) {
      const st = stat || fs.statSync(file);
      const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
      const h = {
        ...BASE_HEADERS,
        "Content-Type": typeOf(file),
        "Cache-Control": cacheControl,
        "Last-Modified": st.mtime.toUTCString(),
        ETag: etag,
        ...headers,
      };
      if (status === 200 && req.headers["if-none-match"] === etag) {
        res.writeHead(304, h);
        res.end();
        return;
      }
      h["Content-Length"] = st.size;
      res.writeHead(status, h);
      if (ctx.method === "HEAD") { res.end(); return; }
      fs.createReadStream(file).pipe(res);
    },
  };
  return ctx;
}

/**
 * Resolve urlPath inside root, refusing traversal. Returns
 * { file, stat } | { redirect } | null. Directories serve index.html, and
 * "/about" falls back to "/about.html" so either link style works.
 */
export function resolveStatic(root, urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return null; }
  if (rel.includes("\0")) return null;
  const base = path.resolve(root);
  const file = path.resolve(base, "." + (rel.startsWith("/") ? rel : "/" + rel));
  if (file !== base && !file.startsWith(base + path.sep)) return null;

  const tryFile = (f) => {
    try {
      const st = fs.statSync(f);
      return st.isFile() ? { file: f, stat: st } : st.isDirectory() ? { dir: true } : null;
    } catch { return null; }
  };
  const hit = tryFile(file);
  if (hit?.file) return hit;
  if (hit?.dir) {
    if (!urlPath.endsWith("/")) return { redirect: urlPath + "/" };
    return tryFile(path.join(file, "index.html"));
  }
  if (!path.extname(file)) {
    const alt = tryFile(file + ".html");
    if (alt?.file) return alt;
  }
  return null;
}

/** Serve root + urlPath through ctx. False when nothing matched. */
export function serveStatic(ctx, root, urlPath, opts = {}) {
  const r = resolveStatic(root, urlPath);
  if (!r) return false;
  if (r.redirect) {
    ctx.redirect(r.redirect + (ctx.url.search || ""), 301);
    return true;
  }
  ctx.file(r.file, { stat: r.stat, ...opts });
  return true;
}

export function clean(v, n = 2000) {
  return String(v === undefined || v === null ? "" : v).replace(/\u0000/g, "").trim().slice(0, n);
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(s || "").trim());
