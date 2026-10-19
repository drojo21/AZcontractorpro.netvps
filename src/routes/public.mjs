/**
 * public.mjs — everything a stranger can call.
 *
 *   /_acp/lead/<slug>      POST  quote form on any contractor site (any host)
 *   /_acp/review/<slug>    GET   review form   POST  submit a review
 *   /_acp/whoami                 instance id, for domain verification
 *   /_acp/tls-ask?domain=        Caddy on-demand TLS: 200 only for hosts we serve
 *   /api/health
 *   /api/demo              POST  free-demo form on the sales site
 *   /api/checkout          GET   Buy button → Stripe Checkout (303)
 *   /api/stripe/webhook    POST  Stripe events (signature checked)
 */
import { Router } from "../router.mjs";
import { config } from "../config.mjs";
import { HttpError, esc } from "../http.mjs";
import { overLimit } from "../db.mjs";
import { getSiteBySlug, hostAllowed, instanceId, simplePage } from "../sites.mjs";
import { recordLead } from "../leads.mjs";
import { submitReview, reviewPage } from "../reviews.mjs";
import { requestDemo } from "../demo.mjs";
import { checkoutUrl, verifySignature, handleEvent, salesUrl } from "../billing.mjs";
import { health } from "../system.mjs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function liveSite(slug) {
  const site = getSiteBySlug(slug);
  if (!site) throw new HttpError(404, "unknown site");
  return site;
}

export const publicRoutes = new Router()
  .on("OPTIONS", "/_acp/lead/:slug", (ctx) => ctx.send(204, null, CORS))
  .post("/_acp/lead/:slug", async (ctx) => {
    try {
      const out = await recordLead(liveSite(ctx.params.slug), await ctx.body(64 * 1024), { ip: ctx.ip });
      ctx.json(200, out, CORS);
    } catch (err) {
      ctx.json(err.status || 500, { ok: false, error: err.status ? err.message : "server error" }, CORS);
      if (!err.status) console.error("[lead]", err);
    }
  })

  .get("/_acp/review/:slug", (ctx) => {
    const site = liveSite(ctx.params.slug);
    ctx.html(200, reviewPage(site, { done: ctx.query.get("done") === "1" }), { "X-Robots-Tag": "noindex" });
  })
  .post("/_acp/review/:slug", async (ctx) => {
    const site = liveSite(ctx.params.slug);
    const body = await ctx.body(64 * 1024);
    try {
      await submitReview(site, body, { ip: ctx.ip });
      ctx.redirect(`/_acp/review/${site.slug}?done=1`, 303);
    } catch (err) {
      if (!err.status) throw err;
      ctx.html(err.status, reviewPage(site, { error: err.message, values: body }), { "X-Robots-Tag": "noindex" });
    }
  })

  .get("/_acp/whoami", (ctx) => ctx.text(200, instanceId(), { "Cache-Control": "no-store" }))
  .get("/_acp/tls-ask", (ctx) => {
    // Caddy calls this from localhost before getting a certificate.
    const ok = hostAllowed(ctx.query.get("domain") || "");
    ctx.text(ok ? 200 : 404, ok ? "ok" : "unknown host");
  })

  .get("/api/health", (ctx) => ctx.json(200, health()))

  .on("OPTIONS", "/api/demo", (ctx) => ctx.send(204, null, CORS))
  .post("/api/demo", async (ctx) => {
    try {
      ctx.json(200, await requestDemo(await ctx.body(64 * 1024), { ip: ctx.ip }), CORS);
    } catch (err) {
      ctx.json(err.status || 500, { ok: false, error: err.status ? err.message : "server error" }, CORS);
      if (!err.status) console.error("[demo]", err);
    }
  })

  .get("/api/checkout", async (ctx) => {
    const tier = String(ctx.query.get("tier") || "").toLowerCase();
    if (!config.tiers[tier] || !config.stripeKey) return ctx.redirect(salesUrl("#pricing"), 303);
    // Each click creates a Checkout Session at Stripe; a person never needs 30 in 10 minutes.
    if (overLimit(`checkout:${ctx.ip}`, 30, 10 * 60 * 1000)) return ctx.redirect(salesUrl("#pricing"), 303);
    // "← Back" on Stripe's page may only return to a host we serve.
    let returnUrl = "";
    try {
      const u = new URL(String(ctx.query.get("back") || ""));
      if ((u.protocol === "https:" || !config.secure) && hostAllowed(u.host)) returnUrl = u.toString();
    } catch { /* no or bad back= */ }
    try {
      ctx.redirect(await checkoutUrl({ tier, siteSlug: String(ctx.query.get("site") || "").toLowerCase(), returnUrl }), 303);
    } catch (err) {
      console.error("[checkout]", tier, err.message);
      ctx.html(502, simplePage("Checkout is having a moment",
        `<h1>Checkout is having a moment</h1><p>We could not open the payment page just now. Nothing was charged.</p>` +
        (config.brand.phone ? `<p>Try again in a minute, or call <a href="tel:${esc(config.brand.phone)}">${esc(config.brand.phone)}</a>.</p>` : "") +
        `<a class="btn" href="${esc(salesUrl("#pricing"))}">Back to pricing</a>`));
    }
  })

  .post("/api/stripe/webhook", async (ctx) => {
    const raw = (await ctx.raw(1024 * 1024)).toString("utf8");
    if (!verifySignature(raw, ctx.header("stripe-signature"), config.stripeWebhookSecret)) {
      return ctx.json(400, { ok: false, error: "bad signature" });
    }
    let event;
    try { event = JSON.parse(raw); } catch { return ctx.json(400, { ok: false, error: "bad json" }); }
    // A thrown error answers 500 so Stripe retries; the event is only marked
    // seen after it was applied.
    const out = await handleEvent(event);
    ctx.json(200, { received: true, ...out });
  });
