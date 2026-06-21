const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    locale: 'th-TH',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' }
  });

  await page.goto('https://game.trueid.net/th-th', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // click search icon
  const icon = await page.$('span[aria-label="search"], [class*="anticon-search"]');
  if (icon) { await icon.click(); console.log('clicked search icon'); }
  await page.waitForTimeout(1500);

  // type puzzle + enter
  const input = await page.$('input[type="search"], input[type="text"], input[placeholder*="ค้นหา"]');
  if (input) {
    await input.fill('puzzle');
    await page.keyboard.press('Enter');
    console.log('typed puzzle + enter');
  }
  await page.waitForTimeout(3000);

  // dump first 3 game links' structure
  const info = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/game/"]'))
      .filter(el => el.querySelector('img'));

    return links.slice(0, 3).map(el => {
      const img = el.querySelector('img');
      return {
        href: el.href,
        imgAlt: img ? img.alt : null,
        imgSrc: img ? (img.src || '').slice(0, 100) : null,
        innerText: el.innerText ? el.innerText.trim().slice(0, 200) : null,
        innerHTML: el.innerHTML.slice(0, 800),
      };
    });
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
