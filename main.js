const UNITS = ["m²", "ml", "ud"];
const IVA = 21;
const uid = () => Math.random().toString(36).slice(2, 9);
const slug = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// Ids fijos derivados del nombre, para que los presupuestos guardados sigan encontrando sus partidas.
const P = (cap, nombre, unidad, precio, hijos = []) => {
  const id = "e-" + slug(cap + " " + nombre).slice(0, 44);
  return { id, cap, nombre, unidad, precio, hijos: hijos.map(h => ({ id: id + "--" + slug(h[0]).slice(0, 32), nombre: h[0], unidad: h[1], precio: h[2] })) };
};

// Catálogo de ejemplo: precios orientativos, editables desde la pestaña Catálogo.
function exampleCatalog() {
  return [
    P("Demoliciones", "Demolición de tabique de ladrillo", "m²", 18, [["Carga y transporte de escombros a vertedero", "m²", 6]]),
    P("Demoliciones", "Retirada de sanitarios", "ud", 45),
    P("Demoliciones", "Contenedor de escombros 5 m³", "ud", 220),
    P("Suelos", "Colocación de suelo nuevo (porcelánico)", "m²", 32, [
      ["Retirada de suelo anterior con transporte a vertedero por medios manuales", "m²", 14],
      ["Reparación de solera / recrecido si es necesario", "m²", 16],
      ["Rodapié a juego", "ml", 9]
    ]),
    P("Suelos", "Tarima flotante laminada", "m²", 24, [
      ["Retirada de suelo anterior con transporte a vertedero por medios manuales", "m²", 14],
      ["Lámina aislante antiimpacto", "m²", 3],
      ["Rodapié DM lacado", "ml", 8]
    ]),
    P("Albañilería", "Tabique de pladur 15+46+15", "m²", 38, [["Aislamiento de lana mineral", "m²", 7]]),
    P("Albañilería", "Alicatado de paredes", "m²", 30, [["Retirada de alicatado existente", "m²", 12]]),
    P("Albañilería", "Falso techo de pladur", "m²", 32, [["Foseado perimetral para iluminación", "ml", 22]]),
    P("Albañilería", "Regola (apertura y tapado de roza)", "ml", 5),
    P("Pintura", "Pintura plástica en paredes y techos", "m²", 7, [["Alisado de gotelé", "m²", 9]]),
    P("Fontanería", "Instalación de fontanería de baño completo", "ud", 950),
    P("Fontanería", "Plato de ducha con mampara", "ud", 650, [["Retirada de bañera existente", "ud", 120]]),
    P("Electricidad", "Punto de luz o enchufe", "ud", 45),
    P("Electricidad", "Cuadro eléctrico nuevo", "ud", 480),
    P("Carpintería", "Puerta de paso lacada", "ud", 280, [["Retirada de puerta existente", "ud", 25]]),
    P("Carpintería", "Encimera de cocina", "ml", 180)
  ];
}

let catalog = exampleCatalog();
const DEFAULT_CLAUSE = "Este presupuesto es aproximado y se ha elaborado con la información disponible en el momento de la visita. El importe final puede variar por imprevistos que surjan durante la ejecución de la obra (estado de instalaciones, soportes o elementos ocultos) o por las adaptaciones que sea necesario realizar. Cualquier variación se comunicará y valorará con el cliente antes de ejecutarse.";
let clausula = DEFAULT_CLAUSE;
// Presupuesto en curso: borrador por navegador. Un presupuesto tiene secciones (estancias: baño, cocina...),
// cada una con su propia selección sel[id] = { on, qty, linked }. cur = sección que se está editando.
const newSec = (nombre = "") => ({ id: "s" + uid(), nombre, sel: {} });
let draft = { secs: [newSec()], cur: null, cliente: "", obra: "", fecha: new Date().toLocaleDateString("es-ES"), iva: "21", gg: 0 };
const SEC_SUGGEST = ["Cuarto de baño", "Aseo", "Cocina", "Salón", "Comedor", "Dormitorio principal", "Dormitorio", "Pasillo", "Recibidor", "Terraza", "Lavadero", "Fachada", "Zonas comunes"];
let db = null;
const CAT_DOC = "config/catalogo";

const $ = id => document.getElementById(id);
const eur = n => (Math.round(n * 100) / 100).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// ---------- saneado: todo lo que viene de almacenamiento o de una copia importada se valida ----------
const SAFE_ID = /^[A-Za-z0-9_-]{1,160}$/;
const cleanStr = (v, max = 400) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").slice(0, max);
const cleanNum = v => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n >= 0 && n < 1e9 ? n : 0; };
const safeKey = k => SAFE_ID.test(k) && k !== "__proto__" && k !== "constructor" && k !== "prototype";
function cleanItem(x, i, pre) {
  if (!x || typeof x !== "object") return null;
  const id = typeof x.id === "string" && safeKey(x.id) ? x.id : pre + i;
  return { id, cap: cleanStr(x.cap, 80), nombre: cleanStr(x.nombre, 200) || "Partida", unidad: UNITS.includes(x.unidad) ? x.unidad : "ud", precio: cleanNum(x.precio) };
}
function cleanCatalog(arr) {
  if (!Array.isArray(arr)) return null;
  const out = arr.slice(0, 500).map((p, i) => {
    const c = cleanItem(p, i, "x-p" + i + "-"); if (!c) return null;
    c.hijos = (Array.isArray(p.hijos) ? p.hijos.slice(0, 50) : []).map((h, j) => cleanItem(h, j, c.id + "-h")).filter(Boolean).map(h => (delete h.cap, h));
    return c;
  }).filter(Boolean);
  return out.length ? out : null;
}
function cleanSel(o) {
  const out = {};
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) if (safeKey(k) && v && typeof v === "object") out[k] = { on: !!v.on, qty: cleanNum(v.qty), linked: v.linked !== false };
  return out;
}
// Secciones guardadas; los presupuestos antiguos (un único sel) se convierten en una sola sección sin nombre.
function cleanSecs(arr, legacySel) {
  const seen = new Set();
  const out = (Array.isArray(arr) ? arr.slice(0, 40) : []).filter(x => x && typeof x === "object").map(x => {
    let id = typeof x.id === "string" && safeKey(x.id) && !seen.has(x.id) ? x.id : "s" + uid();
    seen.add(id);
    return { id, nombre: cleanStr(x.nombre, 80), sel: cleanSel(x.sel) };
  });
  return out.length ? out : [{ id: "s" + uid(), nombre: "", sel: cleanSel(legacySel) }];
}
function cleanBudget(b) {
  if (!b || typeof b !== "object") return null;
  const secs = cleanSecs(b.secs, b.sel);
  return { cliente: cleanStr(b.cliente, 200), obra: cleanStr(b.obra, 300), fecha: cleanStr(b.fecha, 40), gg: cleanNum(b.gg), base: cleanNum(b.base), total: cleanNum(b.total),
    created: cleanNum(b.created), updated: cleanNum(b.updated), secs,
    lineas: (Array.isArray(b.lineas) ? b.lineas.slice(0, 1000) : []).filter(l => l && typeof l === "object").map(l => ({ cap: cleanStr(l.cap, 80), child: !!l.child, nombre: cleanStr(l.nombre, 200), precio: cleanNum(l.precio), qty: cleanNum(l.qty), unidad: UNITS.includes(l.unidad) ? l.unidad : "ud", sid: typeof l.sid === "string" && safeKey(l.sid) ? l.sid : "", sec: cleanStr(l.sec, 80) })) };
}
function cleanSaved(o) {
  const out = {};
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (!safeKey(k)) continue; const b = cleanBudget(v); if (b) out[k] = b; }
  return out;
}
const num = v => { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) && n >= 0 ? n : 0; };

