/**
 * Inspect search results "ชินจั่ง" จากหน้าหลัก trueid.net
 * Run: node scripts/inspect-trueid-search.js
 * Output: scripts/trueid-search-dump.json + scripts/search-page.png
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');

const KEYWORD = 'ชินจั่ง';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage({
    locale: 'th-TH',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' },
  });

  // ดักจับ ALL JSON responses
  const capturedJson = [];
  const allRequestUrls = [];

  page.on('request', (req) => {
    allRequestUrls.push(`${req.method()} ${req.url()}`);
  });

  page.on('response', async (response) => {
    try {
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const json = await response.json();
      capturedJson.push({
        url: response.url(),
        status: response.status(),
        resp: JSON.stringify(json).slice(0, 600),
        full: json,
      });
      console.log(`📡 ${response.url()}`);
      console.log(`   ${JSON.stringify(json).slice(0, 200)}`);
    } catch {}
  });

  // ── Step 1: เปิดหน้าหลัก ──────────────────────────────────────────────────
  console.log('\n🏠 เปิดหน้าหลัก trueid.net/th-th');
  await page.goto('https://www.trueid.net/th-th', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(2500);

  // ── Step 2: ปิด cookie banner ─────────────────────────────────────────────
  try {
    for (const text of ['ยอมรับ', 'Accept', 'ยอมรับทั้งหมด']) {
      const btn = page.locator(`button:has-text("${text}")`).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(600);
        console.log(`🍪 ปิด cookie (${text})`);
        break;
      }
    }
  } catch {}

  // ── Step 3: คลิก search bar ───────────────────────────────────────────────
  console.log('\n🔍 คลิก search input บน navbar');
  // ลอง selector หลายแบบ
  const searchSelectors = [
    'input[placeholder*="ค้นหา"]',
    'input[type="search"]',
    '[data-testid*="search"] input',
    'button[aria-label*="ค้นหา"]',
    'button[aria-label*="search"]',
    '[class*="search"] input',
    '[class*="Search"] input',
  ];

  let searchInput = null;
  for (const sel of searchSelectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 })) {
        searchInput = el;
        console.log(`✅ พบ search input: ${sel}`);
        break;
      }
    } catch {}
  }

  if (!searchInput) {
    console.error('❌ ไม่พบ search input บนหน้าหลัก');
    await page.screenshot({ path: 'scripts/search-page.png' });
    await browser.close();
    return;
  }

  await searchInput.click();
  await page.waitForTimeout(800);

  // ── Step 4: พิมพ์ keyword ──────────────────────────────────────────────────
  // ใช้ keyboard.type เพื่อ simulate การพิมพ์จริง (trigger autocomplete)
  await page.keyboard.type(KEYWORD, { delay: 80 });
  console.log(`✅ พิมพ์ "${KEYWORD}"`);
  await page.waitForTimeout(1500); // รอ autocomplete / suggestion

  // screenshot ตอน modal เปิด + keyword อยู่ใน input
  await page.screenshot({ path: 'scripts/search-before-enter.png' });
  console.log('📸 search-before-enter.png');

  // ── Step 5: Enter และรอ navigation ────────────────────────────────────────
  console.log('⏎ กด Enter...');
  const [navResult] = await Promise.allSettled([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
    page.keyboard.press('Enter'),
  ]);
  console.log(`📌 URL: ${page.url()}`);

  // ── Step 6: ถ้ายังไม่ใช่ search page ────────────────────────────────────
  if (!page.url().includes('/search')) {
    console.log('⚠️  ยังไม่ถึงหน้า search, รอ...');
    await page.waitForURL(/\/search/, { timeout: 10000 }).catch(() => {});
    console.log(`📌 URL: ${page.url()}`);
  }

  // ── Step 7: รอ results โหลด ──────────────────────────────────────────────
  await page.waitForTimeout(5000);

  // ── Step 8: ถ้า search page input ว่าง → fill ใหม่แล้ว Enter ───────────
  const pageSearchInput = page.locator('input[placeholder*="ค้นหา"], input[type="search"]').first();
  const inputVal = await pageSearchInput.inputValue().catch(() => '');
  console.log(`\n🔎 input value ใน search page: "${inputVal}"`);

  if (!inputVal) {
    console.log('⚠️  input ว่าง — fill keyword ใน search page แล้ว Enter ใหม่');
    await pageSearchInput.click();
    await page.keyboard.type(KEYWORD, { delay: 80 });
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(6000);
  }

  // ── Step 9: screenshot ผลลัพธ์ ───────────────────────────────────────────
  await page.screenshot({ path: 'scripts/search-page.png' });
  console.log(`📸 search-page.png | URL: ${page.url()}`);

  // ── Step 10: dump DOM ─────────────────────────────────────────────────────
  const domDump = await page.evaluate(() => {
    // __NEXT_DATA__
    let nextData = {};
    try {
      const el = document.getElementById('__NEXT_DATA__');
      if (el) nextData = JSON.parse(el.textContent || '{}');
    } catch {}

    // หา arrays ที่มี id/contentId
    const findArrays = (obj, path = '', depth = 0) => {
      if (depth > 10 || !obj || typeof obj !== 'object') return [];
      if (Array.isArray(obj) && obj.length > 0) {
        const first = obj[0];
        if (first?.id || first?.contentId || first?.content_id || first?.programId) {
          return [{ path, count: obj.length, sample: JSON.stringify(obj.slice(0, 2)).slice(0, 500) }];
        }
      }
      return Object.entries(obj).flatMap(([k, v]) => findArrays(v, `${path}.${k}`, depth + 1));
    };

    // ทุก <a> บนหน้า
    const allHrefs = Array.from(document.querySelectorAll('a[href]')).map(el => ({
      href: el.href,
      text: el.textContent?.trim().slice(0, 80),
      imgAlt: el.querySelector('img')?.alt || '',
    }));

    // iframes
    const iframes = Array.from(document.querySelectorAll('iframe')).map(f => f.src);

    // headings + text บนหน้า
    const visibleText = Array.from(document.querySelectorAll(
      'h1,h2,h3,[class*="title"],[class*="Title"],[class*="name"],[class*="Name"]'
    ))
      .map(el => el.textContent?.trim().slice(0, 100))
      .filter(t => t && t.length > 1)
      .slice(0, 50);

    return {
      url: location.href,
      pagePropsKeys: nextData?.props?.pageProps ? Object.keys(nextData.props.pageProps) : [],
      arraysWithId: findArrays(nextData?.props?.pageProps || {}),
      allHrefs,
      iframes,
      visibleText,
    };
  });

  // filter content hrefs
  const contentHrefs = domDump.allHrefs.filter(l =>
    /\/(watch|short|content|series|movie|program|episode|clip)\//.test(l.href)
  );

  // ── Step 11: แสดงผล ───────────────────────────────────────────────────────
  console.log(`\n📋 Content hrefs (${contentHrefs.length}):`);
  contentHrefs.slice(0, 20).forEach((l, i) =>
    console.log(`  [${i + 1}] ${l.href}\n       alt="${l.imgAlt}" | "${l.text?.slice(0, 50)}"`)
  );

  console.log(`\n📦 pageProps keys: ${domDump.pagePropsKeys.join(', ')}`);
  console.log(`\n🖼  iframes: ${domDump.iframes.join(', ') || 'none'}`);

  console.log(`\n📝 visible text (${domDump.visibleText.length}):`);
  domDump.visibleText.slice(0, 30).forEach((t, i) => console.log(`  [${i + 1}] ${t}`));

  console.log(`\n🔁 arrays with id in pageProps:`);
  domDump.arraysWithId.forEach(a => console.log(`  ${a.path} (${a.count})\n  ${a.sample}`));

  console.log(`\n📡 captured JSON APIs (${capturedJson.length}):`);
  capturedJson.forEach((c, i) =>
    console.log(`  [${i + 1}] ${c.url}\n       ${c.resp.slice(0, 250)}`)
  );

  // All requests (last 40 only)
  const last40 = allRequestUrls.slice(-40);
  console.log(`\n🌐 last 40 network requests:`);
  last40.forEach(r => console.log(`  ${r}`));

  // ── Step 12: บันทึกไฟล์ ──────────────────────────────────────────────────
  fs.writeFileSync('scripts/trueid-search-dump.json', JSON.stringify({
    finalUrl: domDump.url,
    capturedJson: capturedJson.map(c => ({ url: c.url, resp: c.resp, full: c.full })),
    contentHrefs,
    allHrefs: domDump.allHrefs,
    iframes: domDump.iframes,
    visibleText: domDump.visibleText,
    pagePropsKeys: domDump.pagePropsKeys,
    arraysWithId: domDump.arraysWithId,
    allRequestUrls,
  }, null, 2), 'utf-8');

  console.log('\n✅ บันทึก → scripts/trueid-search-dump.json');
  await browser.close();
})();
