// node bake.mjs [--px 128] [--out ../share]  — bakes one sprite sheet per Haiku variant (0..11) and one for chibi Opus
import puppeteer from 'puppeteer-core';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const px = +arg('px', 128), out = path.resolve(here, arg('out', '../share'));
const who = (arg('who', '0,1,2,3,4,5,6,7,8,9,10,11,opus')).split(',').map(w => w === 'opus' ? w : +w);
fs.mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(here, 'bake.html')).href); await page.evaluate(() => window.ready);
const index = {};
for (const w of who) {
  const { png, meta } = await page.evaluate((w, px) => bakeSheet(w, px), w, px);
  const name = w === 'opus' ? 'opus' : `haiku${String(w).padStart(2, '0')}`;
  fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(png.split(',')[1], 'base64'));
  index[name] = meta; console.log(name, meta.cols + ' cols');
}
fs.writeFileSync(path.join(out, 'sheets.json'), JSON.stringify(index, null, 1));
await browser.close();
