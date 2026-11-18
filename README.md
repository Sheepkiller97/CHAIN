# CHAIN · Constancia diaria

App web instalable para seguir hábitos, rachas, metas y progreso. Tema **negro y dorado**, modo claro/oscuro/sistema, funciona sin conexión y se instala en el teléfono. Sin frameworks ni dependencias (solo las fuentes Fraunces y Manrope de Google Fonts).

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura de la página |
| `styles.css` | Diseño y colores (variables CSS al inicio) |
| `app.js` | Lógica, interfaz y pruebas automáticas |
| `manifest.webmanifest` | Datos para instalarla como app |
| `service-worker.js` | Modo sin conexión |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png` | Iconos |
| `INSTRUCCIONES.txt` | Pasos para publicarla en GitHub Pages |

## Probar en tu computadora

El modo sin conexión y la instalación necesitan un servidor, no basta con abrir el archivo.

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Pruebas automáticas

Abre `index.html#test` (por ejemplo `http://localhost:8000/#test`). Aparece un panel con los resultados y deben pasar todas. No tocan tus datos.

## Datos y respaldo

- Los datos se guardan en el navegador (`localStorage`, clave `chain.v1`). No hay servidor ni cuentas.
- Respaldo: Configuración > **Exportar copia** (descarga un JSON) y **Importar copia** para recuperarlo.
- Si publicas varias apps en el mismo usuario de GitHub Pages, comparten dominio. Cambia la constante `KEY` en `app.js` para que no se mezclen los datos.

## Personalizar

- **Colores:** variables al inicio de `styles.css` (`--accent`, `--bg`, `--surface`…). Hay un bloque claro y uno oscuro.
- **Nombre e iconos:** `manifest.webmanifest`, `<title>` de `index.html` y los PNG.
- **Actualizar el sitio:** sube los archivos nuevos al repositorio. El service worker busca primero en la red, así que los cambios llegan solos.
