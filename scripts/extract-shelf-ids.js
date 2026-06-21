/**
 * Extract clip IDs from "คลิปสั้นหนังแนะนำ" shelf
 * URL: https://www.trueid.net/watch/th-th
 *
 * Run: node scripts/extract-shelf-ids.js
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PAGE_URL = 'https://www.trueid.net/watch/th-th';
const TARGET_SHELF_KEYWORD = 'คลิปสั้นหนัง';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' },
  });

  // ── Intercept API responses ──────────────────────────────────────────────
  const apiSnapshots = [];
  const page = await context.newPage();

  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (
      ct.includes('json') &&
      url.includes('trueid') &&
      response.status() === 200 &&
      (url.includes('shelf') || url.includes('content') || url.includes('recommend') ||
       url.includes('short') || url.includes('watch'))
    ) {
      try {
        const json = await response.json();
        apiSnapshots.push({ url, json });
      } catch (_) {}
    }
  });

  console.log(`\n🔍 Loading: ${PAGE_URL}`);
  await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(4000); // wait for lazy shelves

  // ── DOM extraction ───────────────────────────────────────────────────────
  const domClips = await page.evaluate((keyword) => {
    const results = [];

    // 1) Find the shelf heading that contains the keyword
    const allElements = Array.from(document.querySelectorAll('*'));
    let shelfContainer = null;

    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      if (
        text.startsWith(keyword) &&
        text.length < 60 &&   // heading, not a full paragraph
        el.tagName !== 'BODY' &&
        el.tagName !== 'HTML'
      ) {
        // Walk up to find a container with multiple links
        let cur = el;
        for (let i = 0; i < 8; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          const links = cur.querySelectorAll('a[href*="/watch/"]');
          if (links.length >= 3) {
            shelfContainer = cur;
            break;
          }
        }
        if (shelfContainer) break;
      }
    }

    // 2) Extract links from found container
    const extractFrom = (container) => {
      const links = Array.from(container.querySelectorAll('a[href*="/watch/"]'));
      for (const link of links) {
        const href = link.href;
        const m = href.match(/\/watch\/th-th\/([^/?#]+)\/([^/?#]+)/);
        if (!m) continue;

        const imgAlt = link.querySelector('img')?.alt?.trim() || '';
        const titleEl = link.querySelector('[class*="title" i], [class*="name" i], p, span');
        const title = imgAlt || titleEl?.textContent?.trim() || link.title || '';

        results.push({
          id: m[2],
          type: m[1],
          title,
          href,
        });
      }
    };

    if (shelfContainer) {
      extractFrom(shelfContainer);
    } else {
      // Fallback: grab all /watch/ links on the page
      extractFrom(document.body);
    }

    // Deduplicate by ID
    const seen = new Set();
    return results.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, TARGET_SHELF_KEYWORD);

  await browser.close();

  // ── Parse API snapshots for IDs ──────────────────────────────────────────
  const apiIds = [];
  const idRegex = /"(?:contentId|content_id|clipId|clip_id|id)"\s*:\s*"?([a-zA-Z0-9_-]{4,})"?/g;

  for (const snap of apiSnapshots) {
    const text = JSON.stringify(snap.json);
    let m;
    while ((m = idRegex.exec(text)) !== null) {
      apiIds.push({ id: m[1], apiUrl: snap.url.split('?')[0] });
    }
  }
  const uniqueApiIds = [...new Map(apiIds.map(a => [a.id, a])).values()];

  // ── Print results ────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`📋  SHELF: "${TARGET_SHELF_KEYWORD}" — from DOM  (${domClips.length} clips)`);
  console.log('══════════════════════════════════════════════════════════════');

  if (domClips.length > 0) {
    domClips.forEach((c, i) => {
      console.log(`\n  ${i + 1}. ID   : ${c.id}`);
      console.log(`     Type : ${c.type}`);
      if (c.title) console.log(`     Title: ${c.title}`);
      console.log(`     URL  : ${c.href}`);
    });
  } else {
    console.log('  (ไม่พบ clip links จาก DOM — shelf อาจ lazy-load หลัง scroll)');
  }

  if (uniqueApiIds.length > 0) {
    console.log(`\n\n📡  IDs จาก API responses (${uniqueApiIds.length} unique IDs)`);
    console.log('──────────────────────────────────────────────────────────────');
    uniqueApiIds.slice(0, 50).forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.id.padEnd(30)} ← ${a.apiUrl}`);
    });
  }

  // ── Save JSON ────────────────────────────────────────────────────────────
  const outPath = path.resolve(__dirname, 'shelf-ids-output.json');
  fs.writeFileSync(outPath, JSON.stringify({ domClips, apiIds: uniqueApiIds }, null, 2));
  console.log(`\n✅  บันทึกผลแบบ JSON ที่: ${outPath}`);
  console.log('    เปิดดูได้ด้วย: scripts/shelf-ids-output.json\n');
})();
