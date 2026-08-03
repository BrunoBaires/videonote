// Vercel Function: compone la video-nota en el servidor.
// Recibe { blobUrl, overlayPng, params }:
//   - blobUrl:   URL del video crudo ya subido a Vercel Blob
//   - overlayPng: data URL (image/png) del overlay estático que arma el teléfono
//   - params:    geometría del círculo + opciones (ver lib-render/compose.js)
// Devuelve el mp4 (H.264/AAC) como binario.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { compose } from '../lib-render/compose.js';

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
  if (req.method !== 'POST') { res.status(405).json({ error: 'usar POST' }); return; }

  let work;
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req);
    const { blobUrl, overlayPng, params } = body;
    if (!blobUrl) throw new Error('falta blobUrl');
    if (!overlayPng) throw new Error('falta overlayPng');
    if (!params || !params.circle) throw new Error('faltan params.circle');

    work = path.join(os.tmpdir(), 'vn-' + randomUUID());
    await fs.mkdir(work, { recursive: true });
    const videoPath = path.join(work, 'in');
    const overlayPath = path.join(work, 'overlay.png');
    const outPath = path.join(work, 'out.mp4');

    // bajar el video crudo desde Blob
    const r = await fetch(blobUrl);
    if (!r.ok) throw new Error('no se pudo bajar el video de Blob (' + r.status + ')');
    await fs.writeFile(videoPath, Buffer.from(await r.arrayBuffer()));

    // decodificar el overlay (data URL o base64 pelado)
    const b64 = String(overlayPng).replace(/^data:image\/png;base64,/, '');
    await fs.writeFile(overlayPath, Buffer.from(b64, 'base64'));

    await compose({ videoPath, overlayPath, params, outPath, tmpDir: work });

    const mp4 = await fs.readFile(outPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="video-nota.mp4"');
    res.setHeader('Content-Length', String(mp4.length));
    res.status(200).send(mp4);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  } finally {
    if (work) { try { await fs.rm(work, { recursive: true, force: true }); } catch (_) {} }
  }
}
