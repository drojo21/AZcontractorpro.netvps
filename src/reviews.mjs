/**
 * reviews.mjs — real reviews from real customers, collected on the site itself.
 *
 * The engine refuses to invent reviews (16 CFR part 465). This is the other
 * half: every site gets /_acp/review/<slug>, the contractor texts that link to
 * a customer after a job, the review lands as "pending", and once approved in
 * the portal it is published on the next build — with aggregateRating markup,
 * which is now honest because it is backed by visible, genuine reviews.
 *
 * Approval exists to stop spam and reviews about the wrong business, not to
 * filter by rating. 16 CFR 465.7 makes suppressing negative reviews a
 * deceptive practice, and the portal says so next to the approve button.
 */
import { config } from "./config.mjs";
import { db, nowIso, overLimit } from "./db.mjs";
import { HttpError, clean, esc, isEmail } from "./http.mjs";
import { notify } from "./mail.mjs";
import { addActivity, getContractor } from "./contractors.mjs";
import { normalize } from "../engine/spec.mjs";
import { tokens, fontHref } from "../engine/theme.mjs";

export const REVIEW_STATUSES = ["pending", "approved", "rejected"];

export async function submitReview(site, data, { ip = "" } = {}) {
  if (clean(data.company_url || data.company_website)) return { ok: true };
  if (site.status !== "active" && site.status !== "demo") throw new HttpError(403, "this business is not collecting reviews right now");
  if (ip && overLimit(`review:${ip}`, 5, 60 * 60 * 1000)) throw new HttpError(429, "too many reviews from this connection — try again later");
  const name = clean(data.name, 60);
  const text = clean(data.text, 2000);
  const rating = Math.max(1, Math.min(5, parseInt(data.rating, 10) || 0));
  if (!name) throw new HttpError(400, "Please add your name.");
  if (text.length < 15) throw new HttpError(400, "Please write at least a sentence about the job.");
  if (!parseInt(data.rating, 10)) throw new HttpError(400, "Please pick a star rating.");
  if (!data.consent) throw new HttpError(400, "Please tick the box so the business can show your review.");
  const email = isEmail(data.email) ? clean(data.email, 200) : "";
  const { id } = db().run(
    "INSERT INTO reviews (site_id, name, city, rating, text, email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [site.id, name, clean(data.city, 60), rating, text, email, nowIso()],
  );
  addActivity(site.contractor_id, "review", `New ${rating}-star review from ${name} (pending)`, "website");
  const c = getContractor(site.contractor_id);
  notify({
    to: site.notify_email || c?.email || config.adminEmail,
    subject: `New ${rating}-star review from ${name}`,
    text: `${"★".repeat(rating)}${"☆".repeat(5 - rating)}\n\n${text}\n\n— ${name}${data.city ? `, ${clean(data.city, 60)}` : ""}\n\n` +
      `Approve it in your portal and it goes on your website: ${config.appUrl}/portal/\n` +
      `Please approve every genuine review, including critical ones. Hiding reviews because of their rating is a deceptive practice under FTC rule 16 CFR 465.7.`,
  }, "review");
  return { ok: true, id };
}

export function listReviews(siteId, status = "") {
  return status
    ? db().all("SELECT * FROM reviews WHERE site_id = ? AND status = ? ORDER BY id DESC", [Number(siteId), status])
    : db().all("SELECT * FROM reviews WHERE site_id = ? ORDER BY id DESC", [Number(siteId)]);
}

export function decideReview(siteId, id, status) {
  if (!REVIEW_STATUSES.includes(status)) throw new HttpError(400, `status must be one of ${REVIEW_STATUSES.join(", ")}`);
  const r = db().run("UPDATE reviews SET status = ?, decided_at = ? WHERE site_id = ? AND id = ?",
    [status, nowIso(), Number(siteId), Number(id)]);
  if (!r.changes) throw new HttpError(404, "no such review");
  return db().get("SELECT * FROM reviews WHERE id = ?", [Number(id)]);
}

