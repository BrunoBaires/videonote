// Endpoint de diagnóstico temporal: booleanos de credenciales + conteo de blobs.
// Borrar cuando cierre el tema.
import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let blobCount = null, lastBlob = null, blobErr = null;
  try {
    const { blobs } = await list({ limit: 10 });
    blobCount = blobs.length;
    if (blobs.length) lastBlob = { pathname: blobs[blobs.length - 1].pathname, size: blobs[blobs.length - 1].size };
  } catch (e) { blobErr = String(e && e.message || e); }
  res.status(200).json({
    hasRW: !!process.env.BLOB_READ_WRITE_TOKEN,
    rwLen: (process.env.BLOB_READ_WRITE_TOKEN || '').length,
    hasStore: !!process.env.BLOB_STORE_ID,
    hasOidc: !!process.env.VERCEL_OIDC_TOKEN,
    blobCount, lastBlob, blobErr,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
  });
}
