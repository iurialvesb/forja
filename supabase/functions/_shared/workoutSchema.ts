// Esquema y prompt para que Claude estructure un entrenamiento (foto o texto pegado por el usuario).
import { EXERCISES } from './engine/index.ts';

const item = {
  type: 'object', additionalProperties: false, required: ['raw', 'exercise'],
  properties: {
    raw: { type: 'string', description: 'Texto literal de la línea tal como aparece' },
    exercise: { type: 'string', description: 'Nombre del ejercicio normalizado en inglés estándar de CrossFit (p. ej. "Power Clean", "Toes to Bar")' },
    reps: { type: 'integer' }, repScheme: { type: 'string', description: 'Esquema tipo "21-15-9" o "5-5-3-3-1"' },
    loadKg: { type: 'number', description: 'SOLO si hay un único peso inequívoco en kg (convierte lb a kg ×0,4536)' },
    loadText: { type: 'string', description: 'Texto literal del peso si es ambiguo: "43/29", "70%", "heavy", "RX"' },
    distanceM: { type: 'number' }, calories: { type: 'number' }, durationS: { type: 'integer' }, notes: { type: 'string' },
  },
};
export const schema = {
  type: 'object', additionalProperties: false, required: ['sourceKind', 'sections', 'uncertainties'],
  properties: {
    sourceKind: { type: 'string', enum: ['whiteboard', 'strava_screenshot', 'apple_fitness_screenshot', 'gym_app', 'other'] },
    title: { type: 'string' }, date: { type: 'string', description: 'YYYY-MM-DD solo si aparece en la imagen' },
    sections: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['kind', 'items'],
      properties: {
        kind: { type: 'string', enum: ['warmup', 'strength', 'skill', 'wod', 'accessory', 'cooldown', 'run', 'station'] },
        format: { type: 'string', enum: ['emom', 'amrap', 'for_time', 'rounds', 'intervals', 'sets', 'tabata', 'chipper', 'steady'] },
        title: { type: 'string' }, timeCapMin: { type: 'number' }, rounds: { type: 'integer' }, emomIntervalS: { type: 'integer' },
        durationMin: { type: 'number' }, restS: { type: 'integer' }, notes: { type: 'string' }, items: { type: 'array', items: item },
      },
    } },
    metrics: { type: 'object', additionalProperties: false, properties: {
      discipline: { type: 'string' }, distanceKm: { type: 'number' }, durationS: { type: 'integer' }, avgHr: { type: 'integer' }, maxHr: { type: 'integer' },
      elevationGainM: { type: 'number' }, calories: { type: 'number' }, avgPaceSecPerKm: { type: 'number' },
    } },
    uncertainties: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'question'],
      properties: { field: { type: 'string' }, question: { type: 'string', description: 'Pregunta en español para el usuario' }, options: { type: 'array', items: { type: 'string' } } } } },
  },
};

export const SYSTEM = `Eres un experto en CrossFit, halterofilia, HYROX y running que transcribe fotos de entrenamientos.
Lee la imagen y estructura TODO el entrenamiento con la herramienta registrar_lectura.

Reglas estrictas:
- No inventes nada. Si una palabra, número o peso no se lee con seguridad, NO lo rellenes: añade una entrada en "uncertainties" con una pregunta concreta en español.
- Separa secciones: calentamiento, fuerza/técnica (strength/skill), WOD (wod), accesorios, vuelta a la calma.
- Formatos: EMOM (indica emomIntervalS y durationMin), AMRAP (timeCapMin = duración), For Time (timeCapMin si hay cap), rondas (rounds), series de fuerza (format "sets").
- Esquemas de repeticiones descendentes o por series ("21-15-9", "5-5-3-3-1") van en repScheme, no en reps.
- Si la pizarra da dos pesos (masculino/femenino, "43/29") o porcentajes, pon el texto en loadText y deja loadKg vacío.
- Libras → kilos (×0,4536) solo si la unidad está escrita.
- Abreviaturas habituales: T2B, C2B, HSPU, DU, KBS, WB, BJ, BMU, RMU, OHS, PC, PS, SC, C&J, DL, FS, BS, SP, PP.
- Para capturas de apps (Strava, Apple Fitness, apps de gimnasio) rellena "metrics" con los datos visibles.
- El resultado del usuario (tiempo, rondas) normalmente no está en la pizarra: no lo supongas.
Ejercicios conocidos por la app: ${EXERCISES.map((e) => e.name).join(', ')}.`;

