#!/usr/bin/env node
/**
 * server.mjs — AZ Contractor Pro, one process on the VPS.
 *
 * Requests are routed by hostname (Caddy in front terminates TLS):
 *
 *   any host            /_acp/*        lead + review endpoints, whoami, TLS ask
 *   APP_URL host        /admin/        website creator + CRM          (sign in)
 *                       /portal/       contractor portal               (site + PIN)
 *                       /api/*         admin, portal and public API
 *                       /s/<slug>/     any site by path, for previews before DNS
 *                       /sales/        the sales site
 *   SALES_HOSTS         the sales site, plus /api/demo, /api/checkout, /api/stripe/webhook
 *   <slug>.SITES_DOMAIN a contractor site
 *   custom domains      a contractor site
 */
import http from "node:http";
import path from "node:path";
import { config, ensureDirs, warnings } from "./src/config.mjs";
import { openDb } from "./src/db.mjs";
import { createCtx, serveStatic, HttpError, esc } from "./src/http.mjs";
import { bootstrapAdmin } from "./src/auth.mjs";
import { siteForHost, getSiteBySlug, serveSite, normDomain, simplePage } from "./src/sites.mjs";
import { publicRoutes } from "./src/routes/public.mjs";
import { handleAdmin, servePreview } from "./src/routes/admin.mjs";
import { portalRoutes } from "./src/routes/portal.mjs";
import { sweep, VERSION } from "./src/system.mjs";
import { rocIndex } from "./src/roc.mjs";
import { mailMode } from "./src/mail.mjs";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// The admin and portal are plain ES modules with no inline script, so the
// policy can be strict. Previews load in a same-origin iframe.
const APP_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; " +
    "connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  "X-Frame-Options": "SAMEORIGIN",
};

function hostKind(ctx) {
  const h = normDomain(ctx.hostname);
  if (ctx.host === config.appHost || h === new URL(config.appUrl).hostname || LOCAL.has(ctx.hostname)) return "app";
  if (config.salesHosts.includes(h)) return "sales";
  return "site";
}

const isApiPath = (p) => p.startsWith("/api/") || p.startsWith("/_acp/");

async function dispatch(ctx) {
  const p = ctx.path;

  if (p.startsWith("/_acp/")) {
    if (await publicRoutes.handle(ctx)) return;
    return ctx.json(404, { ok: false, error: "not found" });
  }

  const kind = hostKind(ctx);

  if (kind === "app" || kind === "sales") {
    if (p.startsWith("/api/admin/") && kind === "app") { await handleAdmin(ctx); return; }
    if (p.startsWith("/api/portal/") && kind === "app") {
      if (!(await portalRoutes.handle(ctx))) ctx.json(404, { ok: false, error: "not found" });
      return;
    }
    if (p.startsWith("/api/")) {
      if (!(await publicRoutes.handle(ctx))) ctx.json(404, { ok: false, error: "not found" });
      return;
    }
  }

  if (!["GET", "HEAD"].includes(ctx.method)) return ctx.json(405, { ok: false, error: "method not allowed" });

  if (kind === "sales") {
    if (serveStatic(ctx, path.join(config.publicDir, "sales"), p, { cacheControl: "public, max-age=300" })) return;
    return ctx.html(404, simplePage("Not found", `<h1>Not found</h1><p><a href="/">Back to ${esc(config.brand.name)}</a></p>`));
  }

  if (kind === "app") {
    if (p === "/") return ctx.redirect("/admin/");
    const pv = /^\/admin\/preview\/([a-f0-9]{32})(\/.*)?$/.exec(p);
    if (pv) return servePreview(ctx, pv[1], pv[2] || "/");
    const s = /^\/s\/([a-z0-9-]+)(\/.*)?$/.exec(p);
    if (s) {
      const site = getSiteBySlug(s[1]);
      if (!site) return ctx.html(404, simplePage("No such site", "<h1>No such site</h1>"));
      if (!s[2]) return ctx.redirect(`/s/${site.slug}/`, 301);
      return serveSite(ctx, site, s[2], { prefix: `/s/${site.slug}` });
    }
    for (const area of ["admin", "portal"]) {
      if (p === `/${area}`) return ctx.redirect(`/${area}/`, 301);
      if (p.startsWith(`/${area}/`)) {
        if (serveStatic(ctx, path.join(config.publicDir, area), p.slice(area.length + 1), { headers: APP_HEADERS })) return;
        // Unknown paths fall back to the app shell.
        return serveStatic(ctx, path.join(config.publicDir, area), "/index.html", { headers: APP_HEADERS });
      }
    }
    if (p === "/sales") return ctx.redirect("/sales/", 301);
    if (p.startsWith("/sales/") && serveStatic(ctx, path.join(config.publicDir, "sales"), p.slice(6))) return;
    if (p === "/favicon.ico") return ctx.send(204, null);
    return ctx.html(404, simplePage("Not found", "<h1>Not found</h1>"));
  }

  const site = siteForHost(ctx.hostname);
  if (site) return serveSite(ctx, site, p);
  ctx.html(404, simplePage("No site here", `<h1>No site here</h1><p>${esc(ctx.hostname)} is not connected to a website yet.</p>`));
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    let ctx;
    try {
      ctx = createCtx(req, res);
      await dispatch(ctx);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error(`[server] ${req.method} ${req.url}`, err.stack || err);
      const message = status >= 500 ? "server error" : err.message;
      if (!res.headersSent && ctx) {
        if (isApiPath(ctx.path)) ctx.json(status, { ok: false, error: message, ...(err.extra || {}) });
        else ctx.html(status, simplePage("Something went wrong", `<h1>${esc(message)}</h1>`));
      } else if (!res.headersSent) {
        res.writeHead(status); res.end();
      } else {
        res.end();
      }
    } finally {
      if (!process.env.ACP_QUIET && !(req.url || "").includes("/assets/")) {
        res.on("finish", () => console.log(`${new Date().toISOString()} ${req.headers.host} ${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`));
      }
    }
  });
}

export function start() {
  ensureDirs();
  openDb();
  const admin = bootstrapAdmin();
  sweep();
  const server = createServer();
  server.listen(config.port, config.host, () => {
    console.log(`AZ Contractor Pro v${VERSION} on http://${config.host}:${config.port}`);
    console.log(`  app    : ${config.appUrl}`);
    console.log(`  sites  : ${config.sitesDomain ? `*.${config.sitesDomain}` : "(custom domains only)"} + custom domains`);
    console.log(`  sales  : ${config.salesHosts.join(", ") || `${config.appUrl}/sales/`}`);
    console.log(`  data   : ${config.dataDir}`);
    console.log(`  mail   : ${mailMode()}`);
    if (admin) console.log(`  created admin ${admin.email} — remove ADMIN_PASSWORD from .env now`);
    for (const w of warnings()) console.warn(`  WARN ${w}`);
  });
  // The ROC list takes about a second to load; do it before the first request needs it.
  setTimeout(() => rocIndex(), 200).unref();
  setInterval(() => { try { sweep(); } catch (err) { console.error("[sweep]", err.message); } }, 3600 * 1000).unref();
  const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) start();
