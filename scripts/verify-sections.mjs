import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/PC/AppData/Roaming/npm/node_modules/playwright');
import { mkdirSync } from 'fs';
import path from 'path';

const OUT = 'scripts/screenshots';
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5174';

const browser = await chromium.launch({ headless: true });
const results = [];

function log(label, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'INFO' ? 'ℹ️' : '❌';
  console.log(`${icon} [${label}] ${detail}`);
  results.push({ label, status, detail });
}

// ── 1. Homepage — all sections present ───────────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);

  const checks = {
    'DualCTA heading': 'Cari Properti Impian',
    'CoverageArea heading': 'Jangkauan Area SBP',
    'FAQ heading': 'Pertanyaan Umum',
    'FAQ link to /faq': '/faq',
    'Dual CTA: Cari Sekarang btn': 'Cari Sekarang',
    'Dual CTA: Titip Jual btn': 'Titip Jual Sekarang',
  };
  for (const [label, text] of Object.entries(checks)) {
    const found = await page.locator(`text=${text}`).count() > 0;
    log(label, found ? 'PASS' : 'FAIL', found ? `"${text}" ditemukan` : `"${text}" TIDAK ditemukan`);
  }

  // Dual CTA link targets
  const cariHref = await page.locator('a:has-text("Cari Sekarang")').getAttribute('href');
  log('DualCTA Cari link', cariHref === '/properties' ? 'PASS' : 'FAIL', `href="${cariHref}"`);
  const titipHref = await page.locator('a:has-text("Titip Jual Sekarang")').getAttribute('href');
  log('DualCTA TitipJual link', titipHref === '/titip-jual' ? 'PASS' : 'FAIL', `href="${titipHref}"`);

  // FAB WhatsApp present (homepage — should show)
  const fabCount = await page.locator('a[href*="wa.me/6281391278889?text="]').count();
  log('FAB visible on homepage', fabCount > 0 ? 'PASS' : 'FAIL', `${fabCount} FAB element(s) found`);

  // FAB href correct
  if (fabCount > 0) {
    const fabHref = await page.locator('a[href*="wa.me/6281391278889?text="]').getAttribute('href');
    log('FAB href', 'INFO', fabHref ?? 'not found');
  }

  // Screenshot — full page desktop
  await page.screenshot({ path: path.join(OUT, 'verify-desktop-full.png'), fullPage: true });

  await page.close();
}

// ── 2. Homepage mobile — section-by-section ───────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);

  // Scroll to Dual CTA section
  await page.locator('text=Cari Properti Impian').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'verify-mobile-dualcta.png') });
  log('Screenshot DualCTA mobile', 'INFO', 'verify-mobile-dualcta.png');

  // Scroll to Coverage Area section
  await page.locator('text=Jangkauan Area SBP').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'verify-mobile-coverage.png') });
  log('Screenshot Coverage Area mobile', 'INFO', 'verify-mobile-coverage.png');

  // Check if Coverage Area chips exist (will be empty in dev without DB)
  const chipCount = await page.locator('a[href*="kecamatan="]').count();
  log('Coverage Area chips', chipCount > 0 ? 'PASS' : 'INFO',
    chipCount > 0 ? `${chipCount} chips ditemukan` : 'No chips — dev mode tanpa DB (expected, akan ada di production)');

  // Scroll to Blog section
  await page.locator('text=Artikel & Tips Properti').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'verify-mobile-blog.png') });

  // Blog images — check src attributes
  const blogImgs = await page.locator('section:has(h2:has-text("Artikel")) img').count();
  log('Blog images present', blogImgs > 0 ? 'PASS' : 'INFO', `${blogImgs} gambar blog ditemukan`);

  // Blog card link slugs
  const blogLinks = await page.locator('section:has(h2:has-text("Artikel")) a[href^="/blog/"]').all();
  for (const link of blogLinks) {
    const href = await link.getAttribute('href');
    log('Blog card link', 'INFO', href ?? 'null');
  }

  // Scroll to FAQ
  await page.locator('text=Pertanyaan Umum').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'verify-mobile-faq.png') });

  // FAQ accordion click test
  const faqItem = page.locator('button[aria-expanded]').first();
  await faqItem.click();
  await page.waitForTimeout(300);
  const expanded = await faqItem.getAttribute('aria-expanded');
  log('FAQ accordion click', expanded === 'true' ? 'PASS' : 'FAIL', `aria-expanded=${expanded}`);
  await page.screenshot({ path: path.join(OUT, 'verify-mobile-faq-open.png') });

  // FAQ link to /faq
  const faqMoreLink = await page.locator('a:has-text("Lihat Semua FAQ")').getAttribute('href');
  log('FAQ "Lihat Semua" link', faqMoreLink === '/faq' ? 'PASS' : 'FAIL', `href="${faqMoreLink}"`);

  await page.close();
}

// ── 3. FAB hidden on property detail route ────────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });

  // Navigate to a property detail URL (will 404 in dev but router still renders Layout)
  await page.goto(`${BASE}/dijual/rumah/di-yogyakarta/sleman/depok/test-slug`, {
    waitUntil: 'domcontentloaded', timeout: 15000
  }).catch(() => {});
  await page.waitForTimeout(800);

  const fabOnDetail = await page.locator('a[href*="wa.me/6281391278889?text="]').count();
  log('FAB hidden on /dijual/* detail', fabOnDetail === 0 ? 'PASS' : 'FAIL',
    fabOnDetail === 0 ? 'FAB tidak tampil (correct)' : `FAB masih tampil! (${fabOnDetail}x)`);
  await page.screenshot({ path: path.join(OUT, 'verify-fab-hidden-detail.png') });

  await page.close();
}

// ── 4. Navigate to /properties via Dual CTA ──────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);

  await page.locator('a:has-text("Cari Sekarang")').scrollIntoViewIfNeeded();
  const [navResp] = await Promise.all([
    page.waitForNavigation({ timeout: 10000 }).catch(() => null),
    page.locator('a:has-text("Cari Sekarang")').click(),
  ]);
  await page.waitForTimeout(1000);
  const url = page.url();
  log('DualCTA click → /properties', url.includes('/properties') ? 'PASS' : 'FAIL', `navigated to: ${url}`);
  await page.screenshot({ path: path.join(OUT, 'verify-cta-properties-nav.png') });

  await page.close();
}

// ── 5. Navigate to /titip-jual ───────────────────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);

  await page.locator('a:has-text("Titip Jual Sekarang")').scrollIntoViewIfNeeded();
  const [navResp] = await Promise.all([
    page.waitForNavigation({ timeout: 10000 }).catch(() => null),
    page.locator('a:has-text("Titip Jual Sekarang")').click(),
  ]);
  await page.waitForTimeout(1000);
  const url = page.url();
  log('DualCTA click → /titip-jual', url.includes('/titip-jual') ? 'PASS' : 'FAIL', `navigated to: ${url}`);
  await page.screenshot({ path: path.join(OUT, 'verify-cta-titipjual-nav.png') });
  await page.close();
}

// ── 6. Breakpoint 640px Dual CTA layout ──────────────────────────────────────
{
  const page = await browser.newPage();
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);
  await page.locator('text=Cari Properti Impian').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'verify-640-dualcta.png') });
  log('Screenshot 640px DualCTA', 'INFO', 'verify-640-dualcta.png');
  await page.close();
}

await browser.close();

console.log('\n─────────────────────────────');
console.log(`Hasil: ${results.filter(r=>r.status==='PASS').length} PASS  |  ${results.filter(r=>r.status==='FAIL').length} FAIL  |  ${results.filter(r=>r.status==='INFO').length} INFO`);