function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, 2200); }

// ---------- persistencia ----------
function loadDraft() {
  try {
    const d = JSON.parse(localStorage.getItem("presu-draft") || "null");
    if (d && typeof d === "object") Object.assign(draft, { secs: cleanSecs(d.secs, d.sel), cur: typeof d.cur === "string" ? d.cur : null, cliente: cleanStr(d.cliente, 200), obra: cleanStr(d.obra, 300), fecha: cleanStr(d.fecha, 40) || draft.fecha, gg: cleanNum(d.gg), seeded: !!d.seeded, created: cleanNum(d.created) || undefined, docId: typeof d.docId === "string" && safeKey(d.docId) ? d.docId : null });
  } catch (e) {}
  try { const c = cleanCatalog(JSON.parse(localStorage.getItem("presu-cat") || "null")); if (c) catalog = c; } catch (e) {}
  try { const k = localStorage.getItem("presu-clausula"); if (k !== null) clausula = cleanStr(k, 4000); } catch (e) {}
}
function saveDraft() { try { localStorage.setItem("presu-draft", JSON.stringify(draft)); } catch (e) {} if (draft.docId) scheduleBudgetSave(); else renderDocState(); }
let saveTimer = null, saving = false, pending = false;
function setSaveState(s) { $("save-state").textContent = s; }
function scheduleCatalogSave() {
  try { localStorage.setItem("presu-cat", JSON.stringify(catalog)); localStorage.setItem("presu-clausula", clausula); } catch (e) {}
  if (!db) { setSaveState("Guardado en este dispositivo"); return; }
  setSaveState("Guardando…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushCatalog, 700);
}
async function flushCatalog() {
  if (saving) { pending = true; return; }
  saving = true;
  try { await db.doc(CAT_DOC).set({ partidas: catalog, clausula, updated: Date.now() }); setSaveState("Catálogo guardado"); }
  catch (e) { setSaveState("No se pudo guardar en la nube; queda guardado en este navegador"); }
  saving = false;
  if (pending) { pending = false; flushCatalog(); }
}
async function connectDb() {
  try {
    db = null; // la app guarda en el dispositivo (localStorage)
    if (!db) { setSaveState("Guardado en este dispositivo"); return; }
    const snap = await db.doc(CAT_DOC).get();
    const remote = snap.exists ? snap.data()?.partidas : null;
    if (Array.isArray(remote) && remote.length) {
      catalog = remote;
      if (typeof snap.data().clausula === "string") { clausula = snap.data().clausula; try { localStorage.setItem("presu-clausula", clausula); } catch (e) {} }
      else db.doc(CAT_DOC).set({ partidas: catalog, clausula, updated: Date.now() }).catch(() => {});
      renderClause();
      try { localStorage.setItem("presu-cat", JSON.stringify(catalog)); } catch (e) {}
      renderAll();
    } else {
      await db.doc(CAT_DOC).set({ partidas: catalog, clausula, updated: Date.now() });
    }
    setSaveState("Catálogo sincronizado");
    if (!$("view-list").hidden) renderList();
  } catch (e) { db = null; setSaveState("Guardado en este dispositivo"); }
}

// ---------- cálculo ----------
function curSec() { return draft.secs.find(x => x.id === draft.cur) || draft.secs[0]; }
const S = () => curSec().sel;
// hay secciones "de verdad" cuando hay más de una o la única tiene nombre; si no, el presupuesto se ve como siempre
const multi = () => draft.secs.length > 1 || !!(draft.secs[0].nombre || "").trim();
const secName = (x, i = draft.secs.indexOf(x)) => (x.nombre || "").trim() || "Sección " + (i + 1);
function sel(id) { const m = S(); return m[id] || (m[id] = { on: false, qty: 0, linked: true }); }
function computeLines() {
  const out = [];
  draft.secs.forEach((x, i) => {
    const m = x.sel, sec = secName(x, i);
    for (const p of catalog) {
      const s = m[p.id];
      if (!s || !s.on) continue;
      out.push({ nombre: p.nombre, unidad: p.unidad, qty: num(s.qty), precio: num(p.precio), cap: p.cap, sid: x.id, sec });
      for (const h of p.hijos || []) {
        const hs = m[h.id];
        if (hs && hs.on) out.push({ nombre: h.nombre, unidad: h.unidad, qty: num(hs.qty), precio: num(h.precio), cap: p.cap, child: true, sid: x.id, sec });
      }
    }
  });
  return out;
}
// agrupa las líneas por sección y capítulo, conservando el orden
function groupLines(lines) {
  const secs = [];
  for (const l of lines) {
    let g = secs[secs.length - 1];
    if (!g || g.sid !== l.sid) secs.push(g = { sid: l.sid, sec: l.sec, total: 0, caps: [] });
    let c = g.caps[g.caps.length - 1];
    if (!c || c.cap !== l.cap) g.caps.push(c = { cap: l.cap, total: 0, lines: [] });
    const t = l.qty * l.precio; c.lines.push(l); c.total += t; g.total += t;
  }
  return secs;
}
function updateTotals() {
  const lines = computeLines();
  let sum = 0;
  const caps = {}, secT = {}, cs = curSec().id;
  lines.forEach(l => { const t = l.qty * l.precio; sum += t; secT[l.sid] = (secT[l.sid] || 0) + t; if (l.sid === cs) caps[l.cap] = (caps[l.cap] || 0) + t; });
  const gg = sum * num(draft.gg) / 100;
  const base = sum + gg;
  const iva = base * IVA / 100;
  $("t-sum").textContent = eur(sum);
  $("t-ggv").textContent = eur(gg);
  $("t-base").textContent = eur(base);
  $("t-ivav").textContent = eur(iva);
  $("t-total").textContent = eur(base + iva);
  const groups = groupLines(lines);
  $("lines").innerHTML = !groups.length ? `<div class="empty">Marca alguna partida para empezar.</div>`
    : multi() ? groups.map(g => `<div class="sec-sum"><span>${esc(g.sec)}</span><span>${eur(g.total)}</span></div>` + g.caps.map(c => `<div class="sec-cap"><span>${esc(c.cap || "Sin capítulo")}</span><span>${eur(c.total)}</span></div>`).join("")).join("")
    : groups[0].caps.map(c => `<div><span>${esc(c.cap || "Sin capítulo")}</span><span>${eur(c.total)}</span></div>`).join("");
  document.querySelectorAll("[data-secsum]").forEach(el => el.textContent = eur(secT[el.dataset.secsum] || 0));
  document.querySelectorAll("[data-capsum]").forEach(el => el.textContent = caps[el.dataset.capsum] ? eur(caps[el.dataset.capsum]) : "");
  document.querySelectorAll("[data-sub]").forEach(el => {
    const id = el.dataset.sub, item = findItem(id), s = S()[id];
    el.textContent = s && s.on ? eur(num(s.qty) * num(item.precio)) : "—";
  });
  return { lines, sum, gg, base, iva };
}
function findItem(id) {
  for (const p of catalog) { if (p.id === id) return p; for (const h of p.hijos || []) if (h.id === id) return h; }
  return null;
}
function parentOf(id) { return catalog.find(p => (p.hijos || []).some(h => h.id === id)); }

// ---------- vista presupuesto ----------
function rowHtml(item, child) {
  const s = sel(item.id);
  return `<div class="row ${child ? "child" : ""} ${s.on ? "" : "off"}">
    <input type="checkbox" id="c-${esc(item.id)}" data-check="${esc(item.id)}" ${s.on ? "checked" : ""}>
    <div class="name"><label for="c-${esc(item.id)}">${esc(item.nombre)}</label></div>
    <input class="qty" type="number" inputmode="decimal" min="0" step="0.01" id="q-${esc(item.id)}" data-qty="${esc(item.id)}" value="${esc(cleanNum(s.qty) || "")}" placeholder="0" aria-label="Cantidad en ${esc(item.unidad)}" ${s.on ? "" : "disabled"}>
    <div class="price">${eur(num(item.precio))}/<span class="unit">${esc(item.unidad)}</span></div>
    <div class="sub-total" data-sub="${esc(item.id)}">—</div>
  </div>`;
}
function renderSecbar() {
  const cs = curSec(), n = draft.secs.length;
  $("secbar").innerHTML = `<div class="sec-head"><span class="fieldlabel">Secciones del presupuesto</span>
      <span class="sec-help">${multi() ? "Cada sección tiene sus propias partidas y su subtotal." : "Divide el presupuesto por estancias: cuarto de baño, cocina, salón…"}</span></div>
    <div class="sec-tabs" role="tablist" aria-label="Secciones">${draft.secs.map((x, i) => `
      <button class="sec-tab" role="tab" data-sec="${esc(x.id)}" aria-selected="${x.id === cs.id}"><span class="sec-no">${String(i + 1).padStart(2, "0")}</span><span class="sec-nm" data-secname="${esc(x.id)}">${esc(secName(x, i))}</span><span class="sec-amt" data-secsum="${esc(x.id)}"></span></button>`).join("")}
      <button class="btn ghost" id="sec-add">+ Añadir sección</button>
    </div>
    <div class="sec-edit">
      <label>Nombre de la sección<input type="text" id="sec-name" list="sec-list" maxlength="80" value="${esc(cs.nombre)}" placeholder="${esc(n > 1 ? "Ej.: Cuarto de baño" : "Ej.: Cuarto de baño (opcional)")}"></label>
      <datalist id="sec-list">${SEC_SUGGEST.map(x => `<option value="${esc(x)}">`).join("")}</datalist>
      ${n > 1 ? `<span id="sec-del-slot"><button class="btn danger" id="sec-del">Eliminar sección</button></span>` : ""}
    </div>`;
}
$("secbar").addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.sec) { draft.cur = t.dataset.sec; saveDraft(); renderPresupuesto(); return; }
  if (t.id === "sec-add") {
    if (draft.secs.length >= 40) { toast("Máximo 40 secciones"); return; }
    const x = newSec(); draft.secs.push(x); draft.cur = x.id; saveDraft(); renderPresupuesto();
    const inp = $("sec-name"); inp.focus(); toast("Sección añadida: ponle nombre y marca sus partidas");
    return;
  }
  if (t.id === "sec-del") {
    const x = curSec(), has = Object.values(x.sel).some(v => v.on);
    const del = () => { const i = draft.secs.indexOf(x); draft.secs.splice(i, 1); draft.cur = draft.secs[Math.max(0, i - 1)].id; saveDraft(); renderPresupuesto(); toast("Sección eliminada"); };
    if (!has) { del(); return; }
    $("sec-del-slot").innerHTML = `<span class="confirm">¿Eliminar «${esc(secName(x))}» y sus partidas? <button class="btn danger" data-secyes="1">Eliminar</button><button class="btn" data-secno="1">Cancelar</button></span>`;
    return;
  }
  if (t.dataset.secyes) { const x = curSec(), i = draft.secs.indexOf(x); draft.secs.splice(i, 1); draft.cur = draft.secs[Math.max(0, i - 1)].id; saveDraft(); renderPresupuesto(); toast("Sección eliminada"); return; }
  if (t.dataset.secno) renderSecbar(), updateTotals();
});
$("secbar").addEventListener("input", e => {
  if (e.target.id !== "sec-name") return;
  const x = curSec(); x.nombre = e.target.value.slice(0, 80);
  const el = document.querySelector(`[data-secname="${CSS.escape(x.id)}"]`); if (el) el.textContent = secName(x);
  saveDraft(); updateTotals();
});
function renderPresupuesto() {
  if (!draft.secs.some(x => x.id === draft.cur)) draft.cur = draft.secs[0].id;
  renderSecbar();
  const caps = [];
  catalog.forEach(p => { if (!caps.includes(p.cap)) caps.push(p.cap); });
  $("chapters").innerHTML = caps.map((c, ci) => `<div class="chapter"><h2><span><span class="no">${String(ci + 1).padStart(2, "0")}</span>${esc(c || "Sin capítulo")}</span><span data-capsum="${esc(c)}"></span></h2><div class="items">${
    catalog.filter(p => p.cap === c).map(p => rowHtml(p, false) + (sel(p.id).on ? (p.hijos || []).map(h => rowHtml(h, true)).join("") : "")).join("")
  }</div></div>`).join("") || `<p class="hint">El catálogo está vacío. Añade partidas en la pestaña Catálogo.</p>`;
  updateTotals();
}
$("chapters").addEventListener("change", e => {
  const id = e.target.dataset.check;
  if (!id) return;
  const s = sel(id);
  s.on = e.target.checked;
  const item = findItem(id), par = parentOf(id);
  if (s.on && !num(s.qty)) {
    // sub-opción: hereda la medición de la partida principal si comparten unidad
    if (par && par.unidad === item.unidad) { s.qty = sel(par.id).qty; s.linked = true; }
  }
  saveDraft();
  renderPresupuesto();
  if (s.on) { const q = $("q-" + id); if (q && !num(s.qty)) q.focus(); }
});
$("chapters").addEventListener("input", e => {
  const id = e.target.dataset.qty;
  if (!id) return;
  const s = sel(id);
  s.qty = e.target.value;
  const p = catalog.find(x => x.id === id);
  if (p) {
    for (const h of p.hijos || []) {
      const hs = sel(h.id);
      if (h.unidad === p.unidad && hs.linked) { hs.qty = s.qty; const q = $("q-" + h.id); if (q) q.value = s.qty; }
    }
  } else { s.linked = false; }
  saveDraft();
  updateTotals();
});

