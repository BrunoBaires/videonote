// Núcleo de compositing server-side para Incertis Video Note.
// Toma: el video crudo del cronista + un overlay PNG estático (fondo + textos +
// marca + anillo-pista, con un agujero transparente donde va el video) + params.
// Devuelve: un mp4 (H.264/AAC) con el video recortado en círculo, el overlay
// encima, y el anillo de avance + contador animados dibujados por frame.
//
// Diseño de capas (de abajo hacia arriba):
//   1. video escalado "cover" y ubicado en el disco del círculo
//   2. overlay estático (opaco salvo el disco transparente)  -> enmascara el video
//   3. secuencia de anillo de avance + contador (transparente, animada)
//
// Todo el trabajo pesado es ffmpeg; el anillo/contador se generan con
// @napi-rs/canvas como PNGs y ffmpeg los superpone.

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { createCanvas } from '@napi-rs/canvas';

function run(bin, args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd });
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`${path.basename(bin)} exit ${code}\n${err.slice(-2000)}`)));
  });
}

// Duración del video en segundos (ffprobe no viene con ffmpeg-static; usamos ffmpeg).
async function probeDuration(video) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath, ['-i', video]);
    let err = '';
    p.stderr.on('data', d => { err += d.toString(); });
    p.on('close', () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      if (!m) return resolve(null);
      resolve((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]));
    });
  });
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Genera la secuencia PNG del anillo de avance + contador y la guarda en dir.
// Devuelve { count, fps } para que ffmpeg la superponga.
async function renderRingSequence({ dir, params, duration }) {
  const { W, H, circle, ring, timer } = params;
  const ringFps = params.ringFps || 15;
  const NAME_FONT = 'Arial, "Helvetica Neue", sans-serif';
  const total = Math.max(1, Math.ceil(duration * ringFps));
  const cx = circle.cx, cy = circle.cy;
  const r = circle.rOuter, stroke = circle.stroke;
  const ringR = r - stroke / 2;

  const cv = createCanvas(W, H);
  const ctx = cv.getContext('2d');

  for (let i = 0; i < total; i++) {
    const t = i / ringFps;
    let prog = duration ? t / duration : 0;
    if (prog > 0.985) prog = 1;
    prog = Math.min(Math.max(prog, 0), 1);

    ctx.clearRect(0, 0, W, H);

    // anillo de avance
    if (ring.on && stroke > 0 && prog > 0.0005) {
      ctx.save();
      ctx.lineWidth = stroke;
      ctx.strokeStyle = ring.color;
      ctx.lineCap = prog >= 1 ? 'butt' : 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // contador
    if (timer.on && duration) {
      const cur = t > duration ? duration : t;
      const tt = timer.down ? duration - cur : cur;
      ctx.font = `600 ${W * 0.062}px ${NAME_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = W * 0.018;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(fmtTime(tt), cx, cy + r - stroke - W * 0.075);
      ctx.shadowBlur = 0;
      ctx.textBaseline = 'alphabetic';
    }

    const buf = cv.toBuffer('image/png');
    await fs.writeFile(path.join(dir, `r${String(i).padStart(5, '0')}.png`), buf);
  }
  return { count: total, fps: ringFps };
}

/**
 * Compone el video final.
 * @param {object} o
 * @param {string} o.videoPath   video crudo del cronista
 * @param {string} o.overlayPath overlay estático PNG (fondo+textos+marca+pista, con agujero)
 * @param {object} o.params      geometría y opciones (ver más abajo)
 * @param {string} o.outPath     ruta del mp4 de salida
 * @param {string} o.tmpDir      carpeta temporal de trabajo
 */
export async function compose({ videoPath, overlayPath, params, outPath, tmpDir }) {
  const W = params.W, H = params.H;
  const fps = params.fps || 30;
  const { cx, cy, rOuter, stroke } = params.circle;
  const R = rOuter - stroke;                 // radio del disco de video
  const DIAM = Math.round(R * 2);
  const offPct = params.videoOffsetPct || 0; // encuadre vertical -30..30

  let duration = params.duration || await probeDuration(videoPath);
  if (!duration || !isFinite(duration)) duration = 10;
  // límite de seguridad para no rozar el tope de segundos de la Function
  const maxDur = params.maxDuration || 30;
  const clip = Math.min(duration, maxDur);

  const seqDir = path.join(tmpDir, 'ring');
  await fs.mkdir(seqDir, { recursive: true });
  const seq = await renderRingSequence({ dir: seqDir, params, duration: clip });

  const posX = Math.round(cx - R);
  const posY = Math.round(cy - R);
  // desplazamiento vertical del encuadre (equivalente al slider del cliente)
  const cropShift = Math.round((offPct / 100) * DIAM);

  // Filtro:
  //  [0:v] escalar cover a DIAMxDIAM y recortar (con offset vertical)
  //  base color negra WxH  <- video-square en (posX,posY)
  //  overlay estático encima (enmascara: sólo el disco muestra el video)
  //  secuencia de anillo/contador encima
  const args = [
    '-y',
    '-i', videoPath,                                   // 0: video
    '-i', overlayPath,                                 // 1: overlay estático
    '-framerate', String(seq.fps), '-i', path.join(seqDir, 'r%05d.png'), // 2: anillo/contador
    '-filter_complex',
      `[0:v]scale=${DIAM}:${DIAM}:force_original_aspect_ratio=increase,` +
        `crop=${DIAM}:${DIAM}:(iw-${DIAM})/2:(ih-${DIAM})/2+${cropShift},setsar=1[vid];` +
      `color=c=black:s=${W}x${H}:d=${clip}[bg];` +
      `[bg][vid]overlay=${posX}:${posY}[base];` +
      `[base][1:v]overlay=0:0[withov];` +
      `[withov][2:v]overlay=0:0:shortest=1,format=yuv420p[vout]`,
    '-map', '[vout]',
    '-map', '0:a?',
    '-t', String(clip),
    '-r', String(fps),
    '-c:v', 'libx264', '-preset', params.preset || 'ultrafast', '-crf', String(params.crf || 30),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', params.ab || '96k',
    '-shortest',
    outPath,
  ];

  await run(ffmpegPath, args);
  return { outPath, duration: clip };
}
