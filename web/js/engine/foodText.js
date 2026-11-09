// Generado por scripts/build-web-engine.mjs desde engine/src/foodText.ts. No editar.
// Intérprete instantáneo de lo que has comido, sin IA: «wrap de avena de hacendado, canónigos, un huevo revuelto y medio
// aguacate como almuerzo» → alimentos con gramos (dichos o estimados) y la comida. Se ejecuta en el navegador al escribir.
// Lo que no reconoce se manda al servidor (IA + bases de datos) solo para esas partes.

                               
                                                  
                                                          
                
                                        
                 
                   
 
                                                                        

                                                                                                                                       

const norm = (s        ) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%.,/ ]/g, ' ').replace(/\s+/g, ' ').trim();

const NUMS                         = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, medio: 0.5, media: 0.5, cuarto: 0.25, 'un cuarto': 0.25, 'medio kilo': 500, doble: 2 };
const SLOTS                     = [[/\b(desayuno|desayunado)\b/, 'desayuno'], [/\b(almuerzo|almorzado|media manana)\b/, 'media_manana'], [/\b(comida|comido a mediodia)\b/, 'comida'], [/\b(merienda|merendado)\b/, 'merienda'], [/\b(cena|cenado)\b/, 'cena'], [/\b(pre ?entreno)\b/, 'pre_entreno'], [/\b(post ?entreno)\b/, 'post_entreno']];
const BRANDS = ['hacendado', 'mercadona', 'consum', 'carrefour', 'dia', 'lidl', 'alcampo', 'eroski', 'pascual', 'danone', 'president', 'el pozo', 'campofrio', 'bimbo', 'mission', 'oykos', 'alpro', 'central lechera asturiana', 'kaiku', 'realfooding'];
const COOK = /\b(revuelt[oa]s?|a la plancha|plancha|cocid[oa]s?|hervid[oa]s?|asad[oa]s?|al horno|frit[oa]s?|a la brasa|al vapor|salteado?s?|crud[oa]s?|picad[oa]s?|en tortilla|natural)\b/g;

// Contenedores y medidas caseras (g).
const MEASURES                                                  = [
  [/^cucharadas? (soperas?|grandes?)?/, (f) => (/aceite/.test(f) ? 10 : /miel|azucar|crema|mantequilla/.test(f) ? 15 : 12)],
  [/^cucharaditas?/, 5],
  [/^(tazas?|tazones?)/, 200], [/^(vasos?)/, 200], [/^(cuencos?|boles?|bowls?)/, 250],
  [/^punados?/, (f) => (/canonigos|rucula|lechuga|espinaca|brote/.test(f) ? 30 : 25)],
  [/^rebanadas?/, 30], [/^tostadas?/, 30], [/^lonchas?|^lonchitas?/, 15], [/^latas?/, (f) => (/atun/.test(f) ? 60 : 120)],
  [/^(platos?)/, 300], [/^(raciones?|porciones?)/, 150], [/^(trozos?|pedazos?)/, 40], [/^(onzas?)/, 10], [/^(scoops?|cacitos?|cazos?)/, 30], [/^(chorritos?|chorros?)/, 5],
  [/^(bolsas?)/, 100], [/^(botes?)/, 250], [/^(briks?)/, 1000], [/^(sobres?)/, 30], [/^(piezas?|unidades?|uds?)/, 0],
];
// Peso de una unidad de cosas que se cuentan (g, parte comestible).
const UNIT_G                     = [
  [/huevo/, 60], [/clara/, 33], [/aguacate/, 140], [/platano|banana/, 120], [/manzana/, 180], [/naranja/, 180], [/mandarina/, 80], [/kiwi/, 75], [/pera/, 170], [/melocoton/, 150],
  [/yogur|yogurt|skyr|kefir/, 125], [/wrap|tortilla de (trigo|avena|maiz)|fajita/, 40], [/tortita/, 9], [/pan de molde|rebanada/, 30], [/barrita/, 40], [/galleta/, 10],
  [/tomate/, 120], [/patata/, 200], [/boniato/, 250], [/zanahoria/, 80], [/pepino/, 200], [/cebolla/, 110], [/pimiento/, 150], [/calabacin/, 250],
  [/croissant|cruasan/, 50], [/magdalena/, 30], [/bocadillo|bocata/, 120], [/hamburguesa/, 120], [/salchicha/, 50], [/filete|pechuga/, 150], [/lata de atun|atun/, 60],
  [/cafe/, 100], [/cafe con leche/, 200], [/vaso de leche|leche/, 200],
];
// Ración típica cuando no dices cantidad de algo que no se cuenta.
const PORTION_G                     = [
  [/canonigos|rucula|lechuga|espinaca|brotes|ensalada verde/, 40], [/arroz|pasta|macarrones|espagueti|quinoa|cuscus/, 180], [/lentejas|garbanzos|alubias/, 200],
  [/aceite/, 10], [/queso fresco batido|requeson/, 150], [/queso/, 30], [/jamon|pavo|lomo embuchado|fiambre/, 30], [/nueces|almendras|frutos secos|cacahuetes/, 25],
  [/avena|granola|cereales|muesli/, 50], [/pollo|ternera|cerdo|salmon|merluza|atun fresco|pescado|carne/, 150], [/brocoli|judias|verdura|champinones/, 150],
  [/chocolate/, 20], [/miel|mermelada|crema de cacahuete/, 15], [/pan/, 60], [/fruta/, 150], [/leche/, 200], [/cafe/, 100],
];

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'y', 'en', 'a', 'al', 'un', 'una', 'unos', 'unas', 'mi', 'para', 'sin', 'poco', 'algo', 'he', 'comido', 'tomado', 'me', 'como', 'he tomado']);

