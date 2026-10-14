// node bake.mjs [--px 160] [--out ../share] [--who 0,3,opus2]  — bakes share/<who>/<state>.png strips + sheets.json
//   for the twelve Haiku variants and eight chibi-Opus variants. Custom looks (see ohLook in haiku.js) come from
//   --looks DIR (default ~/.config/ohaiku/looks): --who look:NAME bakes one as share/look-NAME (and look-NAME-VARIANT
//   for each of its variants); --who looks bakes them all
import puppeteer from 'puppeteer-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const px = +arg('px', 128), out = path.resolve(here, arg('out', '../share'));
let who = (arg('who', '0,1,2,3,4,5,6,7,8,9,10,11,opus0,opus1,opus2,opus3,opus4,opus5,opus6,opus7')).split(',').map(w => /^(opus|look)/.test(w) ? w : +w);
const looksDir = arg('looks', path.join(os.homedir(), '.config/ohaiku/looks'));
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(here, 'bake.html')).href); await page.evaluate(() => window.ready);
if (fs.existsSync(looksDir)) for (const f of fs.readdirSync(looksDir).filter(f => f.endsWith('.js')).sort())
  await page.addScriptTag({ content: fs.readFileSync(path.join(looksDir, f), 'utf8') + '\n//# sourceURL=' + f });
const looks = await page.evaluate(() => Object.fromEntries(Object.entries(HK_LOOKS).map(([k, L]) => [k, L.variants || null])));
who = who.flatMap(w => w === 'looks' ? Object.keys(looks).map(k => 'look:' + k) : [w])
  .flatMap(w => typeof w === 'string' && w.startsWith('look:') && !w.includes('@') && looks[w.slice(5)] ? looks[w.slice(5)].map(v => w + '@' + v) : [w]);
const index = fs.existsSync(path.join(out, 'sheets.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'sheets.json'))) : {};
for (const w of who) {
  const { out: strips, meta } = await page.evaluate((w, px, only) => bakeStrips(w, px, only), w, px, arg('states', '') ? arg('states').split(',') : null);
  const name = typeof w !== 'string' ? `haiku${String(w).padStart(2, '0')}` : w.startsWith('look:') ? 'look-' + w.slice(5).replace('@', '-') : w;
  fs.mkdirSync(path.join(out, name), { recursive: true });
  for (const [st, png] of Object.entries(strips)) fs.writeFileSync(path.join(out, name, st + '.png'), Buffer.from(png.split(',')[1], 'base64'));
  index[name] = index[name] && arg('states', '') ? { ...index[name], states: { ...index[name].states, ...meta.states } } : meta; console.log(name, Object.keys(strips).length + ' states');
}
fs.writeFileSync(path.join(out, 'sheets.json'), JSON.stringify(index, null, 1));
if (!arg('states', '') && !who.every(w => typeof w === 'string' && w.startsWith('look:'))) { // the blooms
  const blooms = await page.evaluate((px) => bakeBlooms(px), Math.round(px * .5));
  fs.mkdirSync(path.join(out, 'blooms'), { recursive: true });
  for (const [k, png] of Object.entries(blooms)) fs.writeFileSync(path.join(out, 'blooms', k + '.png'), Buffer.from(png.split(',')[1], 'base64'));
  console.log('blooms', Object.keys(blooms).length);
}
await browser.close();
