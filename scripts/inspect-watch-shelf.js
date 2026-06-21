/**
 * Deep-inspect the watch shelf page to find the exact shelf container classes
 * Run: node scripts/inspect-watch-shelf.js
 */
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' },
  });

  // Use homepage — /watch/th-th/shelf renders no shelf content
  await page.goto('https://www.trueid.net/watch/th-th', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Scroll gradually to trigger lazy-loaded shelves
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    // 1. Dump ALL unique classes in the page
    const allClasses = new Set();
    document.querySelectorAll('*').forEach(el => {
      el.classList.forEach(c => allClasses.add(c));
    });

    // 2. Find elements that contain multiple <img> or <a> children (likely shelf rows)
    const shelfCandidates = [];
    document.querySelectorAll('*').forEach(el => {
      const imgs = el.querySelectorAll('img');
      const links = el.querySelectorAll('a');
      if (imgs.length >= 3 && links.length >= 3 && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
        // Only capture direct-ish containers (not the whole page)
        const parent = el.parentElement;
        const parentImgs = parent ? parent.querySelectorAll('img').length : 999;
        if (parentImgs > imgs.length * 1.5) { // parent has significantly more = el is a good boundary
          shelfCandidates.push({
            tag: el.tagName,
            id: el.id,
            classes: [...el.classList].join(' '),
            imgCount: imgs.length,
            linkCount: links.length,
            firstText: el.textContent?.trim().slice(0, 60),
          });
        }
      }
    });

    // 3. Find headings / section titles
    const headings = [];
    document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el => {
      headings.push({ tag: el.tagName, classes: [...el.classList].join(' '), text: el.textContent?.trim().slice(0, 80) });
    });

    // 4. Elements with text "คลิปสั้น" or "หนัง" or "แนะนำ"
    const textMatches = [];
    document.querySelectorAll('*').forEach(el => {
      const t = el.childNodes.length === 1 && el.firstChild?.nodeType === 3
        ? el.textContent?.trim()
        : '';
      if (t && (t.includes('คลิปสั้น') || t.includes('หนัง') || t.includes('แนะนำ'))) {
        textMatches.push({ tag: el.tagName, classes: [...el.classList].join(' '), text: t.slice(0, 80) });
      }
    });

    return {
      totalClasses: allClasses.size,
      shelfCandidates: shelfCandidates.slice(0, 10),
      headings,
      textMatches: textMatches.slice(0, 10),
      // Raw top-level children of body with their classes
      bodyChildren: [...document.body.children].map(el => ({
        tag: el.tagName, id: el.id, classes: [...el.classList].join(' ')
      })),
    };
  });

  console.log('\n📋 Shelf candidates (elements with 3+ imgs and 3+ links):');
  info.shelfCandidates.forEach((s, i) =>
    console.log(`  ${i+1}. <${s.tag} id="${s.id}" class="${s.classes}"> imgs:${s.imgCount} links:${s.linkCount}\n     "${s.firstText}"`)
  );

  console.log('\n📝 Headings:');
  info.headings.forEach(h => console.log(`  <${h.tag} class="${h.classes}"> "${h.text}"`));

  console.log('\n🔤 Elements with shelf-related text:');
  info.textMatches.forEach(t => console.log(`  <${t.tag} class="${t.classes}"> "${t.text}"`));

  console.log('\n🏗️  Body direct children:');
  info.bodyChildren.forEach(c => console.log(`  <${c.tag} id="${c.id}" class="${c.classes}">`));

  await browser.close();
})();
