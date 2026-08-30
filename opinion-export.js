/* ==========================================================================
   VIDEONOTE · EXPORTAR PARA OPINIÓN
   Módulo autocontenido: agrega su propia card a la columna izquierda y no
   modifica ninguna función existente. Solo lee las variables globales que
   ya expone index.html: `quotes` (array {id,a,b,in,out,ctx}), `subWords`
   (array {text,start,end,speaker} en ms) y `mainVidFile`.

   Instalación: subir este archivo junto a index.html y agregar, antes de
   </body>, la línea:
     <script src="opinion-export.js"></script>
   ========================================================================== */
(function () {
  'use strict';

  function whenReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function vnVideoId() {
    try {
      const base =
        (typeof mainVidFile !== 'undefined' && mainVidFile
          ? mainVidFile.name + '|' + mainVidFile.size
          : 'sin-archivo') +
        '|' +
        (typeof subWords !== 'undefined' && subWords ? subWords.length : 0);
      let h = 0;
      for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
      return 'vn_' + h.toString(16).slice(0, 8);
    } catch (e) {
      return 'vn_00000000';
    }
  }

  // Reagrupa las palabras del rango del quote en oraciones (corte en . ! ? …)
  function buildSegments(q) {
    if (typeof subWords === 'undefined' || !subWords || !subWords.length) return [];
    const ws = subWords.slice(q.a, q.b + 1);
    if (!ws.length) return [];
    const segs = [];
    let cur = [];
    const flush = () => {
      if (!cur.length) return;
      segs.push({
        segment_id: 'seg_' + String(segs.length + 1).padStart(3, '0'),
        start: +((cur[0].start - q.in) / 1000).toFixed(2),
        end: +((cur[cur.length - 1].end - q.in) / 1000).toFixed(2),
        text: cur.map((w) => w.text).join(' '),
        speaker: cur[0].speaker || null,
      });
      cur = [];
    };
    ws.forEach((w) => {
      cur.push(w);
      if (/[.!?…]$/.test(w.text)) flush();
    });
    flush();
    return segs;
  }

  function buildPayload(q) {
    return {
      video_id: vnVideoId() + '_q' + q.id,
      duration_seconds: +((q.out - q.in) / 1000).toFixed(2),
      language: 'es-AR',
      transcription_status: 'completed',
      segments: buildSegments(q),
    };
  }

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch (e) {}
      URL.revokeObjectURL(url);
    }, 800);
  }

  function getQuotes() {
    return typeof quotes !== 'undefined' && Array.isArray(quotes) ? quotes : [];
  }

  function fmtDur(ms) {
    const s = Math.round(ms / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function setStatus(el, text, kind) {
    el.textContent = text;
    el.style.color = kind === 'err' ? '#e5484d' : kind === 'ok' ? '#3dd68c' : 'var(--dim, #999)';
  }

  function injectStyles() {
    const css = `
      .op-card{border-top:1px solid var(--line,#333);padding-top:14px;margin-top:14px;font-family:inherit}
      .op-card h2{font-size:13px;letter-spacing:.03em;text-transform:uppercase;color:var(--dim,#999);margin:0 0 8px}
      .op-hint{font-size:11.5px;color:var(--dim,#999);line-height:1.4;margin-bottom:8px}
      .op-list{margin:8px 0;max-height:220px;overflow:auto}
      .op-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line,#2a2a2a);font-size:12px}
      .op-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .op-row button{flex-shrink:0;font-size:11px;padding:4px 8px;cursor:pointer;background:transparent;border:1px solid var(--line,#444);border-radius:4px;color:inherit}
      .op-row button:hover{background:var(--line,#333)}
      .op-empty{font-size:12px;color:var(--dim,#888);padding:8px 0}
      .op-btn{width:100%;margin-top:6px;padding:8px;font-size:12px;cursor:pointer;border:1px solid var(--line,#444);border-radius:4px;background:transparent;color:inherit}
      .op-btn:hover{background:var(--line,#333)}
      .op-refresh{font-size:11px;color:var(--dim,#999);background:none;border:none;cursor:pointer;text-decoration:underline;padding:0}
      .op-status{font-size:11.5px;margin-top:6px;min-height:14px}
      .op-chk{font-size:12px;display:flex;align-items:center;gap:6px;margin:8px 0}
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function findQuotesCard() {
    // Busca la card existente cuyo título sea "Quotes" para insertar justo después.
    const heads = document.querySelectorAll('.card h2, .head h2');
    for (const h of heads) {
      if (h.textContent.trim().toLowerCase() === 'quotes') {
        return h.closest('.card');
      }
    }
    return null;
  }

  function buildCard() {
    const card = document.createElement('div');
    card.className = 'op-card';
    card.innerHTML = `
      <h2>Opinión</h2>
      <div class="op-hint">Exporta, por quote, el JSON de segmentos (contrato Incertis) con tiempos y hablante.</div>
      <div class="op-list" id="opList"></div>
      <button type="button" class="op-refresh" id="opRefresh">↻ Actualizar lista</button>
      <button type="button" class="op-btn" id="opExportAll">Exportar todos en un solo JSON</button>
      <div class="op-status" id="opStatus"></div>
    `;
    return card;
  }

  function renderList(listEl) {
    const qs = getQuotes();
    if (!qs.length) {
      listEl.innerHTML = '<div class="op-empty">Todavía no hay quotes marcados.</div>';
      return;
    }
    listEl.innerHTML = '';
    qs.forEach((q, i) => {
      const row = document.createElement('div');
      row.className = 'op-row';
      const label = (q.ctx || '').slice(0, 34) || 'Quote ' + (i + 1);
      row.innerHTML = `<span>#${i + 1} · ${fmtDur(q.out - q.in)} · ${label}</span>`;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'JSON';
      btn.onclick = () => {
        downloadJSON(buildPayload(q), 'Quote ' + String(i + 1).padStart(2, '0') + '.json');
      };
      row.appendChild(btn);
      listEl.appendChild(row);
    });
  }

  whenReady(function () {
    injectStyles();
    const card = buildCard();
    const anchor = findQuotesCard();
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(card, anchor.nextSibling);
    } else {
      // Fallback: lo cuelga al final de la primera columna que encuentre.
      const col = document.querySelector('.col') || document.body;
      col.appendChild(card);
    }

    const listEl = card.querySelector('#opList');
    const statusEl = card.querySelector('#opStatus');
    renderList(listEl);

    card.querySelector('#opRefresh').onclick = () => renderList(listEl);

    card.querySelector('#opExportAll').onclick = () => {
      const qs = getQuotes();
      if (!qs.length) {
        setStatus(statusEl, 'No hay quotes para exportar.', 'err');
        return;
      }
      const payload = {
        video_id: vnVideoId(),
        generated_at: new Date().toISOString(),
        quotes: qs.map((q, i) => Object.assign({ quote_index: i + 1 }, buildPayload(q))),
      };
      downloadJSON(payload, 'Opinion — todos los quotes.json');
      setStatus(statusEl, qs.length + ' quote(s) exportados en un solo archivo.', 'ok');
    };
  });
})();
