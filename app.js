/* Capa de app móvil: compartir/descargar archivos, copia de seguridad y funcionamiento sin conexión. */
(function () {
  "use strict";

  // ---------- entregar un archivo: compartir en el móvil, descargar en el ordenador ----------
  window.deliverFile = async function (blob, filename, type, title) {
    const file = new File([blob], filename, { type });
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: title || filename }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    if (typeof toast === "function") toast("Archivo guardado en Descargas");
  };

  // ---------- copia de seguridad (los datos viven solo en este dispositivo) ----------
  const KEYS = { cat: "presu-cat", clausula: "presu-clausula", saved: "presu-saved" };
  const read = (k, fb) => { try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (e) { return fb; } };

  document.getElementById("backup-out")?.addEventListener("click", () => {
    /* catalog y clausula son las variables del presupuestador (ámbito global del documento) */
    let cl = null; try { cl = localStorage.getItem(KEYS.clausula); } catch (e) {}
    const partidas = typeof catalog !== "undefined" ? catalog : read(KEYS.cat, []);
    if (typeof clausula !== "undefined") cl = clausula;
    const data = { app: "area-interiores-presupuestos", version: 1, exportado: new Date().toISOString(),
      catalogo: { partidas, clausula: cl }, presupuestos: read(KEYS.saved, {}) };
    const d = new Date(), pad = n => String(n).padStart(2, "0");
    const name = `copia-presupuestos-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
    deliverFile(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }), name, "application/json", "Copia de presupuestos");
  });

  const fileIn = document.getElementById("backup-file");
  document.getElementById("backup-in")?.addEventListener("click", () => fileIn && fileIn.click());
  fileIn?.addEventListener("change", async () => {
    const f = fileIn.files && fileIn.files[0]; fileIn.value = "";
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { toast("El archivo no es una copia válida"); return; }
    const partidas = data?.catalogo?.partidas;
    const pres = data?.presupuestos && typeof data.presupuestos === "object" ? data.presupuestos : {};
    if (!Array.isArray(partidas) || !partidas.length) { toast("La copia no trae catálogo"); return; }
    const n = Object.keys(pres).length;
    if (!confirm(`Se sustituirá el catálogo por el de la copia y se añadirán ${n} presupuesto(s). ¿Continuar?`)) return;
    try {
      localStorage.setItem(KEYS.cat, JSON.stringify(partidas));
      if (typeof data.catalogo.clausula === "string") localStorage.setItem(KEYS.clausula, data.catalogo.clausula);
      const saved = Object.assign(read(KEYS.saved, {}), pres);
      localStorage.setItem(KEYS.saved, JSON.stringify(saved));
    } catch (e) { toast("No hay espacio para importar la copia"); return; }
    location.reload();
  });

  // pide al navegador que no borre los datos por falta de espacio
  try { navigator.storage?.persist?.(); } catch (e) {}

  // ---------- sin conexión ----------
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then(reg => {
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw && nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller && typeof toast === "function")
              toast("Nueva versión lista: cierra y vuelve a abrir la app");
          });
        });
      }).catch(() => {});
    });
  }
})();

/* Barra de total en el móvil */
(function () {
  const bar = document.createElement("div");
  bar.className = "mbar";
  bar.innerHTML = '<div><small>Total con IVA</small><strong id="mbar-total">0,00 €</strong></div><button type="button" id="mbar-go">Ver resumen</button>';
  document.body.appendChild(bar);
  const src = document.getElementById("t-total"), out = document.getElementById("mbar-total");
  const sync = () => { if (src && out) out.textContent = src.textContent; };
  if (src) new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true });
  sync();
  document.getElementById("mbar-go").addEventListener("click", () => document.querySelector(".ticket")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  const pres = document.getElementById("view-pres");
  const mark = () => document.body.classList.toggle("on-pres", pres && !pres.hidden);
  if (pres) new MutationObserver(mark).observe(pres, { attributes: true, attributeFilter: ["hidden"] });
  mark();
})();

/* Al cambiar de pestaña en el móvil, empezar arriba */
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => { if (window.matchMedia("(max-width: 640px)").matches) window.scrollTo({ top: 0 }); }));
