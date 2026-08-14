// Biblioteca de plantillas del equipo — persistida en Vercel Blob.
// GET    -> { templates: [...] }
// POST   { name, cfg, id? } -> { templates, template:{id,name} }
// DELETE ?id=<id>           -> { templates }
//
// Requiere un Blob store conectado al proyecto (Vercel -> Storage -> Blob),
// que inyecta la env var BLOB_READ_WRITE_TOKEN. Si no está, responde 501
// (el editor lo muestra como "Biblioteca no configurada todavía", sin romper).
import { put, list } from '@vercel/blob';

// Cada app (videonote / audionote) guarda sus plantillas en su propio archivo,
// así los dos formatos de configuración no se mezclan. Sin ?app= => videonote
// (compatibilidad con lo ya guardado).
function keyFor(app) {
  const a = String(app || 'videonote').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return (a || 'videonote') + '/templates.json';
}

async function readAll(token, key) {
  const { blobs } = await list({ prefix: key, token });
  const b = blobs.find(x => x.pathname === key);
  if (!b) return [];
  // cache-buster para no leer una versión vieja del CDN tras sobrescribir
  const r = await fetch(b.url + '?ts=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) return [];
  const d = await r.json().catch(() => null);
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.templates)) return d.templates;
  return [];
}

async function writeAll(templates, token, key) {
  await put(key, JSON.stringify(templates), {
    access: 'public',
    token,
    contentType: 'application/json',
    addRandomSuffix: false,   // pathname estable, para poder sobrescribir
    allowOverwrite: true      // sin esto, put() tira 500 si el archivo ya existe
  });
}

function newId() {
  return 'tpl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default async function handler(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    res.status(501).json({ error: 'Blob store no configurado en el servidor.' });
    return;
  }
  try {
    if (req.method === 'GET') {
      const key = keyFor(req.query && req.query.app);
      const templates = await readAll(token, key);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ templates });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
      if (!body || typeof body !== 'object') body = {};
      const name = String(body.name || '').trim();
      if (!name) { res.status(400).json({ error: 'Falta el nombre de la plantilla.' }); return; }
      const cfg = (body.cfg && typeof body.cfg === 'object') ? body.cfg : {};
      const key = keyFor(body.app);

      let templates = await readAll(token, key);
      let id = body.id;
      if (id) {
        const i = templates.findIndex(t => t.id === id);
        if (i >= 0) templates[i] = { ...templates[i], name, cfg };
        else templates.push({ id, name, cfg });
      } else {
        id = newId();
        templates.push({ id, name, cfg });
      }
      await writeAll(templates, token, key);
      res.status(200).json({ templates, template: { id, name } });
      return;
    }

    if (req.method === 'DELETE') {
      const id = req.query && req.query.id;
      if (!id) { res.status(400).json({ error: 'Falta el id de la plantilla.' }); return; }
      const key = keyFor(req.query && req.query.app);
      let templates = await readAll(token, key);
      templates = templates.filter(t => t.id !== id);
      await writeAll(templates, token, key);
      res.status(200).json({ templates });
      return;
    }

    res.status(405).json({ error: 'Método no permitido.' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}
