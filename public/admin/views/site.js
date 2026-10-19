/* The website creator: edit the spec on the left, see the real build on the right. */
import {
  h, mount, field, checkbox, busy, toast, fail, dialog, confirmDialog, pill, fmtTime, kb, debounce,
} from "../lib.js";

let lastTab = "content";
const COPY_LABELS = {
  tagline: "Headline (tagline)", heroLine: "Line under the headline", about: "About paragraph",
  servicesIntro: "Services intro", metaDesc: "Search-result description",
};

export async function render(el, [id], ctx) {
  const { api, go, meta } = ctx;
  let site = (await api(`/sites/${id}`)).site;
  let draft = structuredClone(site.spec);
  let copyDraft = { ...(site.copy_overrides || {}) };
  let dirty = false;
  let previewPages = [];

  /* ------------------------------------------------------------ binding */
  const get = (path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), draft);
  const set = (path, v) => {
    const ks = path.split(".");
    let o = draft;
    for (const k of ks.slice(0, -1)) o = (o[k] ??= {});
    o[ks.at(-1)] = v;
    changed();
  };
  const dot = h("span.dirty-dot.hidden", { title: "Unsaved changes" });
  function changed() {
    dirty = true;
    dot.classList.remove("hidden");
    schedulePreview();
  }
  const text = (label, path, { type = "text", hint, placeholder, num = false } = {}) => field(label, h("input", {
    type, value: get(path) ?? "", placeholder,
    oninput: (e) => set(path, num ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value),
  }), hint);
  const area = (label, path, hint) => field(label, h("textarea", { oninput: (e) => set(path, e.target.value) }, get(path) ?? ""), hint);
  const bool = (label, path) => checkbox(label, Boolean(get(path)), (v) => set(path, v));
  const choose = (label, path, options, hint) => field(label, h("select", { onchange: (e) => set(path, e.target.value) },
    options.map(([v, l]) => h("option", { value: v, selected: String(get(path)) === String(v) }, l))), hint);
  const listField = (label, path, hint) => field(label, h("textarea", {
    oninput: (e) => set(path, e.target.value.split(/\n|,/).map((s) => s.trim()).filter(Boolean)),
  }, (get(path) || []).join("\n")), hint);
  const section = (title, ...kids) => h("details.card", { open: true }, h("summary", null, h("strong", null, title)), h("div", { style: "margin-top:12px" }, kids));

  /* ------------------------------------------------------------ preview */
  const frame = h("iframe", { title: "Site preview", sandbox: "allow-scripts allow-forms allow-popups" });
  const frameBox = h("div.frame", null, frame);
  const pageSel = h("select", { "aria-label": "Page", onchange: () => { frame.src = `${currentPreview}${pageSel.value.replace(/index\.html$/, "")}`; } });
  const checksBox = h("div");
  let currentPreview = "";
  async function preview() {
    try {
      const r = await api(`/sites/${site.id}/preview`, { method: "POST", body: { spec: draft, copy_overrides: copyDraft } });
      const keep = pageSel.value;
      currentPreview = r.url;
      previewPages = r.pages;
      mount(pageSel, r.pages.map((p) => h("option", { value: p.path }, `${p.path.replace(/index\.html$/, "") || "/"} — ${p.title}`)));
      if (keep && r.pages.some((p) => p.path === keep)) pageSel.value = keep;
      frame.src = `${r.url}${pageSel.value.replace(/index\.html$/, "")}`;
      renderChecks(r.checks, r.manifest);
    } catch (err) { fail(err); }
  }
  const schedulePreview = debounce(preview, 900);
  function renderChecks(checks, manifest) {
    const issues = (checks.issues || []).filter((i) => i.level !== "info");
    mount(checksBox, h("div.card", null,
      h("div.row", null, h("h3.grow", { style: "margin:0" }, "Checks"),
        pill(checks.ok ? "ok" : "fail"),
        h("span.small.muted", null, `${checks.counts.fail} fail · ${checks.counts.warn} warn${manifest ? ` · ${manifest.pageCount} pages · ${kb(manifest.bytes)}` : ""}`)),
      issues.length
        ? h("ul.issues", { style: "margin-top:8px" }, issues.slice(0, 40).map((i) => h("li", null,
          pill(i.level), h("div", null, h("div", null, i.message), h("div.where", null, `${i.rule}${i.where ? ` · ${i.where}` : ""}`)))))
        : h("p.small.muted", { style: "margin:8px 0 0" }, "Licence display, links, schema, titles, alt text, labels and contrast all pass.")));
  }

  /* ------------------------------------------------------------ actions */
  async function save() {
    const r = await api(`/sites/${site.id}`, { method: "PATCH", body: { spec: draft, copy_overrides: copyDraft } });
    site = r.site;
    draft = structuredClone(site.spec);
    dirty = false;
    dot.classList.add("hidden");
    return site;
  }
  async function publish(force = false) {
    if (dirty) await save();
    try {
      const r = await api(`/sites/${site.id}/publish`, { method: "POST", body: { force } });
      toast(`Published ${r.manifest.pageCount} pages`);
      render(el, [id], ctx);
    } catch (err) {
      if (err.status !== 422) throw err;
      const fails = (err.data.checks?.issues || []).filter((i) => i.level === "fail");
      dialog("Not published: the site failed its checks", h("div", null,
        h("ul.issues", null, fails.map((i) => h("li", null, pill("fail"), h("div", null, i.message, h("div.where", null, i.rule))))),
        h("p.small.muted", { style: "margin-top:10px" }, "Fix these and publish again. Publishing anyway is logged on the contractor's timeline.")),
      [{ label: "Publish anyway", kind: "danger", onclick: () => publish(true).catch(fail) }]);
    }
  }

  const saveBtn = h("button.btn", { type: "button", onclick: () => busy(saveBtn, async () => { await save(); toast("Saved"); }) }, "Save draft");
  const pubBtn = h("button.btn.primary", { type: "button", onclick: () => busy(pubBtn, () => publish(false)) }, site.current_release ? "Publish changes" : "Publish site");
  window.onbeforeunload = () => (dirty ? true : undefined);

  /* ------------------------------------------------------------ tabs */
  const tabs = [
    ["content", "Content"], ["look", "Look & pages"], ["photos", `Photos (${site.photos.length})`],
    ["reviews", `Reviews (${site.reviews.filter((r) => r.status === "pending").length} new)`],
    ["domains", "Domains"], ["access", "Portal & history"],
  ];
  const tabBar = h("div.tabs", { role: "tablist" });
  const pane = h("div");
  function showTab(key) {
    lastTab = key;
    for (const b of tabBar.children) b.setAttribute("aria-selected", String(b.dataset.key === key));
    mount(pane, TAB[key]());
  }
  mount(tabBar, tabs.map(([k, l]) => h("button", { type: "button", role: "tab", "data-key": k, onclick: () => showTab(k) }, l)));

  const tradeOpts = meta.trades.map((t) => [t.id, t.label]);
  const TAB = {
    content: () => h("div", null,
      section("Business",
        text("Business name", "business.name", { hint: "Shown with the ROC number on every page. Must match the licence." }),
        h("div.cols", null, text("Owner", "business.owner"), choose("Trade", "business.trade", tradeOpts)),
        h("div.cols", null, text("Years in business", "business.yearsInBusiness", { type: "number", num: true }),
          choose("Customers", "business.targetCustomer", [["both", "Homeowners & commercial"], ["homeowners", "Homeowners"], ["commercial", "Commercial"]])),
        text("Tagline", "business.tagline", { hint: "Leave empty to let the generator write one." })),
      section("Licence",
        h("div.cols", null, text("ROC #", "license.rocNumber"), text("Class", "license.class")),
        text("Class description", "license.classDescription"),
        h("div.row", null, bool("Bonded", "license.bonded"), bool("Insured", "license.insured")),
        text("Workmanship warranty (years)", "license.warrantyYears", { type: "number", num: true })),
      section("Contact & hours",
        h("div.cols", null, text("Phone", "contact.phone", { type: "tel" }), text("Public email", "contact.email", { type: "email" })),
        text("Street", "contact.address.street", { hint: "Optional. Leave blank for a home-based business." }),
        h("div.cols", null, text("City", "contact.address.city"), text("ZIP", "contact.address.zip")),
        bool("Offers emergency service", "contact.emergencyService"),
        hoursEditor()),
      section("Service area",
        listField("Cities", "serviceArea.cities", "One per line. The first is home; every other city gets its own page on Pro."),
        text("Radius (miles)", "serviceArea.radiusMiles", { type: "number", num: true })),
      section("Services", servicesEditor()),
      section("Offers",
        bool("Free estimates", "offers.freeEstimates"), bool("Payment plans", "offers.paymentPlans"),
        text("Financing note", "offers.financingNote")),
      section("Proof",
        text("Projects completed", "proof.stats.projectsCompleted", { type: "number", num: true, hint: "Only a real number. Leave empty if unknown." }),
        listField("Certifications", "proof.certifications"),
        reviewsEditor()),
      section("Links",
        text("Google Place ID", "integrations.googlePlaceId", { hint: "Adds a Google review link." }),
        text("Facebook page URL", "integrations.facebookUrl", { type: "url" })),
      copySection()),

    look: () => h("div", null,
      section("Colours",
        h("div.row", null, colour("Primary", "site.theme.primary"), colour("Accent", "site.theme.accent"),
          h("button.btn.small", {
            type: "button",
            onclick: () => {
              const t = meta.trades.find((x) => x.id === draft.business.trade);
              if (!t) return;
              set("site.theme.primary", t.palette.primary); set("site.theme.accent", t.palette.accent);
              showTab("look");
            },
          }, "Use trade colours")),
        h("p.small.muted", null, "Colours that would fail contrast are nudged automatically at build time.")),
      section("Pages",
        ["servicePages", "areaPages", "gallery", "reviews", "faq", "about", "contact"].map((k) =>
          bool({ servicePages: "A page per service", areaPages: "A page per city", gallery: "Gallery (needs photos)", reviews: "Reviews page", faq: "FAQ page", about: "About page", contact: "Contact page" }[k], `site.pages.${k}`))),
      section("Plan & status", planEditor())),

    photos: photosTab,
    reviews: reviewsTab,
    domains: domainsTab,
    access: accessTab,
  };

  function colour(label, path) {
    return h("div.field", null, h("label", null, label),
      h("div.row", null,
        h("input", { type: "color", value: get(path) || "#13242D", oninput: (e) => set(path, e.target.value.toUpperCase()), "aria-label": label }),
        h("span.mono", null, get(path))));
  }

  function hoursEditor() {
    const box = h("div");
    const draw = () => mount(box, h("label", null, "Hours"), (draft.contact.hours || []).map((row, i) => h("div.row", { style: "margin-bottom:6px" },
      h("input", { type: "text", value: row.days, style: "max-width:170px", "aria-label": "Days", oninput: (e) => { row.days = e.target.value; changed(); } }),
      h("input", { type: "time", value: row.opens, style: "max-width:120px", "aria-label": "Opens", oninput: (e) => { row.opens = e.target.value; changed(); } }),
      h("input", { type: "time", value: row.closes, style: "max-width:120px", "aria-label": "Closes", oninput: (e) => { row.closes = e.target.value; changed(); } }),
      h("button.btn.small", { type: "button", onclick: () => { draft.contact.hours.splice(i, 1); changed(); draw(); } }, "Remove"))),
    h("button.btn.small", { type: "button", onclick: () => { (draft.contact.hours ||= []).push({ days: "Sa", opens: "08:00", closes: "12:00" }); changed(); draw(); } }, "Add hours"),
    h("div.hint.small.muted", null, "Days as Mo,Tu,We,Th,Fr,Sa,Su."));
    draw();
    return box;
  }

  function servicesEditor() {
    const box = h("div");
    const draw = () => mount(box,
      draft.services.map((s, i) => h("div.repeat", null,
        h("input", { type: "text", value: s.name, placeholder: "Service name", "aria-label": "Service name", oninput: (e) => { s.name = e.target.value; changed(); } }),
        h("textarea", { placeholder: "One or two plain sentences on what it involves", "aria-label": "Description", style: "margin-top:6px", oninput: (e) => { s.blurb = e.target.value; changed(); } }, s.blurb || ""),
        h("div.row", { style: "margin-top:6px" },
          i > 0 ? h("button.btn.small", { type: "button", onclick: () => { [draft.services[i - 1], draft.services[i]] = [draft.services[i], draft.services[i - 1]]; changed(); draw(); } }, "Move up") : null,
          h("button.btn.small", { type: "button", onclick: () => { draft.services.splice(i, 1); changed(); draw(); } }, "Remove")))),
      h("div.row", null,
        h("button.btn.small", { type: "button", onclick: () => { draft.services.push({ name: "", blurb: "" }); changed(); draw(); } }, "Add service"),
        h("button.btn.small", {
          type: "button",
          onclick: () => {
            const t = meta.trades.find((x) => x.id === draft.business.trade);
            if (t) { draft.services = t.services.map((s) => ({ ...s })); changed(); draw(); }
          },
        }, "Replace with the trade's standard list")));
    draw();
    return box;
  }

  function reviewsEditor() {
    const box = h("div");
    const draw = () => mount(box, h("label", null, "Reviews typed in by hand"),
      h("p.small.muted", null, "Only real reviews you can point to (Google, Yelp, a letter). Reviews from the site's review link are managed on the Reviews tab."),
      (draft.proof.reviews || []).map((r, i) => h("div.repeat", null,
        h("div.cols", null,
          h("input", { type: "text", value: r.name, placeholder: "Name", "aria-label": "Reviewer", oninput: (e) => { r.name = e.target.value; changed(); } }),
          h("input", { type: "text", value: r.city, placeholder: "City", "aria-label": "City", oninput: (e) => { r.city = e.target.value; changed(); } }),
          h("input", { type: "number", min: 1, max: 5, value: r.rating, "aria-label": "Rating", oninput: (e) => { r.rating = Number(e.target.value); changed(); } }),
          h("input", { type: "text", value: r.source, placeholder: "Source (Google…)", "aria-label": "Source", oninput: (e) => { r.source = e.target.value; changed(); } })),
        h("textarea", { "aria-label": "Review text", style: "margin-top:6px", oninput: (e) => { r.text = e.target.value; changed(); } }, r.text || ""),
        h("div.row", null, h("button.btn.small", { type: "button", onclick: () => { draft.proof.reviews.splice(i, 1); changed(); draw(); } }, "Remove")))),
      h("button.btn.small", { type: "button", onclick: () => { (draft.proof.reviews ||= []).push({ name: "", city: "", rating: 5, text: "", source: "Google" }); changed(); draw(); } }, "Add a review"));
    draw();
    return box;
  }

  function copySection() {
    const fields = meta.aiFields;
    const inputs = {};
    const box = h("div");
    const ai = h("div");
    if (meta.ai) {
      const notes = h("textarea", { placeholder: "Optional: what the owner said about their business, in their words" });
      const btn = h("button.btn.dark", {
        type: "button",
        onclick: () => busy(btn, async () => {
          const r = await api(`/sites/${site.id}/ai-copy`, { method: "POST", body: { notes: notes.value } });
          for (const [k, v] of Object.entries(r.copy)) { copyDraft[k] = v; if (inputs[k]) inputs[k].value = v; }
          changed();
          toast(`Suggested by ${r.model} for $${(r.costMicros / 1e6).toFixed(4)} — review it, then save`);
        }),
      }, "Suggest copy with Claude");
      mount(ai, field("Notes for the writer", notes), btn, h("p.small.muted", null, "Only the fields below can change; reviews and facts cannot be invented. The cost is logged against this contractor."));
    } else {
      mount(ai, h("p.small.muted", null, "Set ANTHROPIC_API_KEY on the server to get Claude-written suggestions here."));
    }
    mount(box, ai, Object.entries(fields).map(([k, hint]) => {
      inputs[k] = h(k === "about" ? "textarea" : "input", {
        type: "text", value: copyDraft[k] || "", placeholder: "Generator's own copy",
        oninput: (e) => { if (e.target.value.trim()) copyDraft[k] = e.target.value; else delete copyDraft[k]; changed(); },
      }, k === "about" ? copyDraft[k] || "" : null);
      return field(COPY_LABELS[k] || k, inputs[k], hint);
    }));
    return section("Home page copy (optional overrides)", box);
  }

  function planEditor() {
    const tier = h("select", null, Object.entries(meta.tiers).map(([k, t]) => h("option", { value: k, selected: k === site.tier }, `${t.name} — ${t.setup} + ${t.monthly}`)));
    const status = h("select", null, [["draft", "Draft (not public)"], ["demo", "Demo (banner + noindex)"], ["active", "Active (paying customer)"], ["suspended", "Suspended"], ["expired", "Expired demo"]]
      .map(([v, l]) => h("option", { value: v, selected: v === site.status }, l)));
    const btn = h("button.btn", {
      type: "button",
      onclick: () => busy(btn, async () => {
        await api(`/sites/${site.id}`, { method: "PATCH", body: { tier: tier.value, status: status.value } });
        toast("Plan and status saved");
        render(el, [id], ctx);
      }),
    }, "Save plan & status");
    return h("div", null, field("Plan", tier, "Changing the plan does not change Stripe; it sets which pages a new site starts with."),
      field("Status", status, "Status changes take effect immediately, no publish needed."), btn);
  }

  function photosTab() {
    const input = h("input", { type: "file", accept: "image/*", multiple: true, class: "sr", id: "photo-input" });
    const cat = h("input", { type: "text", placeholder: "Category, e.g. Block Walls", list: "svc-list" });
    const drop = h("label.drop", { for: "photo-input" }, h("strong", null, "Drop job photos here or click to choose"),
      h("div.small", null, "JPEG, PNG, HEIC, WebP. Re-encoded on upload, which strips GPS and other EXIF data."));
    const upload = async (files) => {
      let n = 0;
      for (const f of files) {
        try {
          await api(`/sites/${site.id}/photos`, { method: "POST", raw: f, query: { category: cat.value, name: f.name } });
          n++;
        } catch (err) { fail(new Error(`${f.name}: ${err.message}`)); }
      }
      if (n) { toast(`${n} photo(s) added — publish to put them on the site`); site = (await api(`/sites/${site.id}`)).site; showTab("photos"); schedulePreview(); }
    };
    input.addEventListener("change", () => upload([...input.files]));
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); upload([...e.dataTransfer.files]); });
    const patch = async (pid, body) => {
      const r = await api(`/sites/${site.id}/photos/${pid}`, { method: "PATCH", body }).catch(fail);
      if (r) { site.photos = r.photos; schedulePreview(); }
    };
    return h("div", null,
      h("datalist", { id: "svc-list" }, draft.services.map((s) => h("option", { value: s.name }))),
      field("Category for the next upload", cat), drop, input,
      site.photos.length ? h("div.photos", null, site.photos.map((p) => h("div.photo", null,
        h("img", { src: `/api/admin/sites/${site.id}/photos/${p.id}/thumb`, alt: p.name, loading: "lazy" }),
        h("div.body", null,
          h("input", { type: "text", value: p.name, "aria-label": "Caption", onchange: (e) => patch(p.id, { name: e.target.value }) }),
          h("input", { type: "text", value: p.category, list: "svc-list", "aria-label": "Category", onchange: (e) => patch(p.id, { category: e.target.value }) }),
          checkbox("Hero photo", p.hero, (v) => patch(p.id, { hero: v }).then(() => showTab("photos"))),
          h("button.btn.small.danger", {
            type: "button",
            onclick: async () => {
              const r = await api(`/sites/${site.id}/photos/${p.id}`, { method: "DELETE" }).catch(fail);
              if (r) { site.photos = r.photos; showTab("photos"); schedulePreview(); }
            },
          }, "Delete"))))) : h("p.muted", null, "No photos yet. Contractors can also add them from their portal."));
  }

  function reviewsTab() {
    const link = `${site.urls.primary.replace(/\/$/, "")}/_acp/review/${site.slug}`;
    const decide = async (rid, status) => {
      const r = await api(`/sites/${site.id}/reviews/${rid}`, { method: "PATCH", body: { status } }).catch(fail);
      if (r) { site.reviews = r.reviews; showTab("reviews"); schedulePreview(); toast(r.republish?.error ? `Saved, but not republished: ${r.republish.error}` : "Saved and republished"); }
    };
    return h("div", null,
      h("div.notice", null, "Send customers this link after a job: ", h("a", { href: link, target: "_blank", rel: "noopener" }, link),
        h("div.small.muted", null, "Approve every genuine review, including critical ones. Hiding reviews because of their rating is a deceptive practice under FTC rule 16 CFR 465.7.")),
      site.reviews.length ? site.reviews.map((r) => h("div.review", null,
        h("div.row", null, h("span.stars", { "aria-label": `${r.rating} stars` }, "★".repeat(r.rating) + "☆".repeat(5 - r.rating)), h("strong.grow", null, `${r.name}${r.city ? `, ${r.city}` : ""}`), pill(r.status)),
        h("p", { style: "margin:8px 0" }, r.text),
        h("div.row", null, h("span.small.muted.grow", null, fmtTime(r.created_at)),
          r.status !== "approved" ? h("button.btn.small.primary", { type: "button", onclick: () => decide(r.id, "approved") }, "Approve") : null,
          r.status !== "rejected" ? h("button.btn.small", { type: "button", onclick: () => decide(r.id, "rejected") }, "Reject (spam / wrong business)") : null)))
        : h("p.muted", null, "No reviews submitted yet."));
  }

  function domainsTab() {
    const input = h("input", { type: "text", placeholder: "luisrojosmasonry.com" });
    const ip = meta.publicIp || "your server's IP address";
    const reload = async () => { site = (await api(`/sites/${site.id}`)).site; showTab("domains"); };
    const add = h("button.btn.primary", {
      type: "button",
      onclick: () => busy(add, async () => { await api(`/sites/${site.id}/domains`, { method: "POST", body: { domain: input.value } }); await reload(); }),
    }, "Add domain");
    return h("div", null,
      h("div.card", null, h("h3", null, "Addresses"),
        site.urls.subdomain ? h("p", null, "Always on: ", h("a", { href: site.urls.subdomain, target: "_blank", rel: "noopener" }, site.urls.subdomain)) : null,
        h("p", null, "Preview before DNS: ", h("a", { href: site.urls.preview, target: "_blank", rel: "noopener" }, site.urls.preview), h("span.small.muted", null, " (noindex)"))),
      h("div.card", null, h("h3", null, "Custom domain"),
        h("ol.small", null,
          h("li", null, "Add the domain here (www is added with it)."),
          h("li", null, "At the registrar, point it here: ", h("span.kbd", null, `A  @  → ${ip}`), " and ", h("span.kbd", null, `A  www  → ${ip}`),
            site.urls.subdomain ? [" (or ", h("span.kbd", null, `CNAME www → ${site.urls.subdomain.replace(/^https:\/\/|\/$/g, "")}`), ")"] : null),
          h("li", null, "Press Verify. Once it reaches this server, make it primary: HTTPS is issued automatically and the other addresses redirect to it.")),
        h("div.row", null, h("div.grow", null, input), add),
        h("div", { style: "margin-top:12px" }, site.domains.map((d) => h("div.review", null,
          h("div.row", null, h("strong.grow.mono", null, d.domain), d.is_primary ? pill("primary") : null,
            h("button.btn.small", {
              type: "button",
              onclick: async (e) => busy(e.currentTarget, async () => {
                const r = await api(`/sites/${site.id}/domains/${d.domain}/verify`, { method: "POST", body: {} });
                toast(r.ok ? `${d.domain} reaches this server` : r.reason, { error: !r.ok });
              }),
            }, "Verify"),
            !d.is_primary ? h("button.btn.small.primary", {
              type: "button",
              onclick: async (e) => busy(e.currentTarget, async () => {
                const r = await api(`/sites/${site.id}/domains/${d.domain}/verify`, { method: "POST", body: { primary: true } });
                if (!r.ok) throw new Error(r.reason);
                toast(`${d.domain} is now the main address`);
                await reload();
              }),
            }, "Make primary") : null,
            h("button.btn.small.danger", {
              type: "button",
              onclick: async () => { await api(`/sites/${site.id}/domains/${d.domain}`, { method: "DELETE" }).catch(fail); await reload(); },
            }, "Remove")))))));
  }

  function accessTab() {
    const notify = h("input", { type: "email", value: site.notify_email || "" });
    const notifyBtn = h("button.btn", {
      type: "button",
      onclick: () => busy(notifyBtn, async () => { await api(`/sites/${site.id}`, { method: "PATCH", body: { notify_email: notify.value } }); toast("Saved"); }),
    }, "Save");
    const sendIt = h("input", { type: "checkbox", checked: true });
    const pinBtn = h("button.btn.dark", {
      type: "button",
      onclick: () => busy(pinBtn, async () => {
        const r = await api(`/sites/${site.id}/pin`, { method: "POST", body: { email: sendIt.checked ? "contractor" : "" } });
        dialog("New portal PIN", h("div", null,
          h("p", null, "Site: ", h("span.kbd", null, site.slug), "  PIN: ", h("span.kbd", { style: "font-size:18px" }, r.pin)),
          h("p.small.muted", null, r.emailed ? `Emailed to ${r.emailed}.` : "Not emailed. This is the only time it is shown."),
          h("p.small", null, "Portal: ", h("a", { href: "/portal/", target: "_blank" }, `${location.origin}/portal/`))));
      }),
    }, site.has_pin ? "Reset portal PIN" : "Give portal access");
    return h("div", null,
      h("div.card", null, h("h3", null, "Lead emails"),
        field("Send this site's leads and reviews to", notify, "Empty means the contractor's email."), notifyBtn),
      h("div.card", null, h("h3", null, "Contractor portal"),
        h("p.small.muted", null, "The contractor signs in with the site address and a 6-digit PIN to see leads, add photos, approve reviews and edit services, cities and hours."),
        h("label.check", null, sendIt, "Email the PIN to the contractor"), pinBtn),
      h("div.card", null, h("h3", null, "Releases"),
        site.releases.length ? h("ul.timeline", null, site.releases.map((r) => h("li", null,
          h("div.row", null,
            h("span.mono.grow", null, r.id), r.id === site.current_release ? pill("live") : h("button.btn.small", {
              type: "button",
              onclick: async () => {
                if (!(await confirmDialog("Roll back?", `Serve release ${r.id} again? Later edits stay in the editor.`, "Roll back"))) return;
                await api(`/sites/${site.id}/rollback`, { method: "POST", body: { release: r.id } }).catch(fail);
                render(el, [id], ctx);
              },
            }, "Roll back to this")),
          h("div.meta", null, `${fmtTime(r.created_at)} · ${r.pages} pages · ${kb(r.bytes)} · ${r.author}${r.checks.forced ? " · FORCED" : ""}`))))
          : h("p.muted", null, "Not published yet."),
        site.current_release ? h("a.btn", { href: `/api/admin/sites/${site.id}/zip`, download: "" }, "Download the live site (.zip)") : null),
      h("div.card", null, h("h3", null, "Delete"),
        h("button.btn.danger", {
          type: "button",
          onclick: async () => {
            if (!(await confirmDialog("Delete this site?", "It goes offline now, with its photos, reviews and releases. Leads are kept.", "Delete site"))) return;
            await api(`/sites/${site.id}`, { method: "DELETE" });
            window.onbeforeunload = null;
            go(`#/contractors/${site.contractor_id}`);
          },
        }, "Delete site")));
  }

  /* ------------------------------------------------------------ layout */
  const device = h("button.btn.small", { type: "button", onclick: () => { frameBox.classList.toggle("phone"); device.textContent = frameBox.classList.contains("phone") ? "Desktop" : "Phone"; } }, "Phone");
  mount(el,
    h("div.head", null,
      h("div", null,
        h("h1", null, site.business_name, dot),
        h("div.row.small.muted", null, pill(site.status), h("span.pill", null, meta.tiers[site.tier]?.name || site.tier),
          site.published_at ? `published ${fmtTime(site.published_at)}` : "never published",
          h("a", { href: `#/contractors/${site.contractor_id}` }, "contractor"),
          site.current_release ? h("a", { href: site.urls.primary, target: "_blank", rel: "noopener" }, site.urls.primary) : null)),
      h("div.row", null, saveBtn, pubBtn)),
    site.status === "draft" ? h("div.notice", null, "Draft: publishing writes the site to disk but it is only visible at the preview address until the status is Demo or Active. Set it on Look & pages → Plan & status.") : null,
    h("div.editor", null,
      h("div.pane", null, tabBar, pane),
      h("div.preview", null,
        h("div.preview-bar", null, pageSel, device,
          h("button.btn.small", { type: "button", onclick: preview }, "Refresh"),
          h("button.btn.small", { type: "button", onclick: () => currentPreview && window.open(`${currentPreview}${pageSel.value.replace(/index\.html$/, "")}`, "_blank") }, "Open")),
        frameBox, checksBox)));
  showTab(TAB[lastTab] ? lastTab : "content");
  preview();
}
