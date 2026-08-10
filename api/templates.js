// api/templates.js — Biblioteca compartida de plantillas de estilo (Video Note).
// Guarda todas las plantillas del equipo como un único JSON en Vercel Blob.
// Métodos:
//   GET                → { templates: [...] }
//   POST { name, cfg } → crea o actualiza (por id, o por nombre si no hay id). Devuelve { template, templates }
//   DELETE ?id=...     → borra una plantilla. Devuelve { templates }
//
// Requiere BLOB_READ_WRITE_TOKEN en las variables de entorno de Vercel
// (el mismo store de Blob que ya usa render.js / upload.js).

import { put, list } from '@vercel/blob';

const PATH = 'videonote/templates.json';

async function readAll() {
  try {
    const { blobs } = await list({ prefix: PATH, limit: 1 });
    if (!blobs.length) return [];
    // cache:no-store + querystring para evitar que el CDN devuelva una versión vieja tras sobrescribir.
    const r = await fetch(blobs[0].url + '?ts=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

async function writeAll(arr) {
  await put(PATH, JSON.stringify(arr), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

function newId() {
  return 't_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

function readBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
  }
  return req.body;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    res.status(501).json({ error: 'blob_not_configured' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const templates = await readAll();
      res.status(200).json({ templates });
      return;
    }

    if (req.method === 'POST') {
      const body = readBody(req);
      const name = (body.name || '').toString().trim().slice(0, 60);
      const cfg = body.cfg && typeof body.cfg === 'object' ? body.cfg : null;
      if (!name || !cfg) { res.status(400).json({ error: 'bad_request' }); return; }

      const arr = await readAll();
      let t = null;
      if (body.id) t = arr.find(x => x.id === body.id) || null;
      if (!t) t = arr.find(x => (x.name || '').toLowerCase() === name.toLowerCase()) || null;

      const now = Date.now();
      if (t) {
        t.name = name;
        t.cfg = cfg;
        t.updatedAt = now;
      } else {
        t = { id: newId(), name, cfg, createdAt: now, updatedAt: now };
        arr.push(t);
      }
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
      await writeAll(arr);
      res.status(200).json({ template: t, templates: arr });
      return;
    }

    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id ? req.query.id : '').toString();
      if (!id) { res.status(400).json({ error: 'no_id' }); return; }
      let arr = await readAll();
      arr = arr.filter(x => x.id !== id);
      await writeAll(arr);
      res.status(200).json({ templates: arr });
      return;
    }

    res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
