import { h, mount, table, pill, fmtTime, fmtDate, field, busy, toast, confirmDialog, money, dialog } from "../lib.js";

export async function render(el, [id], ctx) {
  const { api, go, meta } = ctx;
  const d = await api(`/contractors/${id}`);
  const c = d.contractor;

  const form = {
    business_name: h("input", { type: "text", value: c.business_name }),
    owner_name: h("input", { type: "text", value: c.owner_name }),
    email: h("input", { type: "email", value: c.email }),
    phone: h("input", { type: "tel", value: c.phone }),
    roc_number: h("input", { type: "text", value: c.roc_number }),
    license_class: h("input", { type: "text", value: c.license_class }),
    city: h("input", { type: "text", value: c.city }),
    trade: h("select", null, meta.trades.map((t) => h("option", { value: t.id, selected: t.id === c.trade }, t.label))),
    stage: h("select", null, meta.stages.map((s) => h("option", { value: s.id, selected: s.id === c.stage }, s.label))),
    next_follow_up: h("input", { type: "date", value: c.next_follow_up || "" }),
  };
  const saveBtn = h("button.btn.primary", {
    type: "button",
    onclick: () => busy(saveBtn, async () => {
      await api(`/contractors/${c.id}`, { method: "PATCH", body: Object.fromEntries(Object.entries(form).map(([k, i]) => [k, i.value])) });
      toast("Saved");
      render(el, [id], ctx);
    }),
  }, "Save");

  const noteKind = h("select", { style: "width:auto" }, ["note", "call", "email", "meeting"].map((k) => h("option", { value: k }, k)));
  const note = h("textarea", { placeholder: "What happened? (call notes, what they want, objections…)" });
  const noteBtn = h("button.btn", {
    type: "button",
    onclick: () => busy(noteBtn, async () => {
      await api(`/contractors/${c.id}/notes`, { method: "POST", body: { body: note.value, kind: noteKind.value } });
      render(el, [id], ctx);
    }),
  }, "Add to timeline");

  const newSite = async (btn) => busy(btn, async () => {
    const { site } = await api("/sites", { method: "POST", body: { contractor_id: c.id, tier: "pro" } });
    go(`#/sites/${site.id}`);
  });

  mount(el,
    h("div.head", null,
      h("div", null, h("h1", null, c.business_name),
        h("div.row.small.muted", null, pill(c.stage), c.roc_number ? `ROC #${c.roc_number}` : "No ROC #", c.city, `added ${fmtDate(c.created_at)} via ${c.source}`)),
      h("div.row", null,
        h("button.btn.danger", {
          type: "button",
          onclick: async () => {
            if (!(await confirmDialog("Delete contractor?", `This deletes ${c.business_name}, their sites (taken offline now), leads and photos. It cannot be undone.`, "Delete everything"))) return;
            await api(`/contractors/${c.id}`, { method: "DELETE" });
            toast("Deleted");
            go("#/contractors");
          },
        }, "Delete"))),

    h("div.grid", null,
      h("div.card", null, h("h2", null, "Websites"),
        d.sites.length
          ? d.sites.map((s) => h("div.review", null,
            h("div.row", null, h("strong.grow", null, s.slug), pill(s.status), h("span.pill", null, s.tier)),
            h("div.small.muted", null, s.published_at ? `Published ${fmtTime(s.published_at)}` : "Not published yet", ` · ${s.leads} leads`),
            h("div.row", { style: "margin-top:8px" },
              h("a.btn.small.primary", { href: `#/sites/${s.id}` }, "Open in website creator"),
              s.current_release ? h("a.btn.small", { href: s.urls.primary, target: "_blank", rel: "noopener" }, "View live") : null)))
          : h("p.muted", null, "No website yet."),
        h("button.btn", { type: "button", onclick: (e) => newSite(e.currentTarget) }, d.sites.length ? "Add another site" : "Create website")),

      h("div.card", null, h("h2", null, "Timeline"),
        h("div.row", null, noteKind, h("div.grow")),
        h("div", { style: "margin:8px 0" }, note), noteBtn,
        h("ul.timeline", { style: "margin-top:12px;max-height:360px;overflow:auto" },
          d.activity.map((a) => h("li", null, h("div", null, a.body), h("div.meta", null, `${a.kind} · ${fmtTime(a.created_at)}${a.author ? ` · ${a.author}` : ""}`)))))),

    h("div.card", null, h("h2", null, "Details"),
      h("div.cols", null,
        field("Business name", form.business_name), field("Owner", form.owner_name),
        field("Email", form.email, "Where leads and reviews are emailed unless a site overrides it."), field("Phone", form.phone),
        field("ROC #", form.roc_number), field("Licence class", form.license_class),
        field("City", form.city), field("Trade", form.trade),
        field("Stage", form.stage, "Moves forward on its own: demo published → Demo, payment → Paid, paid site published → Live."),
        field("Follow up on", form.next_follow_up)),
      saveBtn),

    h("h2", null, "Leads"),
    table([
      { label: "Name", key: "name" }, { label: "Phone", key: "phone" }, { label: "Service", key: "service" },
      { label: "City", key: "city" }, { label: "Status", render: (r) => pill(r.status) }, { label: "When", render: (r) => fmtTime(r.created_at) },
    ], d.leads, {
      empty: "No leads yet.",
      onRow: (r) => dialog(`Lead from ${r.name}`, h("div", null,
        h("p", null, h("strong", null, r.phone || "no phone"), " · ", r.email || "no email"),
        h("p", null, [r.service, r.city, r.timeline].filter(Boolean).join(" · ")),
        h("p", null, r.message || "(no details)"),
        h("p.small.muted", null, `${r.page} · ${fmtTime(r.created_at)}`))),
    }),

    h("p.small.muted", { style: "margin-top:16px" },
      `AI copy: ${d.usage.calls} call(s), ${money(d.usage.cost_micros)} · Subscriptions: ${d.subscriptions.map((s) => `${s.tier} ${s.status}`).join(", ") || "none"}`));
}
