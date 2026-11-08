// Escáner de códigos de barras con la cámara del móvil (EAN-13/EAN-8/UPC).
// Usa el lector nativo del navegador si existe; si no (Safari en iPhone), ZXing cargado al momento desde jsDelivr.
import { html, toast } from './ui.js';

let zxing = null;
async function loadZxing() {
  if (!zxing) zxing = await import('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm');
  return zxing;
}

/** Abre la cámara y devuelve el código leído (o el que escribas a mano), o null si cancelas. */
export function scanBarcode() {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'scan-ov';
    ov.innerHTML = html`<div class="scan-box"><video playsinline muted autoplay></video><div class="scan-line"></div></div>
      <p class="small" style="text-align:center">Apunta al código de barras del envase</p>
      <div class="row" style="gap:8px"><input class="grow" inputmode="numeric" placeholder="o escribe el número" id="scan-man"><button class="sm" id="scan-ok">OK</button></div>
      <button class="block ghost" id="scan-x">Cancelar</button>`.s;
    document.body.appendChild(ov);
    const video = ov.querySelector('video');
    let stop = () => {}; let done = false;
    const finish = (code) => { if (done) return; done = true; try { stop(); } catch { /* */ } ov.remove(); if (code && navigator.vibrate) navigator.vibrate(60); resolve(code); };
    ov.querySelector('#scan-x').onclick = () => finish(null);
    ov.querySelector('#scan-ok').onclick = () => { const v = ov.querySelector('#scan-man').value.replace(/\D/g, ''); if (v.length >= 8) finish(v); else toast('El código tiene 8 o 13 números'); };
    (async () => {
      try {
        if ('BarcodeDetector' in window) {
          const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          video.srcObject = stream; await video.play();
          stop = () => stream.getTracks().forEach((t) => t.stop());
          const tick = async () => { if (done) return; try { const r = await det.detect(video); if (r[0]?.rawValue) return finish(r[0].rawValue); } catch { /* */ } requestAnimationFrame(tick); };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await loadZxing();
          const reader = new BrowserMultiFormatReader();
          const ctl = await reader.decodeFromVideoDevice(undefined, video, (res) => { if (res) finish(res.getText()); });
          stop = () => ctl.stop();
        }
      } catch (e) {
        ov.querySelector('p').textContent = `No puedo abrir la cámara (${e.name === 'NotAllowedError' ? 'permiso denegado: actívalo en Ajustes → Safari → Cámara' : e.message}). Escribe el número del código.`;
      }
    })();
  });
}