["cliente", "obra", "fecha"].forEach(k => $("m-" + k).addEventListener("input", e => { draft[k] = e.target.value; saveDraft(); }));
$("t-gg").addEventListener("input", e => { draft.gg = e.target.value; saveDraft(); updateTotals(); });

$("copy").addEventListener("click", () => {
  const { lines, sum, gg, base, iva } = updateTotals();
  if (!lines.length) { toast("No hay partidas marcadas"); return; }
  const L = [];
  L.push("AREA INTERIORES · PRESUPUESTO DE REFORMA");
  if (draft.cliente) L.push("Cliente: " + draft.cliente);
  if (draft.obra) L.push("Obra: " + draft.obra);
  if (draft.fecha) L.push("Fecha: " + draft.fecha);
  L.push("");
  const groups = groupLines(lines), many = multi();
  groups.forEach(g => {
    if (many) L.push("=== " + g.sec.toUpperCase() + " ===");
    g.caps.forEach(c => {
      L.push("— " + (c.cap || "Sin capítulo").toUpperCase());
      c.lines.forEach(l => L.push(`${l.child ? "   · " : " · "}${l.nombre}: ${String(l.qty).replace(".", ",")} ${l.unidad} × ${eur(l.precio)} = ${eur(l.qty * l.precio)}`));
    });
    if (many) { L.push(`Subtotal ${g.sec}: ${eur(g.total)}`); L.push(""); }
  });
  if (!many) L.push("");
  L.push("Suma de partidas: " + eur(sum));
  if (gg) L.push(`Gastos generales y beneficio (${draft.gg} %): ${eur(gg)}`);
  L.push("Base imponible: " + eur(base));
  L.push(`IVA (${IVA} %): ${eur(iva)}`);
  L.push("TOTAL: " + eur(base + iva));
  if (clausula.trim()) { L.push(""); L.push("Condiciones: " + clausula.trim()); }
  const text = L.join("\n");
  const fallback = () => { const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast("Presupuesto copiado"); } catch (e) { toast("No se pudo copiar"); } ta.remove(); };
  try { navigator.clipboard.writeText(text).then(() => toast("Presupuesto copiado"), fallback); } catch (e) { fallback(); }
});

