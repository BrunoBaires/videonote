// Vercel Function: genera el token de subida directa a Vercel Blob.
// El teléfono usa `upload()` de @vercel/blob/client apuntando acá; el video
// crudo viaja directo del teléfono a Blob (no pasa por el body de la Function).
// Requiere el store de Blob creado y BLOB_READ_WRITE_TOKEN en el entorno de Vercel.
import { handleUpload } from '@vercel/blob/client';

export const config = { maxDuration: 30 };

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'usar POST' }); return; }
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : await readJson(req);
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/*', 'application/octet-stream'],
        maximumSizeInBytes: 200 * 1024 * 1024,
        addRandomSuffix: true,
        // los archivos son temporales; se pueden limpiar por lifecycle del store
        tokenPayload: JSON.stringify({ kind: 'raw-video' }),
      }),
      onUploadCompleted: async () => { /* no hace falta persistir nada */ },
    });
    res.status(200).json(jsonResponse);
  } catch (e) {
    res.status(400).json({ error: String(e && e.message || e) });
  }
}
