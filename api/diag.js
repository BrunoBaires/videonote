// Endpoint de diagnóstico temporal: expone SOLO booleanos (no el valor del token)
// para verificar qué credenciales ve la función en runtime. Borrar cuando cierre el tema.
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    hasRW: !!process.env.BLOB_READ_WRITE_TOKEN,
    rwLen: (process.env.BLOB_READ_WRITE_TOKEN || '').length,
    rwPrefix: (process.env.BLOB_READ_WRITE_TOKEN || '').slice(0, 14),
    hasStore: !!process.env.BLOB_STORE_ID,
    hasOidc: !!process.env.VERCEL_OIDC_TOKEN,
    commit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
  });
}