// ---------- PDF para el cliente ----------
async function makePdf() {
  const { lines, sum, gg, base, iva } = updateTotals();
  if (!lines.length) { toast("No hay partidas marcadas"); return; }
  if (!window.jspdf) { toast("No se pudo cargar el generador de PDF. Recarga la página."); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 18, R = W - M;
  const ink = [35, 34, 31], muted = [116, 112, 106], oak = [139, 107, 69], line = [228, 223, 214];
  const money = n => eur(n).replace(/ /g, " ");
  const qtyTxt = q => String(Math.round(q * 100) / 100).replace(".", ",");
  // cabecera centrada
  const gold = [201, 167, 124], cream = [243, 239, 232], soft = [181, 173, 161];
  let serif = "times", serifIt = "times";
  try {
    doc.addFileToVFS("cg-medium.ttf", PDF_FONTS.medium); doc.addFont("cg-medium.ttf", "Cormorant", "normal");
    doc.addFileToVFS("cg-italic.ttf", PDF_FONTS.italic); doc.addFont("cg-italic.ttf", "CormorantItalic", "normal");
    serif = "Cormorant"; serifIt = "CormorantItalic";
  } catch (e) {}
  const C = W / 2;
  const spaced = (t, yy, cs) => { const w = doc.getTextWidth(t) + cs * (t.length - 1); doc.text(t, C - w / 2, yy, { charSpace: cs }); };
  doc.setFillColor(...ink); doc.rect(0, 0, W, 54, "F");
  doc.setDrawColor(...gold); doc.setLineWidth(0.2); doc.line(M, 50, R, 50);
  doc.setFont(serif, "normal"); doc.setFontSize(22); doc.setTextColor(...cream);
  const a = "AREA", b = "INTERIORES", cs = 2.6;
  const wa = doc.getTextWidth(a) + cs * (a.length - 1), gap = 6, wb = doc.getTextWidth(b) + cs * (b.length - 1);
  const x0 = C - (wa + gap + wb) / 2;
  doc.text(a, x0, 18, { charSpace: cs }); doc.setTextColor(...gold); doc.text(b, x0 + wa + gap, 18, { charSpace: cs });
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...soft);
  spaced("CONSTRUCCIÓN Y REFORMAS", 24.5, 1.4);
  doc.setDrawColor(...gold); doc.setLineWidth(0.3); doc.line(C - 8, 29, C + 8, 29);
  doc.setFont(serifIt, "normal"); doc.setFontSize(19); doc.setTextColor(...gold);
  doc.text("Presupuesto de reforma", C, 38.5, { align: "center" });
  const fecha = draft.fecha || new Date().toLocaleDateString("es-ES");
  const nro = "P-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + String(new Date().getHours()).padStart(2, "0") + String(new Date().getMinutes()).padStart(2, "0");
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...soft);
  doc.text("Nº " + nro + "   ·   " + fecha, C, 45, { align: "center" });
  // datos del cliente
  let y = 66;
  doc.setTextColor(...muted); doc.setFontSize(7.5);
  doc.text("CLIENTE", M, y, { charSpace: 0.8 }); doc.text("OBRA", 110, y, { charSpace: 0.8 });
  doc.setTextColor(...ink); doc.setFontSize(10.5);
  const cl = doc.splitTextToSize(draft.cliente || "—", 85), ob = doc.splitTextToSize(draft.obra || "—", 82);
  doc.text(cl, M, y + 6); doc.text(ob, 110, y + 6);
  y += 8 + Math.max(cl.length, ob.length) * 5;
  // tabla
  const cols = { desc: M, qty: 128, ud: 140, pre: 168, imp: R };
  const header = () => {
    doc.setDrawColor(...ink); doc.setLineWidth(0.4); doc.line(M, y, R, y); y += 5;
    doc.setFontSize(7.5); doc.setTextColor(...muted); doc.setFont("helvetica", "bold");
    doc.text("DESCRIPCIÓN", cols.desc, y); doc.text("CANT.", cols.qty, y, { align: "right" }); doc.text("UD", cols.ud, y);
    doc.text("PRECIO", cols.pre, y, { align: "right" }); doc.text("IMPORTE", cols.imp, y, { align: "right" });
    doc.setFont("helvetica", "normal"); y += 3; doc.setDrawColor(...line); doc.setLineWidth(0.2); doc.line(M, y, R, y); y += 5;
  };
  const room = need => { if (y + need > 272) { doc.addPage(); y = 20; header(); } };
  header();
  const groups = groupLines(lines), many = multi();
  for (const [gi, g] of groups.entries()) {
  if (many) {
    room(26);
    if (gi) y += 3;
    doc.setFillColor(...cream); doc.rect(M, y - 5.5, R - M, 9, "F");
    doc.setFillColor(...gold); doc.rect(M, y - 5.5, 1.2, 9, "F");
    doc.setFont(serif, "normal"); doc.setFontSize(13); doc.setTextColor(...ink);
    doc.text(g.sec, M + 5, y + 0.6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...oak);
    doc.text("SECCIÓN " + String(gi + 1).padStart(2, "0"), R - 3, y + 0.4, { align: "right", charSpace: 0.6 });
    y += 10;
  }
  let capNo = 0;
  for (const c of g.caps) {
    capNo++; room(12);
    y += 1; doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...oak);
    doc.text(String(capNo).padStart(2, "0") + "   " + (c.cap || "Sin capítulo").toUpperCase(), M, y, { charSpace: 0.6 });
    doc.setFont("helvetica", "normal"); y += 6;
  for (const l of c.lines) {
    doc.setFontSize(l.child ? 8.5 : 9.5); doc.setTextColor(...(l.child ? muted : ink));
    const indent = l.child ? 5 : 0;
    const d = doc.splitTextToSize((l.child ? "- " : "") + l.nombre, cols.qty - 16 - M - indent);
    room(d.length * 4.4 + 2);
    doc.text(d, M + indent, y);
    doc.setTextColor(...ink);
    doc.text(qtyTxt(l.qty), cols.qty, y, { align: "right" });
    doc.text(l.unidad, cols.ud, y);
    doc.text(money(l.precio), cols.pre, y, { align: "right" });
    doc.text(money(l.qty * l.precio), cols.imp, y, { align: "right" });
    y += d.length * 4.4 + 2.2;
  }
  }
  if (many) {
    room(10);
    doc.setDrawColor(...line); doc.setLineWidth(0.2); doc.line(120, y - 1, R, y - 1); y += 3.5;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...ink);
    doc.text("Subtotal " + g.sec, 120, y); doc.text(money(g.total), R, y, { align: "right" });
    doc.setFont("helvetica", "normal"); y += 7;
  }
  }
  // totales
  room(48 + (many ? groups.length * 6 + 10 : 0));
  y += 2; doc.setDrawColor(...line); doc.line(M, y, R, y); y += 8;
  if (many) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...oak);
    doc.text("RESUMEN POR SECCIONES", 120, y, { charSpace: 0.6 }); y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...muted);
    for (const g of groups) { doc.text(doc.splitTextToSize(g.sec, 52)[0], 120, y); doc.text(money(g.total), R, y, { align: "right" }); y += 5.5; }
    doc.setDrawColor(...line); doc.line(120, y - 2, R, y - 2); y += 4;
  }
  const tx = 120;
  const tot = (label, val, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(10); doc.setTextColor(...ink);
    doc.text(label, tx, y); doc.text(val, R, y, { align: "right" }); y += 6.5;
  };
  tot("Suma de partidas", money(sum));
  if (gg) tot(`Gastos generales y beneficio (${String(draft.gg).replace(".", ",")} %)`, money(gg));
  tot("BASE IMPONIBLE", money(base), true);
  tot(`IVA (${IVA} %)`, money(iva), true);
  y += 1; doc.setFillColor(...ink); doc.rect(tx - 4, y - 5, R - tx + 4 + 0.01, 11, "F");
  doc.setTextColor(243, 239, 232); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
  doc.text("TOTAL", tx, y + 2); doc.setFont(serif, "normal"); doc.setFontSize(15); doc.setTextColor(...gold); doc.text(money(base + iva), R - 2, y + 2.4, { align: "right" });
  y += 18;
  if (clausula.trim()) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
    const cl = doc.splitTextToSize(clausula.trim(), R - M);
    room(cl.length * 4 + 10);
    doc.setDrawColor(...oak); doc.setLineWidth(0.3); doc.line(M, y - 4, M + 14, y - 4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...oak);
    doc.text("CONDICIONES DEL PRESUPUESTO", M, y + 1, { charSpace: 0.6 });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...muted);
    doc.text(cl, M, y + 6.5);
  }
  // pie
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...muted);
    doc.text("Area Interiores · Presupuesto " + nro, M, 289);
    doc.text(`Página ${i} de ${pages}`, R, 289, { align: "right" });
  }
  const safe = (draft.cliente || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "cliente";
  const filename = `Presupuesto-Area-Interiores-${safe}.pdf`;
  const blob = doc.output("blob");
  await deliverFile(blob, filename, "application/pdf", "Presupuesto " + (draft.cliente || ""));
}
$("pdf").addEventListener("click", makePdf);