function pick   (list               , s        )                { for (const [re, v] of list) if (re.test(s)) return v; return undefined; }
const singular = (w        ) => (w.length > 4 && w.endsWith('es') && !/(aves|eses)$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
export const foodTokens = (s        ) => norm(s).split(' ').filter((w) => w && !STOP.has(w) && !/^\d/.test(w) && w !== '%').map(singular);

/** Texto libre → alimentos con gramos y comida (si la dices). */
export function parseFoodText(text        )                 {
  let t = norm(text).replace(/\bmedio\b/g, ' medio ');
  let slot                    ;
  // «como almuerzo», «para cenar», «en la comida»
  for (const [re, s] of SLOTS) {
    const m = t.match(new RegExp(`\\b(?:como|de|para|en el|en la|al|del|en)?\\s*${re.source}\\b`));
    if (m) { slot = s; t = t.replace(m[0], ' '); break; }
  }
  t = t.replace(/\b(he comido|he tomado|he cenado|he desayunado|me he tomado|hoy|esta manana|esta tarde|esta noche)\b/g, ' ');
  // Separadores: comas, «y», «+», punto y coma, saltos. «con» separa salvo en compuestos conocidos.
  // Compuestos de diario: se reparten en sus ingredientes con la cantidad típica del acompañamiento.
  t = t.replace(/\bcafe con leche\b/g, 'cafe, 100 ml de leche').replace(/\bcafe cortado\b/g, 'cafe, 30 ml de leche')
    .replace(/\bcon tomate( rallado| triturado)?\b/g, ', 30 g de tomate').replace(/\bcon aceite\b/g, ', 5 g de aceite').replace(/\bcon un chorrito de aceite\b/g, ', 5 g de aceite');
  const KEEP_CON = /(arroz con leche|leche con cacao)/;
  const parts = t.split(/[,;+\n]|\s+y\s+|\s+e\s+|\.\s/).flatMap((p) => (KEEP_CON.test(p) ? [p] : p.split(/\s+con\s+/))).map((p) => p.trim()).filter((p) => p.length > 1);
  const items                 = [];
  for (const raw of parts) {
    let p = ` ${raw} `;
    let brand                    ;
    for (const b of BRANDS) { const re = new RegExp(`\\s(de\\s+)?(la\\s+marca\\s+)?${b}\\s`); if (re.test(p)) { brand = b === 'mercadona' ? 'Hacendado' : b.replace(/\b\w/g, (c) => c.toUpperCase()); p = p.replace(re, ' '); } }
    const cooked = /\b(revuelt|plancha|cocid|hervid|asad|horno|frit|brasa|vapor|saltead)/.test(p);
    p = p.replace(COOK, ' ').replace(/\s+/g, ' ').trim();
    let qty                    ; let grams                    ; let said = false;
    // «200 g de …», «0,5 kg», «250 ml»
    let m = p.match(/^(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos?|kg|kilos?|ml|cl|l|litros?)\b\.?\s*(de\s+)?/);
    if (m) {
      const n = Number(m[1].replace(',', '.')); const u = m[2];
      grams = /^k/.test(u) ? n * 1000 : u === 'cl' ? n * 10 : /^l/.test(u) ? n * 1000 : n; said = true; p = p.slice(m[0].length);
    } else {
      // «2 huevos», «un huevo», «medio aguacate», «1/2 aguacate», «un cuarto de…»
      m = p.match(/^(\d+(?:[.,]\d+)?|\d\/\d|un cuarto|medio kilo|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|medio|media|doble)\b\s*(de\s+)?/);
      if (m) {
        const w = m[1];
        if (w === 'medio kilo') { grams = 500; said = true; }
        else qty = /\//.test(w) ? Number(w[0]) / Number(w[2]) : NUMS[w] ?? Number(w.replace(',', '.'));
        p = p.slice(m[0].length);
      }
      // medida casera tras el número: «dos rebanadas de pan», «una cucharada de aceite», «un puñado de canónigos»
      for (const [re, g] of MEASURES) {
        const mm = p.match(new RegExp(`${re.source}\\s*(de\\s+)?`));
        if (mm && mm.index === 0) {
          const rest = p.slice(mm[0].length);
          const per = typeof g === 'function' ? g(rest) : g;
          if (per > 0) { grams = Math.round((qty ?? 1) * per); said = qty != null; qty = undefined; }
          p = rest; break;
        }
      }
      // «… de 60 g» al final («una lata de atún de 80 g»)
      const tail = p.match(/\s(?:de\s+)?(\d+(?:[.,]\d+)?)\s*(g|gr|gramos|ml)\b/);
      if (tail) { const per = Number(tail[1].replace(',', '.')); grams = Math.round((qty ?? 1) * per); said = true; qty = undefined; p = p.replace(tail[0], ' '); }
    }
    const name = p.replace(/\b(de|del|la|el)\s*$/, '').replace(/^\s*(de|del)\s+/, '').replace(/\s+/g, ' ').trim();
    if (!name || !foodTokens(name).length) continue;
    if (grams == null) {
      const unit = pick(UNIT_G, name);
      if (qty != null && unit) { grams = Math.round(qty * unit); said = true; }
      else if (qty != null) { grams = Math.round(qty * (pick(PORTION_G, name) ?? 100)); }
      else grams = unit ?? pick(PORTION_G, name) ?? 100;
    }
    items.push({ raw: raw.trim(), name, grams: Math.max(1, Math.round(grams)), gramsConfidence: said ? 'dicho' : 'estimado', brand, cooked: cooked || undefined });
  }
  return { items, slot };
}

/**
 * Busca el alimento del catálogo que mejor encaja con un nombre. Todas las palabras importantes del texto deben
 * aparecer en el alimento (o viceversa para nombres de una palabra). Devuelve null si no hay coincidencia clara.
 */
export function matchFood(name        , catalog               , brand         , cooked          )                     {
  const q = foodTokens(name); if (!q.length) return null;
  const b = brand ? norm(brand) : '';
  let best                                       = null;
  for (const f of catalog) {
    const ft = new Set([...foodTokens(f.name), ...(f.terms ?? []).flatMap(foodTokens), ...(f.brand ? foodTokens(f.brand) : [])]);
    const hit = q.filter((w) => ft.has(w)).length;
    if (hit < q.length) continue;                                   // todas las palabras del texto
    const extra = foodTokens(f.name).filter((w) => !q.includes(w) && !(f.brand && foodTokens(f.brand).includes(w)) && !/^(crud|cocid|cruda|seca|lata|bote|polvo)/.test(w)).length;
    let s = 10 - extra * 1.5;                                       // menos palabras de más = más preciso («huevo» → Huevo, no Claras de huevo)
    if (b && f.brand && norm(f.brand).includes(b)) s += 4;
    if (b && norm(f.name).includes(b)) s += 4;
    if (b && f.brand && !norm(f.brand).includes(b)) s -= 2;
    if (f.source === 'reference') s += 0.5;
    if (q.includes(foodTokens(f.name)[0])) s += 3;                  // el alimento «es» lo que dices (aceite → Aceite de oliva, no Atún en aceite)
    const raw = /crud[oa]|secas?\b|\(seco/.test(norm(f.name)), done = /cocid|cocinad|hervid/.test(norm(f.name));
    if (cooked && raw) s -= 6; if (cooked && done) s += 3; if (!cooked && done) s -= 1;
    if (!best || s > best.s) best = { f, s };
  }
  return best && best.s >= 5 ? best.f : null;
}
