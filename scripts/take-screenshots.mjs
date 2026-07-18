import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/PC/AppData/Roaming/npm/node_modules/playwright');
import { mkdirSync } from 'fs';
import path from 'path';

const OUT = 'scripts/screenshots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

async function shot(page, name, url, w, h, fullPage = true) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, name), fullPage });
  console.log(`✓ ${name}`);
}

// Homepage
const p1 = await browser.newPage();
await shot(p1, 'home-mobile-390.png', 'http://localhost:5174', 390, 844);
await shot(p1, 'home-desktop-1280.png', 'http://localhost:5174', 1280, 900);
await shot(p1, 'home-640px.png', 'http://localhost:5174', 640, 900);
await p1.close();

// FAB hide test — simulate property detail URL path
const p2 = await browser.newPage();
await p2.setViewportSize({ width: 390, height: 844 });
await p2.goto('http://localhost:5174', { waitUntil: 'networkidle', timeout: 30000 });
await p2.waitForTimeout(800);
// Evaluate: does the regex match for a property detail URL?
const testPaths = [
  '/dijual/rumah/di-yogyakarta/sleman/depok/test-slug',
  '/disewa/kost/di-yogyakarta/bantul/sewon/test-slug',
  '/',
  '/properties',
  '/blog',
];
for (const p of testPaths) {
  const match = /^\/(dijual|disewa)\/[^/]+\//.test(p);
  console.log(`  ${p} → FAB hidden: ${match}`);
}
// Bottom of homepage — FAB should be visible
await p2.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await p2.waitForTimeout(400);
await p2.screenshot({ path: path.join(OUT, 'home-mobile-footer-fab.png'), fullPage: false });
console.log('✓ home-mobile-footer-fab.png');
await p2.close();

await browser.close();
console.log('Done.');
