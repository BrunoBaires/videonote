// Prueba local del núcleo de render: genera un video de muestra + un overlay
// (como lo haría el móvil) y compone. Extrae un frame para inspección visual.
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import { createCanvas } from '@napi-rs/canvas';
import { compose } from '../lib-render/compose.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const NAME_FONT = 'Arial, sans-serif';

function run(bin, args) {
  return new Promise((res, rej) => {
    const p = spawn(bin, args);
    let err = '';
    p.stderr.on('data', d => err += d);
    p.on('close', c => c === 0 ? res() : rej(new Error(err.slice(-1500))));
  });
}

// geometría estilo movil.html, preset "mediano"
const W = 720, H = 720;
const margin = W * 0.03;
const diamPct = 58;
const D0 = (W - margin * 2) * (diamPct / 100);
const r = D0 / 2, cx = W / 2, cy = margin + r;
const stroke = 16 * (W / 1080) * 1.9;
const R = r - stroke;

const params = {
  W, H, fps: 30, ringFps: 15,
  circle: { cx, cy, rOuter: r, stroke },
  ring: { on: true, color: '#F9F8F6', trackColor: '#D80126' },
  timer: { on: true, down: true },
  videoOffsetPct: 0,
  preset: 'ultrafast', crf: 30,
};

// Overlay estático: fondo degradé + pista del anillo + textos + marca, con
// agujero transparente donde va el video (destination-out del disco).
function buildOverlay() {
  const cv = createCanvas(W, H);
  const c = cv.getContext('2d');
  // fondo degradé (como el preset solar)
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#CBD5E1'); g.addColorStop(1, '#334155');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // pista del anillo (marco)
  c.beginPath();
  c.arc(cx, cy, r - stroke / 2, 0, Math.PI * 2);
  c.strokeStyle = '#D80126'; c.lineWidth = stroke; c.stroke();
  // textos
  c.fillStyle = '#fff'; c.textAlign = 'center';
  c.font = `700 ${W * 0.058}px ${NAME_FONT}`;
  c.fillText('Juan Pérez', cx, cy + r + W * 0.08);
  c.font = `400 ${W * 0.04}px ${NAME_FONT}`;
  c.fillStyle = 'rgba(255,255,255,.88)';
  c.fillText('Desde Egipto', cx, cy + r + W * 0.08 + W * 0.058 * 0.95);
  // marca
  c.font = `500 ${W * 0.0186}px ${NAME_FONT}`;
  c.fillStyle = '#fff'; c.textAlign = 'left';
  c.fillText('C L A R Í N', W * 0.075, H * 0.955);
  c.textAlign = 'right';
  c.fillText('0 3 . A G O . 2 0 2 6', W * 0.925, H * 0.955);
  // agujero para el video
  c.globalCompositeOperation = 'destination-out';
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.globalCompositeOperation = 'source-over';
  return cv.toBuffer('image/png');
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const video = path.join(OUT, 'sample.mp4');
  const overlay = path.join(OUT, 'overlay.png');
  const final = path.join(OUT, 'final.mp4');

  // video de muestra: patrón + tono de audio, 6s, vertical-ish
  console.log('generando video de muestra…');
  await run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'testsrc=size=720x1280:rate=30:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);

  console.log('generando overlay…');
  await fs.writeFile(overlay, buildOverlay());

  console.log('componiendo…');
  const t0 = Date.now();
  const res = await compose({ videoPath: video, overlayPath: overlay, params, outPath: final, tmpDir: OUT });
  console.log('compuesto en', ((Date.now() - t0) / 1000).toFixed(1), 's ->', res);

  // extraer un frame a la mitad para inspección
  const frame = path.join(OUT, 'frame.png');
  await run(ffmpegPath, ['-y', '-ss', '3', '-i', final, '-frames:v', '1', frame]);
  const st = await fs.stat(final);
  console.log('final.mp4:', (st.size / 1024).toFixed(0), 'KB · frame ->', frame);
}

main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
