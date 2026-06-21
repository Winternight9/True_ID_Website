/**
 * Extract game IDs from "แนะนำสำหรับคุณ" shelf
 * URL: https://game.trueid.net/th-th
 *
 * Run: node scripts/extract-game-shelf-ids.js
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const PAGE_URL = 'https://game.trueid.net/th-th';
const TARGET_SHELF_KEYWORD = 'แนะนำสำหรับคุณ';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' },
  });

  // ── Intercept API/JSON responses ─────────────────────────────────────────
  const apiSnapshots = [];
  const page = await context.newPage();

  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    if (
      ct.includes('json') &&
      (url.includes('trueid') || url.includes('game')) &&
      response.status() === 200
    ) {
      try {
        const json = await response.json();
        apiSnapshots.push({ url, json });
      } catch (_) {}
    }
  });

  console.log(`\n🔍 Loading: ${PAGE_URL}`);
  await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 40000 });
  await page.waitForTimeout(4000);

  // ── DOM extraction ───────────────────────────────────────────────────────
  const domGames = await page.evaluate((keyword) => {
    const results = [];

    // Find the shelf heading
    let shelfContainer = null;
    const allElements = Array.from(document.querySelectorAll('*'));

    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      if (
        text.startsWith(keyword) &&
        text.length < 60 &&
        el.tagName !== 'BODY' &&
        el.tagName !== 'HTML'
      ) {
        let cur = el;
        for (let i = 0; i < 8; i++) {
          cur = cur.parentElement;
          if (!cur) break;
          const links = cur.querySelectorAll('a[href]');
          if (links.length >= 3) {
            shelfContainer = cur;
            break;
          }
        }
        if (shelfContainer) break;
      }
    }

    const extractFrom = (container) => {
      const links = Array.from(container.querySelectorAll('a[href]'));
      for (const link of links) {
        const href = link.href;
        if (!href || href === '#') continue;

        // game.trueid.net paths: /th-th/game/<id> or /th-th/<type>/<id>
        const m =
          href.match(/\/th-th\/game\/([^/?#]+)/) ||
          href.match(/\/th-th\/([^/?#]+)\/([^/?#]+)/) ||
          href.match(/game\/([^/?#]+)$/);

        if (!m) continue;

        const id = m[2] || m[1];
        const imgAlt = link.querySelector('img')?.alt?.trim() || '';
        const titleEl = link.querySelector('[class*="title" i],[class*="name" i],[class*="label" i],p,span');
        const title = imgAlt || titleEl?.textContent?.trim() || link.title || '';
        const imgSrc = link.querySelector('img')?.src || '';

        results.push({ id, title, href, imgSrc });
      }
    };

    if (shelfContainer) {
      extractFrom(shelfContainer);
    } else {
      // Fallback — grab all game-like links
      const allLinks = Array.from(document.querySelectorAll('a[href*="/th-th/"]'));
      for (const link of allLinks) {
        const href = link.href;
        const m = href.match(/\/th-th\/(?:game\/)?([^/?#]{4,})/);
        if (!m) continue;
        const id = m[1];
        if (['shelf', 'search', 'searchHome', 'home', 'th-th'].includes(id)) continue;
        const imgAlt = link.querySelector('img')?.alt?.trim() || '';
        const title = imgAlt || link.title || link.textContent?.trim() || '';
        results.push({ id, title, href, imgSrc: link.querySelector('img')?.src || '' });
      }
    }

    // Deduplicate by ID
    const seen = new Set();
    return results.filter(r => {
      if (!r.id || seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, TARGET_SHELF_KEYWORD);

  await browser.close();

  // ── Parse API snapshots ──────────────────────────────────────────────────
  const apiGames = [];
  for (const snap of apiSnapshots) {
    const text = JSON.stringify(snap.json);
    // Look for game ID patterns + title
    const idMatches = [...text.matchAll(/"(?:gameId|game_id|contentId|content_id|id|appId)"\s*:\s*"?([a-zA-Z0-9_-]{3,})"?/g)];
    const titleMatches = [...text.matchAll(/"(?:title|name|gameName|game_name)"\s*:\s*"([^"]{2,60})"/g)];

    idMatches.forEach((m, i) => {
      apiGames.push({
        id: m[1],
        title: titleMatches[i]?.['1'] || '',
        apiUrl: snap.url.split('?')[0],
      });
    });
  }
  const uniqueApiGames = [...new Map(apiGames.map(a => [a.id, a])).values()];

  // ── Print results ────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`🎮  SHELF: "${TARGET_SHELF_KEYWORD}" — จาก DOM  (${domGames.length} เกม)`);
  console.log('══════════════════════════════════════════════════════════════');

  if (domGames.length > 0) {
    domGames.forEach((g, i) => {
      console.log(`\n  ${i + 1}. ID   : ${g.id}`);
      if (g.title) console.log(`     Title: ${g.title}`);
      console.log(`     URL  : ${g.href}`);
    });
  } else {
    console.log('  (ไม่พบ game links จาก DOM — อาจ lazy-load)');
  }

  if (uniqueApiGames.length > 0) {
    console.log(`\n\n📡  IDs จาก API responses (${uniqueApiGames.length} unique)`);
    console.log('──────────────────────────────────────────────────────────────');
    uniqueApiGames.slice(0, 50).forEach((g, i) => {
      const label = g.title ? `${g.id}  — "${g.title}"` : g.id;
      console.log(`  ${i + 1}. ${label}`);
      console.log(`       API: ${g.apiUrl}`);
    });
  }

  // ── Save JSON ────────────────────────────────────────────────────────────
  const outPath = path.resolve(__dirname, 'game-shelf-ids-output.json');
  fs.writeFileSync(outPath, JSON.stringify({ shelf: TARGET_SHELF_KEYWORD, domGames, apiGames: uniqueApiGames }, null, 2));
  console.log(`\n✅  บันทึก JSON ที่: ${outPath}\n`);
})();
