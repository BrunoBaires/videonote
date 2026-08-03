# Render en servidor (Vercel Functions + Blob)

El móvil ahora genera la video-nota en el servidor, así anda en cualquier teléfono
sin depender de la grabación del navegador (el punto flojo de iOS). Si el servidor
no está disponible, `movil.html` cae solo a la grabación local (comportamiento viejo).

## Flujo
1. El teléfono arma un **overlay PNG** (fondo + textos + marca + pista del anillo, con
   un agujero donde va el video) con el canvas — funciona en todo browser.
2. Sube el **video crudo** directo a **Vercel Blob** (no pasa por el body de la Function).
3. Llama a **`/api/render`** con `{ blobUrl, overlayPng, params }`.
4. El servidor (ffmpeg + @napi-rs/canvas) recorta el video en círculo, pega el overlay,
   dibuja el anillo de avance + contador por frame y devuelve el **mp4**.
5. El teléfono lo comparte a WhatsApp (Web Share).

## Archivos
- `api/render.js` — compone y devuelve el mp4. `maxDuration: 60`, `memory: 1024`.
- `api/upload.js` — token de subida directa a Blob (`handleUpload`).
- `lib-render/compose.js` — núcleo de compositing (ffmpeg + canvas). Probado local.
- `package.json` — deps: `ffmpeg-static`, `@napi-rs/canvas`, `@vercel/blob`.

## SETUP OBLIGATORIO EN VERCEL (una vez)
El flujo necesita un **store de Blob**:
1. En el dashboard de Vercel → proyecto `videonote` → pestaña **Storage** → **Create Database** → **Blob** → crearlo y conectarlo al proyecto.
2. Eso agrega la variable **`BLOB_READ_WRITE_TOKEN`** al entorno (la usan `/api/upload` y `/api/render`).
3. Redeploy (Vercel lo hace solo al conectar el store, o con un push).

Sin el store de Blob, la subida falla y el móvil vuelve a grabar local (no rompe nada).

## Límites / notas
- Clips acotados a 30 s (`params.maxDuration`) y `-preset ultrafast` para no rozar el tope de segundos de la Function.
- La respuesta del mp4 viaja como binario; para clips cortos (720×720) queda holgada. Si más adelante los clips pesan, conviene subir el resultado a Blob y devolver la URL.
- El overlay no incluye (todavía) las estrellas animadas del cielo nocturno; el fondo va como degradé. Pendiente menor.
- El editor de escritorio (`index.html`) sigue con su render local + ffmpeg.wasm; por eso las cabeceras COOP/COEP quedan sólo en `/` e `/index.html`.
