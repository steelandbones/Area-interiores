# Area Interiores · Presupuestador (app móvil)

App web instalable (PWA) del presupuestador de reformas. Funciona sin conexión, se instala en la pantalla de inicio del móvil y genera el PDF para el cliente, que se puede compartir directamente por WhatsApp o correo.

## Estructura

| Archivo | Para qué sirve |
|---|---|
| `index.html` | El presupuestador (catálogo, presupuestos, PDF). |
| `app.js` | Capa móvil: compartir/descargar, copia de seguridad, barra de total, modo sin conexión. |
| `app.css` | Ajustes táctiles: cabecera compacta, pestañas abajo, textos de 16 px (sin zoom en iPhone). |
| `sw.js` | Service worker: guarda la app en el dispositivo. **Sube `VERSION` en cada cambio.** |
| `manifest.webmanifest`, `icons/` | Nombre, colores e iconos de la app instalada. |
| `fonts/`, `vendor/` | Tipografías y jsPDF incluidos en local para que todo funcione sin internet. |

## Probar en el ordenador

```bash
python3 -m http.server 8000
# abrir http://localhost:8000
```

## Publicar gratis con GitHub Pages

1. Sube esta carpeta a un repositorio de GitHub.
2. En el repositorio: *Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`*.
3. La app queda en `https://<usuario>.github.io/<repositorio>/`.

El service worker necesita HTTPS (GitHub Pages ya lo da).

## Instalar en el móvil

- **iPhone (Safari):** abrir la dirección → botón Compartir → *Añadir a pantalla de inicio*.
- **Android (Chrome):** abrir la dirección → menú ⋮ → *Instalar aplicación*.

## Datos

Todo se guarda **en el propio dispositivo** (no hay servidor). Cada móvil tiene su catálogo y sus presupuestos.

- *Catálogo → Exportar copia* descarga un `.json` con catálogo, cláusula y presupuestos. Por defecto se **cifra** con una contraseña (AES-GCM + PBKDF2); sin ella no se puede leer.
- *Catálogo → Importar copia* sustituye el catálogo y añade los presupuestos. Todo lo importado se valida y se limpia antes de usarse.
- Haz una copia de vez en cuando: si se borran los datos del navegador o se cambia de móvil, se pierden.

**No subas copias de datos (`*.json`) al repositorio**: es público.

## Acceso

- Acceso inicial: usuario **Olga**. En el código solo está la huella PBKDF2 de la contraseña inicial, nunca la contraseña.
- En el primer acceso de cada dispositivo la app obliga a crear una contraseña propia (mínimo 8 caracteres), que se guarda solo en ese móvil.
- Tras 5 fallos seguidos hay que esperar, cada vez más.
- *He olvidado la contraseña* borra los datos de ese dispositivo y vuelve al acceso inicial (por eso conviene tener copias).
- Para cambiar el acceso inicial, cambia `ACCESO_INICIAL` en `login.js` (ver comentario del archivo).

## Seguridad

- `index.html` declara una política de seguridad de contenidos (CSP): solo se ejecuta código de la propia app, sin scripts en línea ni de terceros.
- Ninguna librería se carga de internet: jsPDF (4.2.1, sin vulnerabilidades conocidas en `npm audit`) y las tipografías van en `vendor/` y `fonts/`.
- La app se niega a mostrarse dentro de un marco de otra web.
