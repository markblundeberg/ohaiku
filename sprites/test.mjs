// node test.mjs out.png  — draws window.testSheet() on paper for a look
import puppeteer from 'puppeteer-core';
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
page.on('console', m => console.log('[page]', m.text())); page.on('pageerror', e => console.error('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(here, 'bake.html')).href); await page.evaluate(() => window.ready);
const b64 = await page.evaluate(() => testSheet().toDataURL('image/png').split(',')[1]);
fs.writeFileSync(process.argv[2] || 'test.png', Buffer.from(b64, 'base64'));
await browser.close();
