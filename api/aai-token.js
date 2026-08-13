// Emite un token temporal de AssemblyAI para el streaming en vivo (Universal-Streaming v3).
// El navegador NO debe exponer la API key en la URL del WebSocket: pide el token acá.
// La key llega por header 'x-aai-key' (la que ya usás en la app) o por la env var ASSEMBLYAI_API_KEY.
export default async function handler(req, res) {
  try {
    const key = req.headers['x-aai-key'] || process.env.ASSEMBLYAI_API_KEY;
    if (!key) { res.status(400).json({ error: 'Falta la API key de AssemblyAI.' }); return; }
    let expires = parseInt((req.query && req.query.expires) || '300', 10);
    if (!Number.isFinite(expires)) expires = 300;
    expires = Math.min(600, Math.max(60, expires));
    const r = await fetch('https://streaming.assemblyai.com/v3/token?expires_in_seconds=' + expires, {
      headers: { authorization: key }
    });
    const text = await r.text();
    if (!r.ok) { res.status(r.status).json({ error: 'AssemblyAI ' + r.status, detail: text.slice(0, 300) }); return; }
    let j; try { j = JSON.parse(text); } catch (e) { res.status(502).json({ error: 'Respuesta inválida de AssemblyAI.' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ token: j.token || j });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
