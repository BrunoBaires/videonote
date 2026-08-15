// Galería de logos del equipo, agrupados por marca — persistida en Vercel Blob.
// Manifiesto en logos/manifest.json: { groups:[...], items:[{id,group,name,url,kind}] }
// Las imágenes/videos se guardan como logos/<id>.<ext> (acceso público).
//
// GET                                  -> manifiesto { groups, items }
// POST { action:'upload', group, name, dataUrl }   -> sube un logo (imagen o video)
// POST { action:'addGroup', name }                 -> crea grupo
// POST { action:'renameGroup', from, to }          -> renombra grupo
// POST { action:'delGroup', name }                 -> borra grupo (y sus logos)
// DELETE ?id=<id>                                   -> borra un logo
import { put, list, del } from '@vercel/blob';

const KEY = 'logos/manifest.json';
const DEFAULT_GROUPS = ['Clarín', 'Incertis', 'Montevideo Portal'];

async function readManifest(token) {
  const { blobs } = await list({ prefix: KEY, token });
  const b = blobs.find(x => x.pathname === KEY);
  const base = () => ({ groups: DEFAULT_GROUPS.slice(), items: [] });
  if (!b) return base();
  const r = await fetch(b.url + '?ts=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) return base();
  const d = await r.json().catch(() => null);
  if (!d || typeof d !== 'object') return base();
  if (!Array.isArray(d.groups) || !d.groups.length) d.groups = DEFAULT_GROUPS.slice();
  if (!Array.isArray(d.items)) d.items = [];
  return d;
}

async function writeManifest(m, token) {
  await put(KEY, JSON.stringify(m), {
    access: 'public', token, contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true
  });
}

function newId() {
  return 'lg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default async function handler(req, res) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) { res.status(501).json({ error: 'Blob store no configurado en el servidor.' }); return; }
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(await readManifest(token));
      return;
    }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body || '{}'); } catch { body = {}; } }
    if (!body || typeof body !== 'object') body = {};

    if (req.method === 'POST') {
      const m = await readManifest(token);
      const action = body.action;

      if (action === 'upload') {
        const group = String(body.group || '').trim() || m.groups[0] || 'General';
        const name = String(body.name || '').trim().slice(0, 60) || 'logo';
        const dataUrl = String(body.dataUrl || '');
        const mt = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!mt) { res.status(400).json({ error: 'Imagen inválida.' }); return; }
        const ext = (mt[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 5);
        const buf = Buffer.from(mt[2], 'base64');
        if (buf.length > 4 * 1024 * 1024) { res.status(400).json({ error: 'Archivo muy pesado (máx 4 MB).' }); return; }
        const kind = mt[1].startsWith('video/') ? 'video' : 'image';
        const id = newId();
        const blob = await put('logos/' + id + '.' + ext, buf, {
          access: 'public', token, contentType: mt[1], addRandomSuffix: false, allowOverwrite: true
        });
        if (!m.groups.includes(group)) m.groups.push(group);
        m.items.push({ id, group, name, url: blob.url, kind });
        await writeManifest(m, token);
        res.status(200).json(m);
        return;
      }

      if (action === 'addGroup') {
        const n = String(body.name || '').trim().slice(0, 40);
        if (n && !m.groups.includes(n)) m.groups.push(n);
        await writeManifest(m, token); res.status(200).json(m); return;
      }
      if (action === 'renameGroup') {
        const from = String(body.from || ''), to = String(body.to || '').trim().slice(0, 40);
        if (to) { m.groups = m.groups.map(g => g === from ? to : g); m.items.forEach(it => { if (it.group === from) it.group = to; }); }
        await writeManifest(m, token); res.status(200).json(m); return;
      }
      if (action === 'delGroup') {
        const n = String(body.name || '');
        const removed = m.items.filter(it => it.group === n);
        m.groups = m.groups.filter(g => g !== n);
        m.items = m.items.filter(it => it.group !== n);
        await writeManifest(m, token);
        for (const it of removed) { if (it.url) { try { await del(it.url, { token }); } catch (e) {} } }
        res.status(200).json(m); return;
      }
      res.status(400).json({ error: 'Acción desconocida.' }); return;
    }

    if (req.method === 'DELETE') {
      const id = req.query && req.query.id;
      if (!id) { res.status(400).json({ error: 'Falta el id del logo.' }); return; }
      const m = await readManifest(token);
      const it = m.items.find(x => x.id === id);
      m.items = m.items.filter(x => x.id !== id);
      await writeManifest(m, token);
      if (it && it.url) { try { await del(it.url, { token }); } catch (e) {} }
      res.status(200).json(m); return;
    }

    res.status(405).json({ error: 'Método no permitido.' });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e).slice(0, 300) });
  }
}
