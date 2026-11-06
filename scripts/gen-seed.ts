// Genera los seeds SQL desde el motor:  node scripts/gen-seed.ts
import { writeFileSync } from 'node:fs';
import { EXERCISES } from '../engine/src/exercises.ts';
import { REFERENCE_FOODS } from '../engine/src/foods.ts';
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const ex = EXERCISES.map((e) => `  (${q(e.id)}, ${q(e.name)}, ${q(e.category)}, ${q(e.unit)}, array[${e.aliases.map(q).join(', ')}]::text[], ${e.prTracked ? q(e.prTracked) : 'null'})`);
writeFileSync('supabase/migrations/0002_seed_exercises.sql', `-- Generado desde engine/src/exercises.ts (node scripts/gen-seed.ts). No editar a mano.\ninsert into public.exercises (id, name, category, unit, aliases, pr_tracked) values\n${ex.join(',\n')}\non conflict (id) do update set name = excluded.name, category = excluded.category, unit = excluded.unit, aliases = excluded.aliases, pr_tracked = excluded.pr_tracked;\n`);
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fd = REFERENCE_FOODS.map((f) => { const p = f.per100; return `  (${q(f.id)}, ${q(f.name)}, ${p.kcal}, ${p.protein}, ${p.carbs}, ${p.fat}, ${p.fiber ?? 'null'}, ${p.vitCMg ?? 'null'}, ${p.magnesiumMg ?? 'null'}, ${f.unitGrams ?? 'null'}, 'reference', array[${norm(f.name).split(/\s+/).concat(norm(f.name)).map(q).join(', ')}]::text[])`; });
writeFileSync('supabase/migrations/0004_seed_foods.sql', `-- Generado desde engine/src/foods.ts. Valores por 100 g (USDA SR Legacy, redondeados).\ninsert into public.foods (id, name, kcal, protein, carbs, fat, fiber, vit_c_mg, magnesium_mg, unit_grams, source, search_terms) values\n${fd.join(',\n')}\non conflict (id) do nothing;\n`);
console.log('seeds generados');
