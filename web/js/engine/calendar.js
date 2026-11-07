// Generado por scripts/build-web-engine.mjs desde engine/src/calendar.ts. No editar.
// Calendario: lectura de ICS (suscripción que ofrece WodBuster en "Calendarios" u otro calendario),
// clasificación de eventos (clase de CrossFit reservada / otro entreno / ocupado) y huecos disponibles.

import { addDays } from './fitness.js';

                                
              
                
                                     
                                     
                  
                    
                    
 

/** Offset (minutos) de Europe/Madrid en un instante dado. */
function madridOffsetMin(utcMs        )         {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(utcMs)).reduce                        ((a, p) => { a[p.type] = p.value; return a; }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

/** Hora local de Madrid → ISO UTC. */
export function madridToUtc(y        , mo        , d        , h        , mi        , s = 0)         {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let off = madridOffsetMin(guess);
  off = madridOffsetMin(guess - off * 60000);
  return new Date(guess - off * 60000).toISOString();
}

export function madridLocal(iso        )                                                 {
  const ms = Date.parse(iso);
  const local = new Date(ms + madridOffsetMin(ms) * 60000);
  return { date: local.toISOString().slice(0, 10), hour: local.getUTCHours(), minute: local.getUTCMinutes() };
}

function parseIcsDate(prop        , value        )                                          {
  const v = value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { iso: madridToUtc(+y, +mo, +d, 0, 0), allDay: true };
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))).toISOString(), allDay: false };
  // TZID distinto de Madrid: se asume hora local española (el caso de los boxes en España).
  void prop;
  return { iso: madridToUtc(+y, +mo, +d, +h, +mi, +(s ?? 0)), allDay: false };
}

const unescape = (s        ) => s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();

/** Parser ICS mínimo y robusto (RFC 5545: líneas plegadas, DTSTART con TZID o UTC, eventos de día completo). */
export function parseIcs(text        , calendarName         )                  {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out                  = [];
  let cur                                                           = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.DTSTART) {
        const st = parseIcsDate(cur.DTSTART.params, cur.DTSTART.value);
        const en = cur.DTEND ? parseIcsDate(cur.DTEND.params, cur.DTEND.value) : null;
        const status = cur.STATUS?.value?.toUpperCase();
        if (st && status !== 'CANCELLED') {
          const end = en?.iso ?? new Date(Date.parse(st.iso) + (st.allDay ? 864e5 : 3600e3)).toISOString();
          out.push({ uid: cur.UID?.value ?? `${st.iso}-${cur.SUMMARY?.value ?? ''}`, title: unescape(cur.SUMMARY?.value ?? ''), start: st.iso, end, allDay: st.allDay, location: cur.LOCATION ? unescape(cur.LOCATION.value) : undefined, calendar: calendarName });
        }
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':'); if (idx < 0) continue;
    const head = line.slice(0, idx); const value = line.slice(idx + 1);
    const [name, ...params] = head.split(';');
    cur[name.toUpperCase()] = { params: params.join(';'), value };
  }
  return out;
}

                                
                                                                                                              
                                                                                                        
                                                                                               
                                                                            
 

export const DEFAULT_RULES                = {
  crossfitKeywords: ['crossfit', 'cross fit', 'wod', 'cross training', 'crosstraining', 'box ', 'open box', 'halterofilia', 'weightlifting', 'gymnastics', 'hyrox class'],
  crossfitCalendars: ['wodbuster'],
  trainingKeywords: ['padel', 'pádel', 'tenis', 'running', 'carrera', 'natación', 'yoga', 'gimnasio', 'gym'],
  ignoreKeywords: ['cumpleaños', 'recordatorio', 'aviso'],
};

                                                                                

const norm = (s        ) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function classifyEvent(e               , rules                = DEFAULT_RULES)            {
  const t = ` ${norm(e.title)} `; const cal = norm(e.calendar ?? '');
  if (rules.ignoreKeywords.some((k) => t.includes(norm(k)))) return 'ignore';
  if (!e.allDay && (rules.crossfitCalendars.some((c) => cal.includes(norm(c))) || rules.crossfitKeywords.some((k) => t.includes(norm(k))))) return 'crossfit_class';
  if (rules.trainingKeywords.some((k) => t.includes(norm(k)))) return 'other_training';
  return 'busy';
}

                                                                                                                                  

                                                                                                  

const AM = [6 * 60, 14 * 60], PM = [14 * 60, 22 * 60];

/** Clases reservadas (sesiones fijas) y bloqueos de franjas por eventos ocupados, para un rango de días. */
export function calendarConstraints(events                 , from        , to        , rules                = DEFAULT_RULES)                                                                                                     {
  const fixed                 = []; const overrides                               = {}; const otherTraining                  = [];
  const busy                                     = {};
  for (const e of events) {
    const kind = classifyEvent(e, rules);
    if (kind === 'ignore') continue;
    if (e.allDay) {
      if (kind !== 'busy') continue;
      const d0 = madridLocal(e.start).date; const d1 = madridLocal(e.end).date;   // fin exclusivo en eventos de día completo
      for (let d = d0; d === d0 || d < d1; d = addDays(d, 1)) if (d >= from && d <= to) overrides[d] = { am: false, pm: false, maxMinutes: 0, reason: e.title };
      continue;
    }
    const s = madridLocal(e.start); const en = madridLocal(e.end);
    if (s.date < from || s.date > to) continue;
    const startMin = s.hour * 60 + s.minute; const endMin = en.date === s.date ? en.hour * 60 + en.minute : 24 * 60;
    const minutes = Math.max(0, endMin - startMin);
    if (kind === 'crossfit_class') {
      fixed.push({ date: s.date, slot: startMin < 14 * 60 ? 'am' : 'pm', startLocal: `${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`, minutes: minutes || 60, title: e.title, uid: e.uid });
      continue;
    }
    if (kind === 'other_training') { otherTraining.push(e); continue; }
    (busy[s.date] ??= []).push([startMin, endMin]);
  }
  // Una franja sigue disponible si queda un hueco seguido de ≥ 75 min (entreno + ducha o desplazamiento).
  const maxGap = (iv                    , [w0, w1]          ) => {
    let t = w0, best = 0;
    for (const [a, b] of [...iv].sort((x, y) => x[0] - y[0])) { if (b <= t) continue; if (a >= w1) break; best = Math.max(best, Math.min(a, w1) - t); t = Math.max(t, b); }
    return Math.max(best, w1 - Math.min(w1, t));
  };
  for (const [d, iv] of Object.entries(busy)) {
    const o = (overrides[d] ??= {});
    if (o.maxMinutes === 0) continue;
    if (maxGap(iv, AM) < 75) o.am = false;
    if (maxGap(iv, PM) < 75) o.pm = false;
    if (o.am === false || o.pm === false) o.reason = 'agenda ocupada';
  }
  return { fixed: fixed.sort((a, b) => (a.date + a.startLocal).localeCompare(b.date + b.startLocal)), overrides, otherTraining };
}
