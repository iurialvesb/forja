// POST /calendar-sync { events?: CalendarEvent[] (leídos del iPhone con EventKit), settings? }
// Además descarga las suscripciones ICS configuradas (p. ej. la de WodBuster). Si cambian tus clases
// reservadas o tus huecos libres, se reorganizan las semanas (respetando lo hecho y lo fijado).
import { handler, json, requireUser, userClient } from '../_shared/supabase.ts';
import { loadContext } from '../_shared/context.ts';
import { ensureWeeks } from '../_shared/replan.ts';
import { parseIcs, classifyEvent, DEFAULT_RULES, type CalendarEvent } from '../_shared/engine/index.ts';

Deno.serve(handler(async (req) => {
  const sb = userClient(req);
  const userId = await requireUser(sb);
  const body = await req.json().catch(() => ({}));
  if (body.settings) await sb.from('calendar_settings').upsert({ user_id: userId, ...body.settings });
  let { data: set } = await sb.from('calendar_settings').select('*').maybeSingle();
  if (!set) { await sb.from('calendar_settings').upsert({ user_id: userId }); set = { ics_urls: [], crossfit_keywords: [], crossfit_calendars: [] }; }
  const rules = { ...DEFAULT_RULES, crossfitKeywords: [...DEFAULT_RULES.crossfitKeywords, ...(set.crossfit_keywords ?? [])], crossfitCalendars: [...DEFAULT_RULES.crossfitCalendars, ...(set.crossfit_calendars ?? [])] };

  const now = Date.now(); const horizon = now + 22 * 864e5;
  const errors: string[] = [];
  const ics: CalendarEvent[] = [];
  for (const url of set.ics_urls ?? []) {
    try {
      const res = await fetch(url.replace(/^webcal:/, 'https:'), { headers: { 'User-Agent': 'Forja/0.1' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ics.push(...parseIcs(await res.text(), /wodbuster/i.test(url) ? 'WodBuster' : 'ICS'));
    } catch (e) { errors.push(`No pude leer el calendario ${new URL(url.replace(/^webcal:/, 'https:')).host}: ${(e as Error).message}`); }
  }
  const device: CalendarEvent[] = body.events ?? [];
  const inRange = (e: CalendarEvent) => Date.parse(e.end) >= now - 864e5 && Date.parse(e.start) <= horizon;
  const rows = [...device.map((e) => ({ e, source: 'device' })), ...ics.map((e) => ({ e, source: 'ics' }))].filter((x) => inRange(x.e))
    .map(({ e, source }) => ({ user_id: userId, uid: `${source}:${e.uid}`.slice(0, 250), title: e.title.slice(0, 200), start_at: e.start, end_at: e.end, all_day: e.allDay, calendar: e.calendar ?? null, kind: classifyEvent(e, rules), source, synced_at: new Date().toISOString() }));
  // Reemplazar la ventana sincronizada de cada fuente (así desaparecen las clases anuladas).
  if (body.events) await sb.from('calendar_events').delete().eq('source', 'device').gte('start_at', new Date(now - 864e5).toISOString());
  if ((set.ics_urls ?? []).length && !errors.length) await sb.from('calendar_events').delete().eq('source', 'ics').gte('start_at', new Date(now - 864e5).toISOString());
  if (rows.length) await sb.from('calendar_events').upsert(rows, { onConflict: 'user_id,uid' });

  const ctx = await loadContext(sb, userId);
  const hash = JSON.stringify([ctx.calendar?.fixed.map((f) => [f.date, f.startLocal]), ctx.calendar?.overrides]);
  let replanned = false; let notes: string[] = [];
  if (hash !== set.last_hash) {
    notes = await ensureWeeks(sb, ctx, true);
    await sb.from('calendar_settings').update({ last_hash: hash, updated_at: new Date().toISOString() }).eq('user_id', userId);
    replanned = true;
  }
  return json({ events: rows.length, crossfitClasses: ctx.calendar?.fixed ?? [], blockedDays: ctx.calendar?.overrides ?? {}, replanned, notes, errors });
}));
