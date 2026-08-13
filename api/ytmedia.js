// Baja el audio de un video de YouTube. Con start/end (segundos) corta SOLO ese fragmento
// del lado del servidor (ffmpeg hace seek por HTTP), así no se baja el video entero.
// Params: ?url=<link>&start=<seg>&end=<seg>&download=1
import ytdl from '@distube/ytdl-core';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';

export default async function handler(req, res) {
  try {
    const url = req.query && req.query.url;
    if (!url || !ytdl.validateURL(url)) { res.status(400).json({ error: 'Link de YouTube inválido.' }); return; }
    const start = Math.max(0, parseFloat((req.query && req.query.start) || '0') || 0);
    const endRaw = req.query && req.query.end != null ? parseFloat(req.query.end) : null;
    const end = (endRaw != null && !Number.isNaN(endRaw)) ? endRaw : null;

    let info;
    try { info = await ytdl.getInfo(url); }
    catch (e) { res.status(502).json({ error: 'YouTube no dejó leer el video (puede estar bloqueado o requerir login): ' + String((e && e.message) || e).slice(0, 160) }); return; }

    const fmt = ytdl.chooseFormat(info.formats, { quality: 'highestaudio', filter: 'audioonly' });
    if (!fmt || !fmt.url) { res.status(502).json({ error: 'No se encontró una pista de solo audio.' }); return; }

    const args = ['-hide_banner', '-loglevel', 'error'];
    if (start > 0) args.push('-ss', String(start));
    args.push('-i', fmt.url);
    if (end != null && end > start) args.push('-t', String(end - start));
    args.push('-vn', '-acodec', 'libmp3lame', '-b:a', '160k', '-f', 'mp3', 'pipe:1');

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'inline; filename="youtube-audio.mp3"');

    const ff = spawn(ffmpegPath, args);
    let err = '';
    ff.stderr.on('data', d => { err += d.toString(); });
    ff.on('error', e => { if (!res.headersSent) res.status(500).json({ error: 'ffmpeg no arrancó: ' + String((e && e.message) || e) }); });
    ff.on('close', code => { if (code !== 0 && !res.headersSent) res.status(500).json({ error: 'ffmpeg salió con ' + code + ': ' + err.slice(0, 200) }); });
    ff.stdout.pipe(res);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) });
  }
}
