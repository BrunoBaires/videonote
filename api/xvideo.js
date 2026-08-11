// api/xvideo.js — Baja el video de un posteo de X (Twitter) del lado del servidor.
// Usa el endpoint público de sindicación (cdn.syndication.twimg.com/tweet-result) para obtener
// las variantes mp4, elige la de mejor calidad y hace de PROXY del mp4 (lo re-emite al navegador,
// mismo origen, así se puede editar/exportar en la app sin que el canvas se "tinte").
//
//   GET /api/xvideo?url=<link del posteo>            → JSON con las variantes y la mejor
//   GET /api/xvideo?url=<link>&download=1            → transmite el mp4 (para cargarlo en el editor)
//
// Funciona con posteos PÚBLICOS con video. El endpoint es no oficial: si X lo cambia, hay que ajustar.

import { Readable } from 'node:stream';

function tweetId(input){
  const s = String(input || '');
  const m = s.match(/(?:status(?:es)?\/)(\d{5,25})/) || s.match(/\b(\d{5,25})\b/);
  return m ? m[1] : null;
}
function genToken(id){
  try { return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, ''); }
  catch (e) { return '0'; }
}
// busca recursivamente todas las URLs .mp4 con su bitrate
function collectMp4(obj, out){
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(o => collectMp4(o, out)); return; }
  if (typeof obj.url === 'string' && /\.mp4(\?|$)/i.test(obj.url)) {
    out.push({ url: obj.url, bitrate: Number(obj.bitrate) || 0 });
  }
  for (const k in obj) { const v = obj[k]; if (v && typeof v === 'object') collectMp4(v, out); }
}

export default async function handler(req, res){
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const q = req.query || {};
  const id = tweetId(q.url || q.id || '');
  if (!id) { res.status(400).json({ error: 'link_invalido' }); return; }
  const dl = q.download === '1' || q.download === 'true';

  try {
    const token = genToken(id);
    const api = `https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}&lang=es`;
    const r = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept': 'application/json' } });
    if (!r.ok) { res.status(502).json({ error: 'x_' + r.status }); return; }
    const data = await r.json();

    const found = [];
    collectMp4(data, found);
    const seen = new Set();
    const variants = found
      .filter(v => { if (seen.has(v.url)) return false; seen.add(v.url); return true; })
      .sort((a, b) => b.bitrate - a.bitrate);

    if (!variants.length) { res.status(404).json({ error: 'sin_video' }); return; }
    const best = variants[0].url;

    if (!dl) {
      res.status(200).json({ id, best, variants, text: (data.text || '') });
      return;
    }

    // proxy del mp4 (streaming, sin bufferear todo en memoria)
    const vr = await fetch(best, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://twitter.com/' } });
    if (!vr.ok || !vr.body) { res.status(502).json({ error: 'descarga_' + (vr.status || 'x') }); return; }
    res.setHeader('Content-Type', vr.headers.get('content-type') || 'video/mp4');
    res.setHeader('Content-Disposition', 'attachment; filename="x-' + id + '.mp4"');
    const len = vr.headers.get('content-length'); if (len) res.setHeader('Content-Length', len);
    Readable.fromWeb(vr.body).pipe(res);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
