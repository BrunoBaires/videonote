# Incertis · Video Note

Genera piezas de video para el canal de WhatsApp a partir del video que manda el cronista. Salida en mp4, lista para subir.

## Estado

Versión cliente (render en el navegador). Próximo paso: generación de video en el servidor con Vercel Functions (ver el plan en el proyecto).

## Contenido del repo

```
index.html    editor de escritorio
movil.html    app móvil
vercel.json   cabeceras COOP/COEP (no borrar)
```

Nota: la carpeta `lib/` (conversor ffmpeg.wasm de respaldo, ~31 MB) no está incluida acá porque el plan es mover el render al servidor.

## Publicar en Vercel

Conectar este repo desde vercel.com (Add New → Project → Import Git Repository). Vercel devuelve una URL con Functions habilitadas.
