import { h, mount, makeApi, busy, toast, fail, pill, fmtTime, field, checkbox, confirmDialog } from "/admin/lib.js";

// Kept between visits: signing in takes a trip to the inbox, so a session lasts 30 days.
const KEY = "acp_portal";
let session = null;
try { session = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { session = null; }

const api = makeApi({
  base: "/api/portal",
  headers: () => (session?.token ? { "x-portal-token": session.token } : {}),
  onAuthFail: () => { if (session) signOut(); },
});
const root = document.getElementById("app");
let tab = "home";
let me = null;

function keep(s) {
  session = s;
  try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}

function signOut() {
  keep(null);
  render();
}

function loginView(note = "", isError = false) {
  const ident = h("input", { type: "text", autocomplete: "email", placeholder: "you@example.com or yourbusiness.com", value: new URLSearchParams(location.search).get("site") || "" });
  const btn = h("button.btn.primary", { type: "submit", style: "width:100%" }, "Email me a sign-in link");
  const status = h("div", { role: "status" }, note ? h(`div.notice${isError ? ".err" : ""}`, null, note) : null);
  mount(root, h("div.login", null, h("form", {
    onsubmit: (e) => {
      e.preventDefault();
      busy(btn, async () => {
        const r = await api("/link", { method: "POST", body: { site: ident.value } });
        mount(status, h("div.notice", null, r.message));
      });
    },
  },
  h("h1", null, "Your website"),
  h("p.muted", null, "See your leads, add job photos and approve reviews."),
  status,
  field("Your email or website address", ident, "We email a link to the address we have on file for your business. No email? Call us."),
  btn)));
  ident.focus();
}

/** The emailed link lands here. It is spent by a tap, which a mail scanner fetching the page never makes. */
function linkView(link) {
  // It works once: keep it out of the address bar and the history.
  history.replaceState(null, "", location.pathname + location.search);
  const btn = h("button.btn.primary", { type: "submit", style: "width:100%" }, "Sign in");
  mount(root, h("div.login", null, h("form", {
    onsubmit: (e) => {
      e.preventDefault();
      busy(btn, async () => {
        try {
          keep({ token: (await api("/sign-in", { method: "POST", body: { link } })).token });
          render();
        } catch (err) {
          loginView(err.message, true);
        }
      });
    },
  },
  h("h1", null, "Your website"),
  h("p.muted", null, "One tap and you are in: leads, job photos and reviews."),
  btn)));
  btn.focus();
}

const TABS = [["home", "Overview"], ["leads", "Leads"], ["photos", "Photos"], ["reviews", "Reviews"], ["site", "My site"]];

async function render() {
  const link = /^#link=([\w-]+)$/.exec(location.hash)?.[1];
  if (link) return linkView(link);
  if (!session?.token) return loginView();
  try { me = await api("/me"); } catch (err) { if (err.status !== 401) fail(err); return; }
  const main = h("main.portal-main", { id: "main" });
  const tabBar = h("div.tabs", { role: "tablist" }, TABS.map(([k, l]) => h("button", {
    type: "button", role: "tab", "aria-selected": String(k === tab),
    onclick: () => { tab = k; render(); },
  }, l, k === "leads" && me.counts.newLeads ? ` (${me.counts.newLeads})` : "", k === "reviews" && me.counts.pendingReviews ? ` (${me.counts.pendingReviews})` : "")));
  mount(root,
    h("header.portal-top", null, h("strong", null, me.business), pill(me.site.status), h("span.grow"),
      h("button", { type: "button", onclick: signOut }, "Sign out")),
    h("div.portal-main", { style: "padding-bottom:0" }, tabBar), main);
  try { await VIEWS[tab](main); } catch (err) { fail(err); }
}

function copyField(value) {
  const input = h("input", { type: "text", value, readonly: true, "aria-label": "Link" });
  return h("div.copyrow", null, input, h("button.btn.small", {
    type: "button",
    onclick: async () => { try { await navigator.clipboard.writeText(value); toast("Copied"); } catch { input.select(); } },
  }, "Copy"));
}

/** <img> cannot send the token header, so thumbnails load as blobs. */
function thumb(p) {
  const img = h("img", { alt: p.name });
  fetch(`/api/portal/photos/${p.id}/thumb`, { headers: { "x-portal-token": session.token } })
    .then((r) => (r.ok ? r.blob() : null)).then((b) => { if (b) img.src = URL.createObjectURL(b); }).catch(() => {});
  return img;
}

const VIEWS = {
  async home(el) {
    mount(el,
      me.buy.length ? h("div.card", null, h("h2", null, me.site.status === "expired" ? "Your demo has expired" : "This is a free demo"),
        h("p", null, me.site.demo_expires_at && me.site.status === "demo" ? `It stays up until ${new Date(me.site.demo_expires_at).toLocaleDateString()}. Pick a plan to keep it:` : "Pick a plan to bring it back on your own domain:"),
        h("div.row", null, me.buy.map((b) => h("a.btn.primary", { href: b.url }, `${b.name} — ${b.setup} + ${b.monthly}`)))) : null,
      h("div.stats", null,
        h("div.stat", null, h("b", null, me.counts.newLeads), h("span", null, "New leads")),
        h("div.stat", null, h("b", null, me.counts.pendingReviews), h("span", null, "Reviews to approve")),
        h("div.stat", null, h("b", null, me.counts.photos), h("span", null, "Job photos"))),
      h("div.card", null, h("h2", null, "Your website"),
        h("p", null, h("a.big-link", { href: me.urls.primary, target: "_blank", rel: "noopener" }, me.urls.primary)),
        h("p.small.muted", null, me.site.published_at ? `Last updated ${fmtTime(me.site.published_at)}` : "Not published yet")),
      h("div.card", null, h("h2", null, "Get more reviews"),
        h("p", null, "Text this link to a customer when a job is done. Their review comes to you first, then goes on your site."),
        copyField(me.reviewLink)),
      h("div.card", null, h("h2", null, "Billing"),
        me.billing.subscription ? h("p", null, "Plan: ", pill(me.billing.subscription.status), " ", me.billing.subscription.tier) : h("p.muted", null, "No subscription on file."),
        me.billing.portal ? h("a.btn", { href: me.billing.portal, target: "_blank", rel: "noopener" }, "Manage card and invoices") : null));
  },

  async leads(el) {
    const { leads } = await api("/leads");
    const csv = h("button.btn", {
      type: "button",
      onclick: () => busy(csv, async () => {
        const res = await fetch("/api/portal/leads?format=csv", { headers: { "x-portal-token": session.token } });
        if (!res.ok) throw new Error("download failed");
        const url = URL.createObjectURL(await res.blob());
        h("a", { href: url, download: `leads-${me.site.slug}.csv` }).click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }),
    }, "Download all as a spreadsheet (CSV)");
    const STAT = ["new", "contacted", "quoted", "won", "lost", "spam"];
    mount(el, h("div.head", null, h("h1", null, "Leads"), csv),
      leads.length ? leads.map((l) => {
        const st = h("select", { style: "width:auto" }, STAT.map((s) => h("option", { value: s, selected: s === l.status }, s)));
        const notes = h("textarea", { placeholder: "Notes (only you see these)" }, l.notes || "");
        const save = h("button.btn.small", { type: "button", onclick: () => busy(save, async () => { await api(`/leads/${l.id}`, { method: "PATCH", body: { status: st.value, notes: notes.value } }); toast("Saved"); }) }, "Save");
        return h("div.lead", null,
          h("div.row", null, h("h3.grow", null, l.name), pill(l.status), h("span.small.muted", null, fmtTime(l.created_at))),
          h("p", { style: "margin:6px 0" }, l.phone ? h("a.btn.small.primary", { href: `tel:${l.phone}` }, `Call ${l.phone}`) : null, " ",
            l.email ? h("a.btn.small", { href: `mailto:${l.email}` }, "Email") : null),
          h("p", null, [l.service, l.city, l.timeline].filter(Boolean).join(" · ")),
          l.message ? h("p", null, l.message) : null,
          h("details", null, h("summary", null, "Status and notes"), h("div.row", { style: "margin-top:8px" }, st, save), h("div", { style: "margin-top:8px" }, notes)));
      }) : h("div.card.empty", null, "No leads yet. When someone fills in the quote form on your site, it shows up here and in your email."));
  },

  async photos(el) {
    let { photos } = await api("/photos");
    const cat = h("input", { type: "text", placeholder: "What kind of job? e.g. Block Walls" });
    const input = h("input", { type: "file", accept: "image/*", multiple: true, class: "sr", id: "pf" });
    const pub = h("button.btn.primary", { type: "button", onclick: () => busy(pub, async () => { const r = await api("/publish", { method: "POST" }); toast(r.publish.error ? r.publish.error : "Your website is updated"); }) }, "Put my photos on the website");
    const drop = h("label.drop", { for: "pf" }, h("strong", null, "Tap to add job photos"),
      h("div.small", null, me.uploads ? `Up to ${me.maxUploadMb} MB each. Location data is removed from every photo.` : "Photo uploads are off on this server right now."));
    input.addEventListener("change", async () => {
      let n = 0;
      for (const f of input.files) {
        try { await api("/photos", { method: "POST", raw: f, query: { category: cat.value, name: f.name } }); n++; } catch (err) { fail(new Error(`${f.name}: ${err.message}`)); }
      }
      if (n) { toast(`${n} photo(s) added. Press "Put my photos on the website" when you're done.`); VIEWS.photos(el); }
    });
    const patch = async (id, body) => { photos = (await api(`/photos/${id}`, { method: "PATCH", body })).photos; };
    mount(el, h("div.head", null, h("h1", null, "Job photos"), pub),
      field("Category for the next photos", cat), drop, input,
      h("div.photos", null, photos.map((p) => h("div.photo", null,
        thumb(p),
        h("div.body", null,
          h("input", { type: "text", value: p.name, "aria-label": "Caption", onchange: (e) => patch(p.id, { name: e.target.value }).catch(fail) }),
          h("input", { type: "text", value: p.category, "aria-label": "Category", onchange: (e) => patch(p.id, { category: e.target.value }).catch(fail) }),
          checkbox("Use as the big photo at the top", p.hero, (v) => patch(p.id, { hero: v }).then(() => VIEWS.photos(el)).catch(fail)),
          h("button.btn.small.danger", { type: "button", onclick: async () => { if (await confirmDialog("Delete photo?", p.name, "Delete")) { await api(`/photos/${p.id}`, { method: "DELETE" }).catch(fail); VIEWS.photos(el); } } }, "Delete"))))));
  },

  async reviews(el) {
    const { reviews } = await api("/reviews");
    const decide = async (id, status) => {
      const r = await api(`/reviews/${id}`, { method: "PATCH", body: { status } }).catch(fail);
      if (r) { toast(r.publish?.error ? r.publish.error : "Saved. Your website is updated."); VIEWS.reviews(el); }
    };
    mount(el, h("h1", null, "Reviews"),
      h("div.notice", null, "Approve every real review, good or bad. Reject only spam or reviews meant for someone else. ",
        h("span.small.muted", null, "Hiding honest reviews because of their rating breaks the FTC's rule on consumer reviews (16 CFR 465.7).")),
      h("div.card", null, h("h2", null, "Your review link"), copyField(me.reviewLink)),
      reviews.length ? reviews.map((r) => h("div.review", null,
        h("div.row", null, h("span.stars", { "aria-label": `${r.rating} stars` }, "★".repeat(r.rating) + "☆".repeat(5 - r.rating)),
          h("strong.grow", null, `${r.name}${r.city ? `, ${r.city}` : ""}`), pill(r.status)),
        h("p", { style: "margin:8px 0" }, r.text),
        h("div.row", null,
          r.status !== "approved" ? h("button.btn.small.primary", { type: "button", onclick: () => decide(r.id, "approved") }, "Approve and publish") : null,
          r.status !== "rejected" ? h("button.btn.small", { type: "button", onclick: () => decide(r.id, "rejected") }, "Reject (spam or not my business)") : null)))
        : h("div.card.empty", null, "No reviews yet. Send your review link to your last few customers."));
  },

  async site(el) {
    const { profile: p } = await api("/profile");
    const f = {
      tagline: h("input", { type: "text", value: p.tagline || "", maxlength: 80 }),
      yearsInBusiness: h("input", { type: "number", min: 0, value: p.yearsInBusiness ?? "" }),
      email: h("input", { type: "email", value: p.email || "" }),
      notify_email: h("input", { type: "email", value: me.notify_email || "" }),
      street: h("input", { type: "text", value: p.street || "" }),
      zip: h("input", { type: "text", value: p.zip || "" }),
      cities: h("textarea", null, p.cities.slice(1).join("\n")),
      certifications: h("textarea", null, (p.certifications || []).join("\n")),
      projectsCompleted: h("input", { type: "number", min: 0, value: p.projectsCompleted ?? "" }),
      financingNote: h("input", { type: "text", value: p.financingNote || "" }),
      facebookUrl: h("input", { type: "url", value: p.facebookUrl || "" }),
    };
    const flags = { emergencyService: p.emergencyService, freeEstimates: p.freeEstimates, paymentPlans: p.paymentPlans };
    const services = p.services.map((s) => ({ ...s }));
    const hours = p.hours.map((x) => ({ ...x }));
    const svcBox = h("div");
    const drawSvc = () => mount(svcBox, services.map((s, i) => h("div.repeat", null,
      h("input", { type: "text", value: s.name, "aria-label": "Service", oninput: (e) => { s.name = e.target.value; } }),
      h("textarea", { "aria-label": "Description", style: "margin-top:6px", oninput: (e) => { s.blurb = e.target.value; } }, s.blurb || ""),
      h("div.row", null, h("button.btn.small", { type: "button", onclick: () => { services.splice(i, 1); drawSvc(); } }, "Remove")))),
    h("button.btn.small", { type: "button", onclick: () => { services.push({ name: "", blurb: "" }); drawSvc(); } }, "Add a service"));
    drawSvc();
    const hrsBox = h("div");
    const drawHrs = () => mount(hrsBox, hours.map((r, i) => h("div.row", { style: "margin-bottom:6px" },
      h("input", { type: "text", value: r.days, style: "max-width:160px", "aria-label": "Days", oninput: (e) => { r.days = e.target.value; } }),
      h("input", { type: "time", value: r.opens, style: "max-width:120px", "aria-label": "Opens", oninput: (e) => { r.opens = e.target.value; } }),
      h("input", { type: "time", value: r.closes, style: "max-width:120px", "aria-label": "Closes", oninput: (e) => { r.closes = e.target.value; } }),
      h("button.btn.small", { type: "button", onclick: () => { hours.splice(i, 1); drawHrs(); } }, "Remove"))),
    h("button.btn.small", { type: "button", onclick: () => { hours.push({ days: "Sa", opens: "08:00", closes: "12:00" }); drawHrs(); } }, "Add hours"),
    h("div.small.muted", null, "Days like Mo,Tu,We,Th,Fr — times like 07:00."));
    drawHrs();
    const save = h("button.btn.primary", {
      type: "button",
      onclick: () => busy(save, async () => {
        const body = {
          tagline: f.tagline.value, yearsInBusiness: f.yearsInBusiness.value, email: f.email.value, notify_email: f.notify_email.value,
          street: f.street.value, zip: f.zip.value, cities: f.cities.value, certifications: f.certifications.value,
          projectsCompleted: f.projectsCompleted.value, financingNote: f.financingNote.value, facebookUrl: f.facebookUrl.value,
          services, hours, ...flags,
        };
        try {
          const r = await api("/profile", { method: "PATCH", body });
          toast(r.publish?.skipped ? "Saved. It goes live when your site is published." : "Saved. Your website is updated.");
        } catch (err) {
          const why = (err.data?.checks?.issues || []).filter((i) => i.level === "fail").map((i) => i.message);
          throw new Error(why.length ? `${err.message} ${why.join(" ")}` : err.message);
        }
      }),
    }, "Save and update my website");
    mount(el, h("div.head", null, h("h1", null, "My site"), save),
      h("div.card", null, h("h2", null, "Set by us"),
        h("p.small", null, `${p.locked.name} · ROC #${p.locked.rocNumber} ${p.locked.class} · ${p.locked.phone} · ${p.locked.city}`),
        h("p.small.muted", null, "Your licence details and phone number are shown on every page as Arizona requires. Call us to change them.")),
      h("div.card", null, h("h2", null, "About your business"),
        field("Headline", f.tagline, "Short, like \"Block walls built to stand\". Leave empty and we write one."),
        h("div.cols", null, field("Years in business", f.yearsInBusiness), field("Projects completed", f.projectsCompleted, "Only a real number.")),
        field("Certifications", f.certifications, "One per line."),
        checkbox("We offer emergency service", flags.emergencyService, (v) => { flags.emergencyService = v; }),
        checkbox("Free estimates", flags.freeEstimates, (v) => { flags.freeEstimates = v; }),
        checkbox("Payment plans", flags.paymentPlans, (v) => { flags.paymentPlans = v; }),
        field("Financing note", f.financingNote)),
      h("div.card", null, h("h2", null, "Services"), svcBox),
      h("div.card", null, h("h2", null, "Where you work"),
        field(`Other cities (besides ${p.locked.city})`, f.cities, "One per line. Each gets its own page on the Pro plan.")),
      h("div.card", null, h("h2", null, "Hours"), hrsBox),
      h("div.card", null, h("h2", null, "Contact"),
        h("div.cols", null, field("Public email", f.email), field("Send leads to", f.notify_email)),
        h("div.cols", null, field("Street (optional)", f.street), field("ZIP", f.zip)),
        field("Facebook page", f.facebookUrl)),
      save);
  },
};

render();
