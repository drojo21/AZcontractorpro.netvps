import { h, mount, table, pill, fmtTime, dialog, field, busy, toast } from "../lib.js";

const STATUSES = ["new", "contacted", "quoted", "won", "lost", "spam"];

export async function render(el, _p, { api, query }) {
  const status = h("select", null, h("option", { value: "" }, "All statuses"), STATUSES.map((s) => h("option", { value: s, selected: query.get("status") === s }, s)));
  const list = h("div");
  async function load() {
    const { leads } = await api("/leads", { query: { status: status.value } });
    mount(list, table([
      { label: "Name", render: (r) => h("strong", null, r.name) },
      { label: "Contractor", key: "business_name" },
      { label: "Phone", key: "phone" },
      { label: "Service", key: "service" },
      { label: "City", key: "city" },
      { label: "Status", render: (r) => pill(r.status) },
      { label: "When", render: (r) => fmtTime(r.created_at) },
    ], leads, { onRow: (r) => open(r), empty: "No leads match." }));
  }
  function open(r) {
    const st = h("select", null, STATUSES.map((s) => h("option", { value: s, selected: s === r.status }, s)));
    const notes = h("textarea", null, r.notes || "");
    dialog(`${r.name} → ${r.business_name || r.slug}`, h("div", null,
      h("p", null, h("a", { href: `tel:${r.phone}` }, r.phone || "no phone"), " · ", r.email ? h("a", { href: `mailto:${r.email}` }, r.email) : "no email"),
      h("p", null, [r.service, r.city, r.timeline].filter(Boolean).join(" · ")),
      h("p", null, r.message || "(no details)"),
      Object.keys(r.extra || {}).length ? h("p.small.muted", null, Object.entries(r.extra).map(([k, v]) => `${k}: ${v}`).join(" · ")) : null,
      h("p.small.muted", null, `${r.page} · ${fmtTime(r.created_at)}`),
      field("Status", st), field("Notes", notes)),
    [{ label: "Save", kind: "primary", onclick: async () => { await api(`/leads/${r.id}`, { method: "PATCH", body: { status: st.value, notes: notes.value } }); toast("Saved"); load(); } }]);
  }
  status.addEventListener("change", load);
  mount(el, h("div.head", null, h("h1", null, "Leads"),
    h("div.row", null, status, h("a.btn", { href: "/api/admin/leads?format=csv", download: "" }, "Download CSV"))), list);
  await load();
}
