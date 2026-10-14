// node preview.mjs out.png WHO[,WHO2...] [--states idle,read,...] [--frame 5] [--px 220] [--looks DIR]
//   one contact sheet: a row per WHO (0..11, opusN, look:NAME[@variant]), a column per state, for a quick look
//   at a design without baking it
import puppeteer from 'puppeteer-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const out = process.argv[2], who = (process.argv[3] || 'opus0').split(',').map(w => /^(opus|look)/.test(w) ? w : +w);
const states = arg('states', 'idle,runR,think,bash,edit,read,search,agents,done,sleep,gwatch').split(',');
const frame = +arg('frame', 5), px = +arg('px', 220), looksDir = arg('looks', path.join(os.homedir(), '.config/ohaiku/looks'));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('pageerror', e => console.error('[pageerror]', e.message)); page.on('console', m => console.log('[page]', m.text()));
await page.goto(pathToFileURL(path.join(here, 'bake.html')).href); await page.evaluate(() => window.ready);
if (fs.existsSync(looksDir)) for (const f of fs.readdirSync(looksDir).filter(f => f.endsWith('.js')).sort())
  await page.addScriptTag({ content: fs.readFileSync(path.join(looksDir, f), 'utf8') + '\n//# sourceURL=' + f });
const b64 = await page.evaluate((who, states, frame, px) => {
  const s = px / OH.cellU, c = document.createElement('canvas'); c.width = px * states.length; c.height = px * who.length;
  const g = c.getContext('2d'); g.fillStyle = '#e9e4da'; g.fillRect(0, 0, c.width, c.height);
  who.forEach((w, row) => {
    const S = ohStates(w);
    states.forEach((n, j) => {
      if (!S[n]) return;
      OH_STATE = n;
      g.save(); g.beginPath(); g.rect(j * px, row * px, px, px); g.clip();
      g.translate(j * px + px / 2, row * px + OH.footU * s); g.scale(s, s); S[n].f(g, Math.min(frame, S[n].n - 1)); g.restore();
      g.font = '13px sans-serif'; g.fillStyle = '#777'; g.fillText(n, j * px + 5, row * px + 15);
    });
  });
  OH_STATE = null;
  return c.toDataURL('image/png').split(',')[1];
}, who, states, frame, px);
fs.writeFileSync(out, Buffer.from(b64, 'base64'));
await browser.close();
