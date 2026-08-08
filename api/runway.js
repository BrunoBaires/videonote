// Vercel Function: proxy de Runway (image-to-video / text-to-image).
// Evita el bloqueo CORS del navegador y mantiene la API key del lado del servidor.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   RUNWAY_KEY = <tu key de Runway>            (recomendado)
// El cliente también puede mandar la key en el header 'x-rw-key' (modo "traé tu clave").
//
// Rutas (todas sobre /api/runway):
//   POST  { type:'image_to_video'|'text_to_image', model, promptImage, promptText, ratio, duration } -> crea la tarea { id }
//   GET   ?id=<taskId>            -> estado de la tarea { status, output, ... }
//   GET   ?download=<videoUrl>    -> descarga el video vía servidor (mismo origen: no "tinta" el canvas al exportar)

const BASE = 'https://api.dev.runwayml.com/v1';
const VER  = '2024-11-06';

export const config = { maxDuration: 60 };

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 8 * 1024 * 1024) reject(new Error('body demasiado grande')); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-rw-key');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = req.headers['x-rw-key'] || process.env.RUNWAY_KEY;
  if (!key) { res.status(500).json({ error: 'Falta RUNWAY_KEY en el servidor (o pegá la key en la app).' }); return; }

  const authHeaders = { 'Authorization': 'Bearer ' + key, 'X-Runway-Version': VER };

  try {
    // --- descarga del video vía servidor (mismo origen -> no tinta el canvas al exportar) ---
    if (req.method === 'GET' && req.query.download) {
      const r = await fetch(String(req.query.download));
      if (!r.ok) { res.status(r.status).json({ error: 'No se pudo descargar el video (' + r.status + ').' }); return; }
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(buf);
      return;
    }

    // --- estado de la tarea ---
    if (req.method === 'GET' && req.query.id) {
      const r = await fetch(BASE + '/tasks/' + encodeURIComponent(String(req.query.id)), { headers: authHeaders });
      const d = await r.json().catch(() => ({}));
      res.setHeader('Cache-Control', 'no-store');
      res.status(r.status).json(d);
      return;
    }

    // --- crear tarea (image_to_video o text_to_image) ---
    if (req.method === 'POST') {
      const body = (req.body && typeof req.body === 'object') ? req.body : await readJson(req);
      const type = body.type;
      const path = type === 'text_to_image' ? '/text_to_image' : '/image_to_video';
      const payload = { ...body };
      delete payload.type;
      const r = await fetch(BASE + path, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json().catch(() => ({}));
      res.status(r.status).json(d);
      return;
    }

    res.status(400).json({ error: 'Petición inválida.' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
