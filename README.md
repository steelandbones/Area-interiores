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

- *Catálogo → Exportar copia* descarga un `.json` con catálogo, cláusula y presupuestos guardados.
- *Catálogo → Importar copia* sustituye el catálogo y añade los presupuestos de la copia.
- Haz una copia de vez en cuando: si se borran los datos del navegador o se cambia de móvil, se pierden.

**No subas copias de datos (`*.json` con presupuestos) al repositorio**: si es público, cualquiera puede verlas.

## Acceso

El inicio de sesión es solo una barrera visual: la huella de la contraseña está en el código, que en una web pública es visible. No protege los datos; lo que protege los presupuestos es que viven solo en el móvil.
