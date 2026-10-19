/* Small helpers shared by the admin and the portal. No framework, no build. */

/** h("div.card", {onclick}, child, …) — text children are escaped by construction. */
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split(".");
  const el = document.createElement(name || "div");
  if (classes.length) el.className = classes.join(" ");
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className += (el.className ? " " : "") + v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = Boolean(v);
    else if (k === "html") throw new Error("no raw html");
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function mount(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/* ---------------------------------------------------------------- api */

export function makeApi({ base, headers = {}, onAuthFail }) {
  return async function api(path, { method = "GET", body, raw, query } = {}) {
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== ""))}` : "";
    const opts = { method, headers: { ...headers() }, credentials: "same-origin" };
    if (raw) { opts.body = raw; opts.headers["Content-Type"] = raw.type || "application/octet-stream"; }
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
    const res = await fetch(base + path + qs, opts);
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (res.status === 401 && onAuthFail) onAuthFail();
    if (!res.ok || data.ok === false) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  };
}

/* -------------------------------------------------------------- toasts */

let toastBox;
export function toast(msg, { error = false, ms = 3800 } = {}) {
  if (!toastBox) { toastBox = h("div.toast", { role: "status", "aria-live": "polite" }); document.body.append(toastBox); }
  const t = h("div", { class: error ? "err" : "" }, msg);
  toastBox.append(t);
  setTimeout(() => t.remove(), ms);
}
export const fail = (err) => toast(err?.message || String(err), { error: true, ms: 6000 });

/** Run an async action with the button disabled; toasts errors. */
export async function busy(btn, fn) {
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Working…"; }
  try { return await fn(); }
  catch (err) { fail(err); return undefined; }
  finally { if (btn) { btn.disabled = false; btn.textContent = label; } }
}

/* ------------------------------------------------------------ dialogs */

export function dialog(title, body, actions = []) {
  const d = h("dialog", null,
    h("h2", null, title),
    h("div", null, body),
    h("div.row", { style: "justify-content:flex-end;margin-top:16px" },
      ...actions.map((a) => h(`button.btn${a.kind ? "." + a.kind : ""}`, {
        type: "button",
        onclick: async (e) => { const keep = await a.onclick?.(e, d); if (keep !== true) d.close(); },
      }, a.label)),
      h("button.btn", { type: "button", onclick: () => d.close() }, "Close")));
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
  return d;
}

export function confirmDialog(title, text, label = "Yes") {
  return new Promise((resolve) => {
    let ok = false;
    const d = dialog(title, h("p", null, text), [{ label, kind: "primary", onclick: () => { ok = true; } }]);
    d.addEventListener("close", () => resolve(ok));
  });
}

/* ------------------------------------------------------------- format */

export const fmtDate = (s) => (s ? new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
export const fmtTime = (s) => (s ? new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
export const money = (micros) => `$${(Number(micros || 0) / 1e6).toFixed(micros && micros < 1e5 ? 4 : 2)}`;
export const pill = (s) => h(`span.pill.${String(s || "").replace(/[^a-z_]/gi, "")}`, null, String(s || "—").replace(/_/g, " "));
export const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function field(labelText, input, hint) {
  const id = input.id || `f${Math.random().toString(36).slice(2, 9)}`;
  input.id = id;
  return h("div.field", null, h("label", { for: id }, labelText), input, hint ? h("div.hint", null, hint) : null);
}

export function checkbox(labelText, checked, onchange) {
  const input = h("input", { type: "checkbox", checked, onchange: (e) => onchange(e.target.checked) });
  return h("label.check", null, input, labelText);
}

export function table(cols, rows, { onRow, empty = "Nothing here yet." } = {}) {
  if (!rows.length) return h("div.table-wrap", null, h("div.empty", null, empty));
  return h("div.table-wrap", null, h("table", null,
    h("thead", null, h("tr", null, cols.map((c) => h("th", null, c.label)))),
    h("tbody", null, rows.map((r) => h(`tr${onRow ? ".click" : ""}`, onRow ? { onclick: () => onRow(r), tabindex: 0, onkeydown: (e) => { if (e.key === "Enter") onRow(r); } } : null,
      cols.map((c) => h("td", null, c.render ? c.render(r) : r[c.key] ?? "—")))))));
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
