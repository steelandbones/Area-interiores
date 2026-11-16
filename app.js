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
  // La copia lleva datos personales de clientes: por defecto se cifra con AES-GCM y una clave
  // derivada de una contraseña (PBKDF2-SHA256, 310.000 iteraciones).
  const KEYS = { cat: "presu-cat", clausula: "presu-clausula", saved: "presu-saved" };
  const MAX_BYTES = 5 * 1024 * 1024;
  const read = (k, fb) => { try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (e) { return fb; } };
  const b64 = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function keyFrom(pass, salt, iter) {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  async function encrypt(obj, pass) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 310000;
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFrom(pass, salt, iter), new TextEncoder().encode(JSON.stringify(obj)));
    return { app: "area-interiores-presupuestos", cifrado: "AES-GCM/PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv), datos: b64(new Uint8Array(ct)) };
  }
  async function decrypt(env, pass) {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, await keyFrom(pass, unb64(env.salt), Math.min(Math.max(env.iter | 0, 100000), 2000000)), unb64(env.datos));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  document.getElementById("backup-out")?.addEventListener("click", async () => {
    /* catalog y clausula son las variables del presupuestador (ámbito global del documento) */
    let cl = null; try { cl = localStorage.getItem(KEYS.clausula); } catch (e) {}
    const partidas = typeof catalog !== "undefined" ? catalog : read(KEYS.cat, []);
    if (typeof clausula !== "undefined") cl = clausula;
    const data = { app: "area-interiores-presupuestos", version: 1, exportado: new Date().toISOString(),
      catalogo: { partidas, clausula: cl }, presupuestos: read(KEYS.saved, {}) };
    const pass = prompt("La copia lleva datos de tus clientes. Escribe una contraseña para cifrarla (mínimo 8 caracteres).\nDéjalo vacío solo si quieres una copia SIN cifrar.");
    if (pass === null) return;
    let out = data;
    if (pass) {
      if (pass.length < 8) { toast("Contraseña demasiado corta: usa 8 caracteres o más"); return; }
      if (prompt("Repite la contraseña de la copia") !== pass) { toast("Las contraseñas no coinciden"); return; }
      out = await encrypt(data, pass);
    }
    const d = new Date(), pad = n => String(n).padStart(2, "0");
    const name = `copia-presupuestos-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}${pass ? "-cifrada" : ""}.json`;
    deliverFile(new Blob([JSON.stringify(out)], { type: "application/json" }), name, "application/json", "Copia de presupuestos");
  });

  const fileIn = document.getElementById("backup-file");
  document.getElementById("backup-in")?.addEventListener("click", () => fileIn && fileIn.click());
  fileIn?.addEventListener("change", async () => {
    const f = fileIn.files && fileIn.files[0]; fileIn.value = "";
    if (!f) return;
    if (f.size > MAX_BYTES) { toast("El archivo es demasiado grande para ser una copia"); return; }
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { toast("El archivo no es una copia válida"); return; }
    if (data && data.cifrado) {
      const pass = prompt("Esta copia está cifrada. Escribe su contraseña:");
      if (!pass) return;
      try { data = await decrypt(data, pass); } catch (e) { toast("Contraseña incorrecta o copia dañada"); return; }
    }
    const partidas = cleanCatalog(data && data.catalogo && data.catalogo.partidas);
    if (!partidas) { toast("La copia no trae un catálogo válido"); return; }
    const pres = cleanSaved(data.presupuestos);
    const n = Object.keys(pres).length;
    if (!confirm(`Se sustituirá el catálogo (${partidas.length} partidas) y se añadirán ${n} presupuesto(s). ¿Continuar?`)) return;
    try {
      localStorage.setItem(KEYS.cat, JSON.stringify(partidas));
      if (typeof data.catalogo.clausula === "string") localStorage.setItem(KEYS.clausula, cleanStr(data.catalogo.clausula, 4000));
      localStorage.setItem(KEYS.saved, JSON.stringify(Object.assign(cleanSaved(read(KEYS.saved, {})), pres)));
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