/** The public review form, themed with the site's own colours. */
export function reviewPage(site, { done = false, error = "", values = {} } = {}) {
  const { spec } = normalize(site.spec || {});
  const tk = tokens(spec);
  const name = spec.business.name;
  const cities = spec.serviceArea.cities;
  const v = (k) => esc(values[k] || "");
  const stars = [5, 4, 3, 2, 1].map((n) => `<label class="star"><input type="radio" name="rating" value="${n}"${String(values.rating) === String(n) ? " checked" : ""}> ${"★".repeat(n)}<span class="sr"> ${n} star${n > 1 ? "s" : ""}</span></label>`).join("");
  const body = done
    ? `<h1>Thank you</h1><p class="lede">Your review is with ${esc(name)}. Once they approve it, it appears on their website.</p>
       <a class="btn" href="/">Back to ${esc(name)}</a>`
    : `<p class="eyebrow">${esc(name)}</p>
       <h1>How did we do?</h1>
       <p class="lede">Your review goes on our website with your name and city. Honest is more useful than glowing.</p>
       ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
       <form method="post" action="/_acp/review/${esc(site.slug)}" novalidate>
         <fieldset><legend>Your rating</legend><div class="stars">${stars}</div></fieldset>
         <label for="r-text">What did we do, and how did it go?</label>
         <textarea id="r-text" name="text" rows="6" required>${v("text")}</textarea>
         <label for="r-name">Your name <span class="muted">(first name and last initial is fine)</span></label>
         <input id="r-name" name="name" autocomplete="name" value="${v("name")}" required>
         <label for="r-city">City</label>
         <input id="r-city" name="city" list="r-cities" value="${v("city")}">
         <datalist id="r-cities">${cities.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>
         <label for="r-email">Email <span class="muted">(optional, never shown)</span></label>
         <input id="r-email" name="email" type="email" autocomplete="email" value="${v("email")}">
         <div class="hp" aria-hidden="true"><label for="r-cu">Leave empty</label><input id="r-cu" name="company_url" tabindex="-1" autocomplete="off"></div>
         <label class="check"><input type="checkbox" name="consent" value="1"${values.consent ? " checked" : ""}> ${esc(name)} may show this review, my name and my city on their website.</label>
         <button class="btn" type="submit">Send my review</button>
       </form>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review ${esc(name)}</title><meta name="robots" content="noindex">
<link rel="stylesheet" href="${fontHref(tk.fonts.display, tk.fonts.body)}">
<style>
:root{--brand:${tk.light.brand};--on-brand:${tk.light.onBrand};--accent:${tk.light.accent};--on-accent:${tk.light.onAccent};--ink:#1A1A17;--muted:#595349;--line:#A9A197}
*{box-sizing:border-box}body{margin:0;background:#F7F5F1;color:var(--ink);font:17px/1.55 "${tk.fonts.body}",system-ui,sans-serif}
main{max-width:620px;margin:0 auto;padding:48px 20px 64px}h1{font:800 34px/1.1 "${tk.fonts.display}",Arial,sans-serif;margin:0 0 12px}
.eyebrow{color:var(--brand);font-weight:600;letter-spacing:.14em;text-transform:uppercase;font-size:13px;margin:0 0 8px}
.lede{color:var(--muted);font-size:19px;margin:0 0 28px}.muted{color:var(--muted);font-weight:400}
label{display:block;font-weight:700;font-size:15px;margin:18px 0 6px}
input,textarea{width:100%;font:inherit;font-size:16px;padding:13px;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--ink)}
input:focus,textarea:focus,.star:focus-within{outline:3px solid var(--brand);outline-offset:1px}
fieldset{border:0;padding:0;margin:0}legend{font-weight:700;font-size:15px;margin-bottom:8px}
.stars{display:flex;flex-direction:column;gap:6px}.star{display:flex;align-items:center;gap:10px;margin:0;font-weight:400;color:var(--accent);font-size:20px;letter-spacing:2px;padding:8px 12px;border:1px solid #E0DBD1;border-radius:6px;background:#fff;cursor:pointer}
.star input{width:auto;accent-color:var(--brand)}.check{display:flex;gap:10px;align-items:flex-start;font-weight:400}.check input{width:auto;margin-top:4px}
.btn{display:inline-block;margin-top:24px;background:var(--accent);color:var(--on-accent);border:0;border-radius:8px;padding:16px 24px;font:700 16px "${tk.fonts.display}",Arial,sans-serif;text-decoration:none;cursor:pointer;min-height:52px}
.err{border-left:4px solid #A33C26;background:#fff;padding:12px 16px;color:#A33C26;font-weight:600}
.hp{position:absolute;left:-9999px}.sr{position:absolute;left:-9999px}
</style></head><body><main>${body}</main></body></html>`;
}
