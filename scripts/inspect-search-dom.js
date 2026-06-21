/**
 * Inspect DOM ของ search results หลังค้นหา "puzzle"
 * Run: node scripts/inspect-search-dom.js
 * Output: scripts/search-dom-dump.json
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false }); // เปิด browser ให้เห็น
  const page = await browser.newPage({
    locale: 'th-TH',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' },
  });

  console.log('🔍 เปิดหน้า game.trueid.net...');
  await page.goto('https://game.trueid.net/th-th', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // คลิก search icon
  const icon = await page.$('span[aria-label="search"], [class*="anticon-search"]');
  if (icon) { await icon.click(); console.log('✅ คลิก search icon แล้ว'); }
  else { console.warn('⚠️  ไม่เจอ search icon'); }
  await page.waitForTimeout(1500);

  // พิมพ์ puzzle + enter
  const input = await page.$('input[type="search"], input[type="text"], input[placeholder*="ค้นหา"]');
  if (input) {
    await input.fill('puzzle');
    await page.keyboard.press('Enter');
    console.log('✅ พิมพ์ "puzzle" + Enter แล้ว');
  } else {
    console.warn('⚠️  ไม่เจอ search input');
  }
  await page.waitForTimeout(4000);

  console.log('🔍 กำลัง dump DOM...');

  const dump = await page.evaluate(() => {
    const result = {
      url: window.location.href,
      title: document.title,

      // 1. หา link ทั้งหมดที่มี /game/ ใน href
      gameLinks: Array.from(document.querySelectorAll('a[href*="/game/"]'))
        .filter(el => el.querySelector('img'))
        .slice(0, 5)
        .map(el => {
          const img = el.querySelector('img');
          // เก็บ innerText ของทุก child element
          const childTexts = Array.from(el.querySelectorAll('*'))
            .map(c => ({ tag: c.tagName, cls: c.className?.toString().slice(0, 80), text: c.innerText?.trim().slice(0, 100) }))
            .filter(c => c.text);
          return {
            href: el.href,
            outerHTMLSnippet: el.outerHTML.slice(0, 1000),
            imgAlt: img?.alt,
            imgSrc: img?.src?.slice(0, 120),
            innerText: el.innerText?.trim().slice(0, 200),
            childTexts,
          };
        }),

      // 2. หา container ที่ใหญ่ที่สุดที่มี game links อยู่
      searchResultContainer: (() => {
        const links = document.querySelectorAll('a[href*="/game/"]');
        if (!links.length) return null;
        let parent = links[0].parentElement;
        for (let i = 0; i < 8; i++) {
          if (!parent) break;
          if (parent.querySelectorAll('a[href*="/game/"]').length >= 3) {
            return {
              tag: parent.tagName,
              cls: parent.className?.toString().slice(0, 100),
              childCount: parent.querySelectorAll('a[href*="/game/"]').length,
            };
          }
          parent = parent.parentElement;
        }
        return null;
      })(),
    };
    return result;
  });

  const outFile = 'scripts/search-dom-dump.json';
  fs.writeFileSync(outFile, JSON.stringify(dump, null, 2), 'utf-8');
  console.log(`\n✅ บันทึกไว้ที่: ${outFile}`);
  console.log(`   URL หลัง search: ${dump.url}`);
  console.log(`   พบ game links: ${dump.gameLinks.length} รายการ`);
  dump.gameLinks.forEach((l, i) => {
    console.log(`\n   [${i+1}] href: ${l.href}`);
    console.log(`        imgAlt: "${l.imgAlt}"`);
    console.log(`        innerText: "${l.innerText?.slice(0, 80)}"`);
  });

  await browser.close();
})();