// ---------- presupuestos guardados ----------
const BUD_COL = "presupuestos";
let budList = [];
const localSaved = () => { try { return cleanSaved(JSON.parse(localStorage.getItem("presu-saved") || "{}")); } catch (e) { return {}; } };
const store = {
  async list() {
    if (db) { const q = await db.collection(BUD_COL).orderBy("updated", "desc").get(); return q.docs.map(d => Object.assign({ id: d.id }, d.data())); }
    return Object.entries(localSaved()).map(([id, d]) => Object.assign({ id }, d)).sort((a, b) => b.updated - a.updated);
  },
  async get(id) {
    if (db) { const d = await db.doc(BUD_COL + "/" + id).get(); return d.exists ? d.data() : null; }
    return localSaved()[id] || null;
  },
  async put(id, data) {
    if (db) return db.doc(BUD_COL + "/" + id).set(data);
    const all = localSaved(); all[id] = data; localStorage.setItem("presu-saved", JSON.stringify(all));
  },
  async del(id) {
    if (db) return db.doc(BUD_COL + "/" + id).delete();
    const all = localSaved(); delete all[id]; localStorage.setItem("presu-saved", JSON.stringify(all));
  }
};
function budgetData() {
  const t = updateTotals();
  const secs = draft.secs.map(x => {
    const sel = {};
    for (const [k, v] of Object.entries(x.sel)) if (v.on || num(v.qty)) sel[k] = { on: !!v.on, qty: v.qty === undefined ? 0 : v.qty, linked: v.linked !== false };
    return { id: x.id, nombre: x.nombre || "", sel };
  });
  return {
    cliente: draft.cliente || "", obra: draft.obra || "", fecha: draft.fecha || "", gg: num(draft.gg), secs,
    lineas: t.lines.map(l => ({ cap: l.cap, nombre: l.nombre, unidad: l.unidad, qty: l.qty, precio: l.precio, child: !!l.child, sid: l.sid, sec: multi() ? l.sec : "" })),
    base: Math.round(t.base * 100) / 100, total: Math.round((t.base + t.iva) * 100) / 100,
    created: draft.created || Date.now(), updated: Date.now()
  };
}
let budTimer = null, budSaving = false, budPending = false, budState = "";
function renderDocState() {
  const el = $("doc-state"); if (!el) return;
  $("tb-note").textContent = budList.length ? `${budList.length} presupuesto${budList.length === 1 ? "" : "s"} guardado${budList.length === 1 ? "" : "s"}` : "";
  if (draft.docId) {
    el.innerHTML = `<span class="pill ok">Guardado</span>Cliente: <b>${esc(draft.cliente || "sin nombre")}</b>${budState ? " · " + esc(budState) : ""}`;
    $("save-b").hidden = true;
  } else {
    el.innerHTML = `<span class="pill">Sin guardar</span>Guarda el presupuesto para poder abrirlo más tarde.`;
    $("save-b").hidden = false;
  }
}
function scheduleBudgetSave() {
  budState = "guardando…"; renderDocState();
  clearTimeout(budTimer); budTimer = setTimeout(flushBudget, 1200);
}
async function flushBudget() {
  if (!draft.docId) return;
  if (budSaving) { budPending = true; return; }
  budSaving = true;
  try { await store.put(draft.docId, budgetData()); budState = "cambios guardados"; }
  catch (e) { budState = "no se pudo guardar, se reintentará con el próximo cambio"; }
  budSaving = false; renderDocState();
  if (budPending) { budPending = false; flushBudget(); }
}
$("save-b").addEventListener("click", async () => {
  if (!(draft.cliente || "").trim()) { toast("Escribe el nombre del cliente para guardar"); $("m-cliente").focus(); return; }
  draft.docId = "p" + Date.now().toString(36) + uid();
  draft.created = Date.now();
  try { await store.put(draft.docId, budgetData()); saveDraft(); budState = ""; budList = await store.list().catch(() => budList); renderDocState(); toast("Presupuesto guardado"); }
  catch (e) { draft.docId = null; renderDocState(); toast("No se pudo guardar el presupuesto"); }
});
function remapSecs(b) {
  const secs = cleanSecs(b.secs, b.sel), all = b.lineas || [];
  const legacy = !(Array.isArray(b.secs) && b.secs.length);
  return secs.map((x, i) => ({ id: x.id, nombre: x.nombre, sel: remapSel(x.sel, legacy ? all : all.filter(l => l.sid ? l.sid === x.id : i === 0)) }));
}
function remapSel(src, lines) {
  const sel = {};
  for (const [k, v] of Object.entries(src || {})) if (findItem(k)) sel[k] = Object.assign({}, v);
  const found = Object.values(sel).filter(v => v.on).length;
  if (lines.length && found < lines.length) {
    // partidas guardadas con ids antiguos: se recuperan por nombre
    let par = null, parQty = 0;
    for (const l of lines) {
      let it = null;
      if (!l.child) { it = catalog.find(p => p.nombre === l.nombre && p.cap === l.cap) || catalog.find(p => p.nombre === l.nombre); par = it; parQty = l.qty; }
      else if (par) it = (par.hijos || []).find(h => h.nombre === l.nombre);
      if (it && !(sel[it.id] && sel[it.id].on)) sel[it.id] = { on: true, qty: l.qty, linked: !l.child || (it.unidad === par.unidad && l.qty === parQty) };
    }
  }
  return sel;
}
function applyBudget(id, b, quiet) {
  const secs = remapSecs(b);
  draft = { secs, cur: secs[0].id, cliente: b.cliente || "", obra: b.obra || "", fecha: b.fecha || "", iva: "21", gg: b.gg || 0, docId: id, created: b.created, seeded: true };
  fillMeta();
  try { localStorage.setItem("presu-draft", JSON.stringify(draft)); } catch (e) {}
  budState = "";
  if (quiet) { renderAll(); renderDocState(); return; }
  show("pres");
  const missing = (b.lineas || []).length - computeLines().length;
  if (missing > 0) toast(`${missing} partida(s) ya no están en el catálogo`);
}
function newBudget() {
  const x = newSec();
  draft = { secs: [x], cur: x.id, cliente: "", obra: "", fecha: new Date().toLocaleDateString("es-ES"), iva: "21", gg: 0, docId: null, seeded: true };
  fillMeta(); saveDraft(); renderPresupuesto();
}
function fillMeta() { $("m-cliente").value = draft.cliente; $("m-obra").value = draft.obra; $("m-fecha").value = draft.fecha; $("t-gg").value = draft.gg; }
const ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "ahora mismo"; if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
  return new Date(t).toLocaleDateString("es-ES");
};
async function renderList() {
  $("list").innerHTML = `<div class="bl"><div class="bl-empty">Cargando presupuestos…</div></div>`;
  try { budList = await store.list(); } catch (e) { $("list").innerHTML = `<div class="bl"><div class="bl-empty">No se pudieron cargar los presupuestos. Recarga la página.</div></div>`; return; }
  drawList();
}
function drawList() {
  const q = ($("list-q").value || "").toLowerCase().trim();
  const rows = budList.filter(b => !q || (b.cliente + " " + b.obra).toLowerCase().includes(q));
  $("list").innerHTML = `<div class="bl">${rows.length ? rows.map(b => `
    <div class="bl-row ${b.id === draft.docId ? "current" : ""}" data-b="${esc(b.id)}">
      <div class="who">${esc(b.cliente || "Sin nombre")}${b.id === draft.docId ? ' <span class="pill">Abierto</span>' : ""}</div>
      <div class="what">${esc(b.obra || "—")}<br><span class="when">${esc(b.fecha || "")} · ${(b.secs || []).length > 1 ? b.secs.length + " secciones · " : ""}${(b.lineas || []).length} partidas · editado ${ago(b.updated)}</span></div>
      <div class="when">Base ${eur(b.base || 0)}</div>
      <div class="amt">${eur(b.total || 0)}</div>
      <div class="acts" id="acts-${esc(b.id)}">
        <button class="btn primary" data-open="${esc(b.id)}">Abrir</button>
        <button class="btn" data-dup="${esc(b.id)}">Duplicar</button>
        <button class="btn ghost danger" data-delb="${esc(b.id)}">Eliminar</button>
      </div>
    </div>`).join("") : `<div class="bl-empty">${budList.length ? "Ningún presupuesto coincide con la búsqueda." : "Aún no hay presupuestos guardados. Crea uno en la pestaña Presupuesto y pulsa «Guardar presupuesto»."}</div>`}</div>`;
}
$("list-q").addEventListener("input", drawList);
$("load-b").addEventListener("click", () => { show("list"); window.scrollTo({ top: 0 }); $("list-q").focus(); });
$("list").addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  const b = budList.find(x => x.id === (t.dataset.open || t.dataset.dup || t.dataset.delb || t.dataset.yes));
  if (!b) return;
  const slot = $("acts-" + b.id);
  if (t.dataset.open) {
    if (!draft.docId && computeLines().length && !t.dataset.force) {
      slot.innerHTML = `<span class="confirm">El presupuesto en curso no está guardado. <button class="btn danger" data-open="${esc(b.id)}" data-force="1">Abrir igualmente</button><button class="btn" data-cancel="1">Cancelar</button></span>`;
      return;
    }
    if (draft.docId) { clearTimeout(budTimer); await flushBudget(); }
    const fresh = await store.get(b.id).catch(() => null) || b;
    applyBudget(b.id, fresh);
    toast("Presupuesto abierto: " + (b.cliente || "sin nombre"));
  } else if (t.dataset.dup) {
    const id = "p" + Date.now().toString(36) + uid();
    const copy = Object.assign({}, b, { cliente: b.cliente + " (copia)", created: Date.now(), updated: Date.now() }); delete copy.id;
    try { await store.put(id, copy); toast("Presupuesto duplicado"); renderList(); } catch (err) { toast("No se pudo duplicar"); }
  } else if (t.dataset.delb && !t.dataset.yes) {
    slot.innerHTML = `<span class="confirm">¿Eliminar este presupuesto? <button class="btn danger" data-delb="${esc(b.id)}" data-yes="${esc(b.id)}">Eliminar</button><button class="btn" data-cancel="1">Cancelar</button></span>`;
  } else if (t.dataset.yes) {
    try { await store.del(b.id); if (draft.docId === b.id) { draft.docId = null; saveDraft(); } toast("Presupuesto eliminado"); renderList(); } catch (err) { toast("No se pudo eliminar"); }
  }
});
$("list").addEventListener("click", e => { if (e.target.dataset && e.target.dataset.cancel) drawList(); });

