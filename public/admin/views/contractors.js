import { h, mount, table, pill, fmtDate, field, dialog, debounce, fail, toast } from "../lib.js";

export async function render(el, _p, { api, go, meta, query }) {
  const q = h("input", { type: "search", placeholder: "Search name, owner, email, ROC #, city", value: query.get("q") || "" });
  const stage = h("select", null, h("option", { value: "" }, "All stages"),
    meta.stages.map((s) => h("option", { value: s.id, selected: query.get("stage") === s.id }, s.label)));
  const list = h("div");

  async function load() {
    const { contractors } = await api("/contractors", { query: { q: q.value.trim(), stage: stage.value } });
    mount(list, table([
      { label: "Business", render: (r) => h("div", null, h("strong", null, r.business_name), h("div.small.muted", null, [r.owner_name, r.city].filter(Boolean).join(" · "))) },
      { label: "ROC #", render: (r) => h("span.mono", null, r.roc_number || "—") },
      { label: "Trade", render: (r) => meta.trades.find((t) => t.id === r.trade)?.label || r.trade },
      { label: "Stage", render: (r) => pill(r.stage) },
      { label: "Sites", key: "site_count" },
      { label: "Leads", key: "lead_count" },
      { label: "Follow up", render: (r) => fmtDate(r.next_follow_up) },
    ], contractors, { onRow: (r) => go(`#/contractors/${r.id}`), empty: "No contractors match. Add one from their ROC number." }));
  }
  q.addEventListener("input", debounce(load, 250));
  stage.addEventListener("change", load);

  mount(el,
    h("div.head", null, h("h1", null, "Contractors"),
      h("button.btn.primary", { type: "button", onclick: () => newContractor({ api, go, meta }) }, "New contractor")),
    h("div.row", { style: "margin-bottom:12px" }, h("div.grow", null, q), stage),
    list);
  await load();
  if (query.get("new")) newContractor({ api, go, meta });
}

/** Add from the ROC active list (one click) or by hand. */
export function newContractor({ api, go, meta }) {
  const search = h("input", { type: "search", placeholder: "ROC number or business name", autocomplete: "off" });
  const results = h("div");
  const manual = {
    business_name: h("input", { type: "text" }), owner_name: h("input", { type: "text" }),
    roc_number: h("input", { type: "text", inputmode: "numeric" }), phone: h("input", { type: "tel" }),
    email: h("input", { type: "email" }), city: h("input", { type: "text", value: "Tucson" }),
    trade: h("select", null, meta.trades.map((t) => h("option", { value: t.id }, t.label))),
  };
  const phone = h("input", { type: "tel", placeholder: "Phone (goes on the site)" });
  const email = h("input", { type: "email", placeholder: "Email (for leads)" });

  async function add(body) {
    try {
      const { contractor } = await api("/contractors", { method: "POST", body });
      toast(`${contractor.business_name} added`);
      d.close();
      go(`#/contractors/${contractor.id}`);
    } catch (err) {
      if (err.status === 409 && err.data?.id) { d.close(); go(`#/contractors/${err.data.id}`); toast("Already in the CRM — opened it."); }
      else fail(err);
    }
  }

  const lookup = debounce(async () => {
    const v = search.value.trim();
    if (v.length < 3) return mount(results);
    const { results: rows } = await api("/roc", { query: { q: v } }).catch((e) => { fail(e); return { results: [] }; });
    mount(results, rows.length
      ? h("ul.timeline", null, rows.map((r) => h("li", null,
        h("div.row", null,
          h("div.grow", null, h("strong", null, r.dba || r.business_name), h("div.small.muted", null,
            `ROC ${r.roc_number} · ${r.license_class} ${r.license_class_description} · ${r.city} · expires ${r.expiration_date}`)),
          h("button.btn.small.primary", { type: "button", onclick: () => add({ roc: r.roc_number, phone: phone.value, email: email.value }) }, "Add")))))
      : h("p.muted.small", null, "Nothing on the active licence list matches."));
  }, 300);
  search.addEventListener("input", lookup);

  const d = dialog("New contractor", h("div", null,
    h("p.muted.small", null, "Search the Arizona ROC active-licence list. Picking a licence fills in the name, class, city and trade."),
    field("Find a licence", search), h("div.cols", null, phone, email), results,
    h("details", { style: "margin-top:14px" }, h("summary", null, "Not on the list? Add by hand"),
      h("div.cols", { style: "margin-top:10px" },
        field("Business name", manual.business_name), field("Owner", manual.owner_name),
        field("ROC #", manual.roc_number), field("Trade", manual.trade),
        field("Phone", manual.phone), field("Email", manual.email), field("City", manual.city)),
      h("button.btn.primary", {
        type: "button",
        onclick: () => add(Object.fromEntries(Object.entries(manual).map(([k, i]) => [k, i.value]))),
      }, "Add contractor"))));
  search.focus();
}
