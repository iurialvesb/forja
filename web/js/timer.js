// Temporizador del box: EMOM / AMRAP / Tabata / For Time a pantalla completa, con pitidos, vibración y pantalla siempre encendida.
// Al parar un For Time (o una simulación HYROX) devuelve el tiempo para guardarlo en el bloque.

let ctx = null, wake = null, raf = 0, state = null;

function beep(freq = 880, ms = 160, vol = 0.25) {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    o.start(); o.stop(ctx.currentTime + ms / 1000);
  } catch { /* sin audio */ }
  try { navigator.vibrate?.(ms); } catch { /* */ }
}
const clock = (s) => { const t = Math.max(0, Math.round(s)); const m = Math.floor(t / 60); return `${m}:${String(t % 60).padStart(2, '0')}`; };

/**
 * mode: 'emom' | 'amrap' | 'tabata' | 'for_time'
 * opts: { minutes, intervalS, rounds, capS, work, rest, title, onDone(seconds) }
 */
export function openTimer(mode, opts = {}) {
  closeTimer();
  const el = document.createElement('div');
  el.id = 'timer';
  document.body.appendChild(el);
  const plan = mode === 'tabata' ? { total: (opts.rounds ?? 8) * ((opts.work ?? 20) + (opts.rest ?? 10)) }
    : mode === 'emom' ? { total: (opts.minutes ?? 10) * 60 }
    : mode === 'amrap' ? { total: (opts.minutes ?? 12) * 60 }
    : { total: opts.capS ?? null };
  state = { mode, opts, plan, start: 0, pausedAt: 0, paused: true, lead: 10, lastBeep: -1, rounds: 0, el, laps: [], lapAt: 0 };
  draw();
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-t]')?.dataset.t; if (!a) return;
    if (a === 'go') toggle();
    if (a === 'close') { if (state.mode === 'for_time' && state.start && !confirm('¿Salir sin guardar el tiempo?')) return; closeTimer(); }
    if (a === 'round') { state.rounds++; beep(660, 80); draw(); }
    if (a === 'lap') { const t = elapsed(); state.laps.push(Math.round(t - state.lapAt)); state.lapAt = t; beep(990, 120); if (state.opts.laps && state.laps.length >= state.opts.laps.length) return finish(); draw(); }
    if (a === 'done') finish();
  });
}

function elapsed() {
  if (!state.start) return 0;
  return ((state.paused ? state.pausedAt : performance.now()) - state.start) / 1000 - state.lead;
}

async function toggle() {
  try { ctx ??= new (window.AudioContext || window.webkitAudioContext)(); await ctx.resume(); } catch { /* */ }
  if (!state.start) { state.start = performance.now(); state.paused = false; try { wake = await navigator.wakeLock?.request('screen'); } catch { /* */ } loop(); return; }
  if (state.paused) { state.start += performance.now() - state.pausedAt; state.paused = false; loop(); }
  else { state.pausedAt = performance.now(); state.paused = true; cancelAnimationFrame(raf); draw(); }
}