function inlineConfirm(slotId, question, yesLabel, onYes, restore) {
  const slot = $(slotId);
  const original = slot.innerHTML;
  slot.innerHTML = `<span class="confirm">${question} <button class="btn danger" data-yes>${yesLabel}</button><button class="btn" data-no>Cancelar</button></span>`;
  slot.querySelector("[data-yes]").onclick = () => { slot.innerHTML = original; restore(); onYes(); };
  slot.querySelector("[data-no]").onclick = () => { slot.innerHTML = original; restore(); };
}
function bindClear() {
  $("clear").onclick = () => {
    const fresh = () => { newBudget(); toast("Nuevo presupuesto en blanco"); };
    if (!draft.docId && computeLines().length) inlineConfirm("clear-slot", "Este presupuesto no está guardado.", "Descartar", fresh, bindClear);
    else fresh();
  };
}
bindClear();

// ---------- vista catálogo ----------
function caps() { const c = []; catalog.forEach(p => { if (p.cap && !c.includes(p.cap)) c.push(p.cap); }); return c; }
function unitSel(id, val, attr) { return `<select id="${esc(id)}" ${attr} aria-label="Unidad">${UNITS.map(u => `<option ${u === val ? "selected" : ""}>${u}</option>`).join("")}</select>`; }
function renderEditor() {
  $("editor").innerHTML = `<datalist id="caplist">${caps().map(c => `<option value="${esc(c)}">`).join("")}</datalist>` + catalog.map(p => `
    <div class="ed" data-p="${esc(p.id)}">
      <div class="ed-main">
        <input type="text" id="e-cap-${esc(p.id)}" list="caplist" data-f="cap" value="${esc(p.cap)}" placeholder="Capítulo" aria-label="Capítulo">
        <input class="nm" type="text" id="e-nom-${esc(p.id)}" data-f="nombre" value="${esc(p.nombre)}" placeholder="Nombre de la partida" aria-label="Nombre de la partida">
        ${unitSel("e-uni-" + p.id, p.unidad, 'data-f="unidad"')}
        <div class="price-wrap"><input type="number" id="e-pre-${esc(p.id)}" data-f="precio" min="0" step="0.01" value="${esc(p.precio)}" aria-label="Precio por unidad"></div>
        <button class="btn ghost danger" data-del="${esc(p.id)}" aria-label="Eliminar partida">Eliminar</button>
      </div>
      <div class="ed-kids">
        ${(p.hijos || []).length ? `<span class="fieldlabel">Sub‑opciones (aparecen al marcar la partida)</span>` : ""}
        ${(p.hijos || []).map(h => `
          <div class="ed-kid" data-h="${esc(h.id)}">
            <input class="nm" type="text" id="e-nom-${esc(h.id)}" data-f="nombre" value="${esc(h.nombre)}" placeholder="Nombre de la sub‑opción" aria-label="Nombre de la sub‑opción">
            ${unitSel("e-uni-" + h.id, h.unidad, 'data-f="unidad"')}
            <div class="price-wrap"><input type="number" id="e-pre-${esc(h.id)}" data-f="precio" min="0" step="0.01" value="${esc(h.precio)}" aria-label="Precio por unidad"></div>
            <button class="btn ghost danger" data-delh="${esc(h.id)}" aria-label="Eliminar sub‑opción">✕</button>
          </div>`).join("")}
      </div>
      <div class="ed-foot"><button class="btn ghost" data-addh="${esc(p.id)}">+ Añadir sub‑opción</button></div>
    </div>`).join("");
}
$("editor").addEventListener("input", e => {
  const f = e.target.dataset.f;
  if (!f) return;
  const hEl = e.target.closest("[data-h]"), pEl = e.target.closest("[data-p]");
  const item = hEl ? findItem(hEl.dataset.h) : findItem(pEl.dataset.p);
  item[f] = f === "precio" ? num(e.target.value) : e.target.value;
  scheduleCatalogSave();
});
$("editor").addEventListener("click", e => {
  const t = e.target;
  if (t.dataset.del) { catalog = catalog.filter(p => p.id !== t.dataset.del); }
  else if (t.dataset.delh) { const par = parentOf(t.dataset.delh); par.hijos = par.hijos.filter(h => h.id !== t.dataset.delh); }
  else if (t.dataset.addh) {
    const p = findItem(t.dataset.addh); const h = { id: uid(), nombre: "", unidad: p.unidad, precio: 0 };
    (p.hijos = p.hijos || []).push(h); renderEditor(); scheduleCatalogSave(); $("e-nom-" + h.id).focus(); return;
  }
  else return;
  renderEditor(); scheduleCatalogSave();
});
$("add-p").addEventListener("click", () => {
  const p = { id: uid(), cap: catalog.length ? catalog[catalog.length - 1].cap : "General", nombre: "", unidad: "m²", precio: 0, hijos: [] };
  catalog.push(p); renderEditor(); scheduleCatalogSave();
  const el = $("e-nom-" + p.id); el.scrollIntoView({ block: "center" }); el.focus();
});
function bindReset() { $("reset").onclick = () => inlineConfirm("reset-slot", "Se perderán tus cambios del catálogo.", "Restaurar", () => { catalog = exampleCatalog(); draft.secs.forEach(x => x.sel = {}); draft.docId = null; saveDraft(); renderEditor(); scheduleCatalogSave(); toast("Catálogo de ejemplo restaurado"); }, bindReset); }
bindReset();

