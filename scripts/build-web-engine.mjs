// Convierte el motor (TypeScript con sintaxis borrable) a JavaScript para el navegador: web/js/engine/*.js.
// Así el registro de CrossFit interpreta el texto al instante, sin esperar al servidor. Requiere Node 22.13+.
import { stripTypeScriptTypes } from 'node:module';
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'engine/src'), out = join(root, 'web/js/engine');
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
for (const f of readdirSync(src).filter((x) => x.endsWith('.ts'))) {
  let js = stripTypeScriptTypes(readFileSync(join(src, f), 'utf8'), { mode: 'strip' });
  js = js.replace(/(from\s+['"]\.\/[\w-]+)\.ts(['"])/g, '$1.js$2').replace(/^\s*import\s+(type\s+)?\{\s*\}\s+from\s+['"][^'"]+['"];?\s*$/gm, '');
  writeFileSync(join(out, f.replace(/\.ts$/, '.js')), `// Generado por scripts/build-web-engine.mjs desde engine/src/${f}. No editar.\n${js}`);
}
console.log('Motor web generado → web/js/engine');
