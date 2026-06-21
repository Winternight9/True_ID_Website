/**
 * Inspect actual DOM selectors for each TrueID page
 * Dumps: player class, card class, search button, shelf title, login form
 *
 * Run: node scripts/inspect-selectors.js
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');

const PAGES = [
  {
    key: 'sfv-player',
    url: 'https://www.trueid.net/watch/th-th/short/Game',
    checks: ['video player class', 'shelf below player'],
  },
  {
    key: 'game-shelf',
    url: 'https://game.trueid.net/th-th/shelf',
    checks: ['shelf title', 'card class'],
  },
  {
    key: 'watch-header',
    url: 'https://www.trueid.net/watch/th-th/shelf',
    checks: ['search button'],
  },
  {
    key: 'game-search-home',
    url: 'https://game.trueid.net/th-th/searchHome',
    checks: ['search input', 'shelf class'],
  },
  {
    key: 'ugc-upload',
    url: 'https://www.trueid-alpha.net/creators/th-th/upload',
    checks: ['page content', 'login/upload form'],
  },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' },
  });

  const report = {};

  for (const p of PAGES) {
    console.log(`\n🔍 [${p.key}] ${p.url}`);
    const page = await context.newPage();
    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);

      const info = await page.evaluate(() => {
        const result = {};

        // ── 1. Collect all unique class names that look like component names ──
        const allEls = Array.from(document.querySelectorAll('*'));
        const classBag = new Set();
        for (const el of allEls) {
          for (const cls of el.classList) {
            if (cls.length > 3 && cls.length < 60) classBag.add(cls);
          }
        }

        // ── 2. Player-related ─────────────────────────────────────────────
        const playerEls = allEls.filter(el =>
          [...el.classList].some(c => /player|video|stream|sfv/i.test(c)) ||
          el.tagName === 'VIDEO'
        );
        result.playerClasses = playerEls.slice(0, 8).map(el => ({
          tag: el.tagName,
          classes: [...el.classList].join(' '),
          id: el.id,
        }));

        // ── 3. Card/item-related ──────────────────────────────────────────
        const cardEls = allEls.filter(el =>
          [...el.classList].some(c => /card|thumb|tile|grid|item|game|content/i.test(c))
        );
        result.cardClasses = [...new Set(
          cardEls.flatMap(el => [...el.classList])
            .filter(c => /card|thumb|tile|grid|item|game|content/i.test(c))
        )].slice(0, 20);

        // ── 4. Search button/input ────────────────────────────────────────
        const searchEls = allEls.filter(el =>
          [...el.classList].some(c => /search/i.test(c)) ||
          el.getAttribute('aria-label')?.toLowerCase().includes('search') ||
          el.getAttribute('placeholder')?.includes('ค้นหา') ||
          (el.tagName === 'INPUT' && ['search', 'text'].includes(el.type))
        );
        result.searchEls = searchEls.slice(0, 6).map(el => ({
          tag: el.tagName,
          type: el.getAttribute('type'),
          classes: [...el.classList].join(' '),
          ariaLabel: el.getAttribute('aria-label'),
          placeholder: el.getAttribute('placeholder'),
          id: el.id,
        }));

        // ── 5. Shelf/section headings ─────────────────────────────────────
        const headingEls = allEls.filter(el =>
          /h[1-6]|[Ss]ection[Tt]itle|[Ss]helf[Tt]itle|[Hh]eading/.test(el.tagName + [...el.classList].join(' '))
        );
        result.headings = headingEls.slice(0, 10).map(el => ({
          tag: el.tagName,
          classes: [...el.classList].join(' '),
          text: el.textContent?.trim().slice(0, 80),
        }));

        // ── 6. Login/upload form ──────────────────────────────────────────
        const formEls = allEls.filter(el =>
          ['INPUT', 'FORM', 'BUTTON'].includes(el.tagName) ||
          [...el.classList].some(c => /login|upload|form|auth/i.test(c))
        );
        result.formEls = formEls.slice(0, 8).map(el => ({
          tag: el.tagName,
          type: el.getAttribute('type'),
          classes: [...el.classList].join(' '),
          text: el.textContent?.trim().slice(0, 40),
          href: el.href,
        }));

        // ── 7. Final URL (after redirect) ─────────────────────────────────
        result.finalUrl = window.location.href;
        result.title = document.title;
        result.bodyTextLength = document.body.innerText.length;

        return result;
      });

      report[p.key] = { url: p.url, ...info };

      console.log(`  📌 Final URL : ${info.finalUrl}`);
      console.log(`  📌 Page title: ${info.title}`);
      console.log(`  📌 Body text length: ${info.bodyTextLength}`);

      if (info.playerClasses?.length) {
        console.log(`  🎬 Player elements:`);
        info.playerClasses.forEach(e => console.log(`     <${e.tag}> id="${e.id}" class="${e.classes}"`));
      }
      if (info.cardClasses?.length) {
        console.log(`  🃏 Card-like classes: ${info.cardClasses.join(', ')}`);
      }
      if (info.searchEls?.length) {
        console.log(`  🔍 Search elements:`);
        info.searchEls.forEach(e => console.log(`     <${e.tag} type="${e.type}"> class="${e.classes}" aria="${e.ariaLabel}" placeholder="${e.placeholder}"`));
      }
      if (info.headings?.length) {
        console.log(`  📋 Headings:`);
        info.headings.forEach(e => console.log(`     <${e.tag} class="${e.classes}"> "${e.text}"`));
      }
      if (info.formEls?.length) {
        console.log(`  📝 Form elements:`);
        info.formEls.forEach(e => console.log(`     <${e.tag} type="${e.type}"> class="${e.classes}" text="${e.text}"`));
      }

    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      report[p.key] = { url: p.url, error: err.message };
    }
    await page.close();
  }

  await browser.close();

  fs.writeFileSync('scripts/selector-inspection.json', JSON.stringify(report, null, 2));
  console.log('\n✅ บันทึก JSON ที่: scripts/selector-inspection.json');
  console.log('   ส่ง output นี้กลับมาเพื่อ patch selectors ทั้งหมดเลยครับ\n');
})();