function loop() {
  cancelAnimationFrame(raf);
  const tick = () => { if (!state || state.paused) return; draw(); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
}

function phase() {
  const t = elapsed(), { mode, opts, plan } = state;
  if (t < 0) return { big: Math.ceil(-t), label: 'Prepárate', sub: '', color: 'var(--amber)', cue: Math.ceil(-t) <= 3 ? `lead${Math.ceil(-t)}` : null };
  if (plan.total != null && t >= plan.total) return { big: clock(plan.total), label: mode === 'for_time' ? 'Time cap' : '¡Tiempo!', sub: '', color: 'var(--red)', end: true };
  if (mode === 'emom') {
    const iv = opts.intervalS ?? 60, k = Math.floor(t / iv), left = iv - (t % iv);
    const slots = opts.slots?.length ? opts.slots : null;
    return { big: clock(left), label: `Minuto ${k + 1} de ${Math.round(plan.total / iv)}`, sub: slots ? slots[k % slots.length] : '', color: left <= 3 ? 'var(--amber)' : 'var(--green)', cue: left <= 3 ? `iv${k}-${Math.ceil(left)}` : null, newIv: `start${k}` };
  }
  if (mode === 'tabata') {
    const w = opts.work ?? 20, r = opts.rest ?? 10, cyc = w + r, k = Math.floor(t / cyc), inCyc = t % cyc, work = inCyc < w;
    const left = work ? w - inCyc : cyc - inCyc;
    return { big: clock(left), label: work ? `Trabajo · ${k + 1}/${opts.rounds ?? 8}` : 'Descanso', sub: '', color: work ? 'var(--green)' : 'var(--blue)', cue: left <= 3 ? `tb${k}-${work}-${Math.ceil(left)}` : null, newIv: `tb${k}-${work}` };
  }
  if (mode === 'amrap') return { big: clock(plan.total - t), label: `AMRAP ${Math.round(plan.total / 60)}'`, sub: `Rondas: ${state.rounds}`, color: plan.total - t <= 10 ? 'var(--amber)' : 'var(--green)', cue: plan.total - t <= 3 ? `am${Math.ceil(plan.total - t)}` : null };
  if (opts.laps) { const k = state.laps.length; return { big: clock(t), label: opts.laps[k] ?? 'Final', sub: `Tramo ${clock(t - state.lapAt)}${k ? ` · anterior ${clock(state.laps[k - 1])}` : ''}`, color: 'var(--green)' }; }
  return { big: clock(t), label: plan.total ? `For Time · cap ${Math.round(plan.total / 60)}'` : 'For Time', sub: state.rounds ? `Rondas: ${state.rounds}` : '', color: 'var(--green)' };
}

function draw() {
  if (!state) return;
  const p = phase();
  // Pitidos: 3-2-1 cortos y uno largo al empezar cada intervalo.
  if (p.cue && p.cue !== state.lastBeep) { state.lastBeep = p.cue; beep(p.cue.endsWith('-1') || p.cue === 'lead1' || p.cue === 'am1' ? 880 : 660, 120); }
  if (p.newIv && p.newIv !== state.lastIv) { if (state.lastIv !== undefined) beep(1200, 380, 0.35); state.lastIv = p.newIv; }
  if (!state.started0 && elapsed() >= 0 && state.start) { state.started0 = true; beep(1200, 450, 0.35); }
  if (p.end && !state.ended) { state.ended = true; beep(440, 900, 0.4); if (state.mode === 'for_time') return finish(true); state.pausedAt = performance.now(); state.paused = true; try { wake?.release?.(); } catch { /* */ } }
  const canRound = !state.opts.laps && (state.mode === 'amrap' || state.mode === 'for_time');
  const canLap = !!state.opts.laps && state.start && elapsed() >= 0;
  // La estructura se pinta una vez; cada fotograma solo cambia los textos (si no, un toque a mitad de repintado se pierde).
  if (!state.el.querySelector('.tm-big')) {
    state.el.innerHTML = `<div class="tm-top"><button data-t="close" class="sm ghost">✕</button><span class="tm-title">${(state.opts.title ?? '').replace(/[<>&]/g, '')}</span></div>
      <div class="tm-label"></div><div class="tm-big"></div><div class="tm-sub"></div><div class="tm-actions"></div><p class="xs muted center tm-hint"></p>`;
  }
  const q = (c) => state.el.querySelector(c);
  q('.tm-label').textContent = p.label; q('.tm-big').textContent = p.big; q('.tm-big').style.color = p.color; q('.tm-sub').textContent = p.sub ?? '';
  q('.tm-hint').textContent = !state.start ? 'Cuenta atrás de 10 s. La pantalla no se apagará.' : '';
  const sig = [!state.start, state.paused, canRound && state.start, canLap, canLap && state.laps.length + 1 >= state.opts.laps.length, state.mode === 'for_time' && state.start && !state.opts.laps].join('|');
  if (sig !== state.sig) {
    state.sig = sig;
    q('.tm-actions').innerHTML = `<button data-t="go" class="${!state.start ? 'primary' : ''}">${!state.start ? '▶ Empezar' : state.paused ? '▶ Seguir' : 'Ⅱ Pausa'}</button>
      ${canRound && state.start ? '<button data-t="round">+1 ronda</button>' : ''}
      ${canLap ? `<button data-t="lap" class="primary" style="min-width:220px">⏭ ${state.laps.length + 1 >= state.opts.laps.length ? 'Terminar' : 'Siguiente tramo'}</button>` : ''}
      ${state.mode === 'for_time' && state.start && !state.opts.laps ? '<button data-t="done" class="green">✓ Terminado</button>' : ''}`;
  }
}

function finish(capped = false) {
  const s = Math.round(Math.min(elapsed(), state.plan.total ?? Infinity));
  const { onDone } = state.opts;
  const rounds = state.rounds, laps = state.laps;
  closeTimer();
  onDone?.(s, { capped, rounds, laps });
}

export function closeTimer() {
  cancelAnimationFrame(raf);
  try { wake?.release?.(); } catch { /* */ }
  wake = null;
  document.getElementById('timer')?.remove();
  state = null;
}