function renderClause() {
  $("clause-view").textContent = clausula.trim() || "Sin condiciones. Puedes escribirlas en Catálogo de partidas.";
  if (document.activeElement !== $("clausula-ed")) $("clausula-ed").value = clausula;
}
$("clausula-ed").addEventListener("input", e => { clausula = e.target.value; renderClause(); scheduleCatalogSave(); });

// ---------- pestañas ----------
function show(view) {
  ["pres", "list", "cat"].forEach(v => { $("view-" + v).hidden = v !== view; $("tab-" + v).setAttribute("aria-selected", v === view); });
  if (view === "pres") renderPresupuesto(); else if (view === "cat") renderEditor(); else renderList();
  renderDocState();
  try { localStorage.setItem("presu-tab", view); } catch (e) {}
}
$("tab-pres").onclick = () => show("pres");
$("tab-list").onclick = () => show("list");
$("tab-cat").onclick = () => show("cat");
function renderAll() { if (!$("view-cat").hidden) renderEditor(); else if (!$("view-list").hidden) renderList(); else renderPresupuesto(); }

// ---------- arranque ----------
loadDraft();
// Ejemplo de partida marcada en el primer uso, para ver la calculadora funcionando.
if (!draft.seeded && draft.secs.length === 1 && !Object.keys(S()).length) {
  draft.seeded = true;
  const pick = (re, qty, kids = {}) => {
    const p = catalog.find(x => re.test(x.nombre));
    if (!p) return;
    S()[p.id] = { on: true, qty, linked: true };
    (p.hijos || []).forEach((h, i) => { if (i in kids) S()[h.id] = { on: true, qty: kids[i], linked: h.unidad === p.unidad }; });
  };
  pick(/suelo nuevo/i, 25, { 0: 25, 1: 8, 2: 21 });
  pick(/pintura/i, 85, { 0: 85 });
  pick(/puerta de paso/i, 3, { 0: 3 });
  pick(/punto de luz/i, 6);
  if (!draft.obra) draft.obra = "Ejemplo: reforma de salón y pasillo (25 m²)";
}
fillMeta();
renderClause();
let startTab = "pres"; try { startTab = localStorage.getItem("presu-tab") || "pres"; } catch (e) {}
show(["pres", "list", "cat"].includes(startTab) ? startTab : "pres");
connectDb()
  .then(async () => {
    // recarga el presupuesto abierto desde lo guardado, para que siempre coincida con el catálogo
    if (draft.docId) { const b = await store.get(draft.docId).catch(() => null); if (b) applyBudget(draft.docId, b, true); else { draft.docId = null; saveDraft(); } }
    budList = await store.list();
    renderDocState();
  })
  .catch(() => {});
