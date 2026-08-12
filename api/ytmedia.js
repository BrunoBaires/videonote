// api/ytmedia.js — Baja el AUDIO de un video de YouTube del lado del servidor.
// Espeja la lógica de api/xvideo.js pero para YouTube, usando @distube/ytdl-core
// (fork mantenido de ytdl-core). Hace de PROXY del audio (lo re-emite al navegador,
// mismo origen), así se puede transcribir / animar / exportar en AudioNote sin CORS.
//
//   GET /api/ytmedia?url=<link de YouTube>             → JSON { id, title, best, formats }
//   GET /api/ytmedia?url=<link>&download=1             → transmite el audio (m4a/webm)
//
// Requiere agregar la dependencia en package.json:  "@distube/ytdl-core": "^4.16.12"
// (Vercel la instala sola al deployar.)
//
// Ojo (endpoint no oficial): si YouTube cambia algo, puede fallar y hay que actualizar la lib.
// Videos con restricción de edad / login pueden no andar.
import ytdl from '@distube/ytdl-core';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const q = req.query || {};
  const url = String(q.url || q.id || '');
  if (!url || !ytdl.validateURL(url)) { res.status(400).json({ error: 'link_invalido' }); return; }
  const dl = q.download === '1' || q.download === 'true';

  try {
    const info = await ytdl.getInfo(url);

    // solo pistas de audio, ordenadas de mayor a menor bitrate
    const audio = ytdl.filterFormats(info.formats, 'audioonly')
      .filter(f => f && f.url)
      .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

    if (!audio.length) { res.status(404).json({ error: 'sin_audio' }); return; }
    const best = audio[0];

    if (!dl) {
      res.status(200).json({
        id: info.videoDetails.videoId,
        title: info.videoDetails.title || '',
        best: best.url,
        formats: audio.map(f => ({ url: f.url, bitrate: f.audioBitrate || 0, mime: f.mimeType || '' }))
      });
      return;
    }

    // proxy del audio (streaming): ytdl maneja los rangos/headers de YouTube
    const mime = (best.mimeType || 'audio/mp4').split(';')[0];
    const ext = /mp4|m4a/i.test(best.mimeType || '') ? 'm4a' : 'webm';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'attachment; filename="yt-' + info.videoDetails.videoId + '.' + ext + '"');

    const stream = ytdl.downloadFromInfo(info, { format: best });
    stream.on('error', (e) => { if (!res.headersSent) res.status(502).json({ error: 'descarga · ' + String((e && e.message) || e) }); else res.end(); });
    stream.pipe(res);
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
