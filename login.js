/* Acceso a la app en este dispositivo.
   - Acceso inicial: usuario Olga. En el código solo está su huella PBKDF2-SHA256 (310.000 iteraciones, sal aleatoria),
     nunca la contraseña.
   - Si CAMBIO_OBLIGATORIO es true, tras el primer acceso la app pide una contraseña nueva, que se guarda
     solo en este dispositivo (con la misma derivación) y no aparece en ningún sitio público.
   - Tras 5 intentos fallidos hay que esperar, y la espera crece con cada fallo.
   - "He olvidado la contraseña" borra los datos de la app en este dispositivo y vuelve al acceso inicial:
     así nadie que coja el móvil puede saltarse el acceso y quedarse con los presupuestos.
   Para cambiar el acceso inicial, genera una huella nueva (usuario en minúsculas) y sustituye ACCESO_INICIAL:
     node -e 'const c=require("crypto"),u="olga",p="NUEVA",s=c.randomBytes(16);console.log(JSON.stringify({user:u,salt:s.toString("base64"),iter:310000,hash:c.pbkdf2Sync(u+"\u0000"+p,s,310000,32,"sha256").toString("base64")}))' */
(function () {
  "use strict";
  // No permitir que otra web muestre la app dentro de un marco (clickjacking)
  if (window.top !== window.self) { document.documentElement.style.display = "none"; try { window.top.location = window.self.location.href; } catch (e) {} return; }

  const ACCESO_INICIAL = {"user":"olga","salt":"5YNGSYlqdp2tzSiX4OuDqA==","iter":310000,"hash":"Bds7p8LJDjjOb9B2hZypK9NnTjA9rQEigKPKDMMnypk="};
  const CAMBIO_OBLIGATORIO = true;
  const K = { cred: "presu-cred", sess: "presu-session", fails: "presu-fails" };
  const ITER = 310000, SESSION_DAYS = 30, MIN_LEN = 8;
  const $ = id => document.getElementById(id);
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const b64 = u8 => btoa(String.fromCharCode(...u8));
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const rand = n => crypto.getRandomValues(new Uint8Array(n));
  async function derive(user, pass, salt, iter) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(user + "\u0000" + pass), "PBKDF2", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
  }
  const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };
  const newSession = cred => { cred.session = b64(rand(24)); ls.set(K.cred, cred); ls.set(K.sess, { t: cred.session, exp: Date.now() + SESSION_DAYS * 864e5 }); };

  // limpia restos de la versión anterior (huella SHA-256 sin sal)
  ls.del("presu-auth"); try { sessionStorage.removeItem("presu-auth"); } catch (e) {}

  const form = $("login-form"), err = $("lg-err"), user = $("lg-user"), pass = $("lg-pass"), pass2 = $("lg-pass2");
  const title = $("lg-title"), sub = $("lg-sub"), go = $("lg-go"), forgot = $("lg-forgot"), wrap2 = $("lg-pass2-wrap");
  const passLabel = pass.parentElement.firstChild;
  let mode = "login", pendingUser = "";

  function paint() {
    const ch = mode === "change";
    wrap2.hidden = !ch; pass2.required = ch; forgot.hidden = ch || !ls.get(K.cred);
    user.parentElement.hidden = ch; user.required = !ch;
    title.innerHTML = ch ? "Elige tu <em>contraseña</em>" : "Presupuestador <em>de reformas</em>";
    sub.textContent = ch ? "Primer acceso en este dispositivo: crea una contraseña propia de al menos " + MIN_LEN + " caracteres. Solo se guarda en este móvil." : "Acceso privado para el equipo";
    passLabel.textContent = ch ? "Contraseña nueva" : "Contraseña";
    go.textContent = ch ? "Guardar y entrar" : "Entrar";
    pass.autocomplete = ch ? "new-password" : "current-password";
  }
  const unlock = () => document.body.classList.add("unlocked");
  const lock = () => document.body.classList.remove("unlocked");

  const c0 = ls.get(K.cred), s0 = ls.get(K.sess);
  if (c0 && s0 && s0.t === c0.session && s0.exp > Date.now()) unlock();
  paint();

  form.addEventListener("submit", async e => {
    e.preventDefault(); err.textContent = "";
    if (!window.crypto || !crypto.subtle) { err.textContent = "Este navegador no permite un acceso seguro. Abre la app con https."; return; }
    if (mode === "change") {
      const p = pass.value;
      if (p.length < MIN_LEN) { err.textContent = "Usa al menos " + MIN_LEN + " caracteres."; return; }
      if (p !== pass2.value) { err.textContent = "Las contraseñas no coinciden."; return; }
      go.disabled = true;
      const iniciales = same(await derive(pendingUser, p, unb64(ACCESO_INICIAL.salt), ACCESO_INICIAL.iter), unb64(ACCESO_INICIAL.hash));
      if (iniciales) { go.disabled = false; err.textContent = "Elige una contraseña distinta de la inicial."; return; }
      const salt = rand(16);
      const cred = { v: 1, user: pendingUser, salt: b64(salt), iter: ITER, hash: b64(await derive(pendingUser, p, salt, ITER)) };
      go.disabled = false; pass.value = pass2.value = "";
      newSession(cred); mode = "login"; paint(); unlock(); window.scrollTo({ top: 0 });
      return;
    }
    const u = user.value.trim().toLowerCase(), p = pass.value;
    const f = ls.get(K.fails) || { n: 0, until: 0 };
    if (f.until > Date.now()) { err.textContent = "Demasiados intentos. Espera " + Math.ceil((f.until - Date.now()) / 1000) + " s."; return; }
    const stored = ls.get(K.cred), cred = stored || ACCESO_INICIAL;
    go.disabled = true;
    let ok = false;
    try { ok = u === cred.user && same(await derive(u, p, unb64(cred.salt), cred.iter || ITER), unb64(cred.hash)); } catch (x) { ok = false; }
    go.disabled = false; pass.value = "";
    if (!ok) {
      f.n += 1; if (f.n >= 5) f.until = Date.now() + Math.min(30000 * 2 ** (f.n - 5), 15 * 60000);
      ls.set(K.fails, f); err.textContent = "Usuario o contraseña incorrectos."; pass.focus(); return;
    }
    ls.del(K.fails);
    if (!stored && CAMBIO_OBLIGATORIO) { pendingUser = u; mode = "change"; paint(); pass.focus(); return; }
    newSession(Object.assign({}, cred)); unlock(); window.scrollTo({ top: 0 });
  });

  forgot.addEventListener("click", () => {
    if (!confirm("Por seguridad, para recuperar el acceso se BORRAN de este dispositivo el catálogo y todos los presupuestos guardados, y vuelve el acceso inicial. Si tienes una copia, podrás importarla después. ¿Continuar?")) return;
    try { Object.keys(localStorage).filter(k => k.startsWith("presu-")).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    location.reload();
  });

  $("logout").addEventListener("click", () => {
    const cred = ls.get(K.cred); if (cred) { cred.session = b64(rand(24)); ls.set(K.cred, cred); }
    ls.del(K.sess); lock(); mode = "login"; paint(); user.focus();
  });
})();
