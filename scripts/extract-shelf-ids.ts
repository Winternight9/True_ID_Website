/**
 * Extract clip IDs from "คลิปสั้นหนังแนะนำ" shelf
 * URL: https://www.trueid.net/watch/th-th
 */
import { chromium } from '@playwright/test';

const URL = 'https://www.trueid.net/watch/th-th';
const TARGET_SHELF = 'คลิปสั้นหนัง';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' },
  });
  const page = await context.newPage();

  console.log(`\n🔍 Navigating to ${URL}...`);
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // ── Strategy 1: Extract from anchor hrefs inside the shelf ──────────────
  const clips = await page.evaluate((shelfKeyword: string) => {
    const results: Array<{ title: string; id: string; href: string; type: string }> = [];

    // Find all shelf/section headings
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,[class*="title"],[class*="Title"],[class*="shelf-title"],[class*="ShelfTitle"]'));

    let targetSection: Element | null = null;
    for (const h of headings) {
      if (h.textContent?.includes(shelfKeyword)) {
        targetSection = h;
        break;
      }
    }

    const extractLinks = (container: Element) => {
      const links = Array.from(container.querySelectorAll('a[href]'));
      for (const link of links) {
        const href = (link as HTMLAnchorElement).href;
        const title = link.querySelector('img')?.getAttribute('alt') ||
                      link.querySelector('[class*="title"],[class*="Title"]')?.textContent?.trim() ||
                      link.textContent?.trim() || '';

        // Match /watch/th-th/short/<id> or /watch/th-th/<type>/<id>
        const m = href.match(/\/watch\/th-th\/([^/]+)\/([^/?#]+)/);
        if (m) {
          results.push({ title, id: m[2], href, type: m[1] });
        }
      }
    };

    if (targetSection) {
      // Walk up to shelf container, then extract links within
      let container: Element | null = targetSection;
      for (let i = 0; i < 5; i++) {
        container = container?.parentElement ?? null;
        if (!container) break;
        const links = container.querySelectorAll('a[href*="/watch/"]');
        if (links.length > 2) {
          extractLinks(container);
          break;
        }
      }
    }

    // ── Strategy 2: Fallback — grab ALL short/content links ──────────────
    if (results.length === 0) {
      const allLinks = Array.from(document.querySelectorAll('a[href*="/watch/"]'));
      for (const link of allLinks) {
        const href = (link as HTMLAnchorElement).href;
        const m = href.match(/\/watch\/th-th\/([^/]+)\/([^/?#]+)/);
        if (m) {
          const title = (link as HTMLAnchorElement).title ||
                        link.querySelector('img')?.getAttribute('alt') ||
                        link.textContent?.trim() || '';
          results.push({ title, id: m[2], href, type: m[1] });
        }
      }
    }

    // Deduplicate by ID
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  }, TARGET_SHELF);

  // ── Strategy 3: Intercept API/network calls for shelf data ──────────────
  console.log('\n📡 Also checking network requests for shelf API...');
  const apiResults: any[] = [];

  // Re-navigate with network listener
  const page2 = await context.newPage();
  page2.on('response', async (response) => {
    const url = response.url();
    if ((url.includes('shelf') || url.includes('content') || url.includes('recommend')) &&
        url.includes('trueid') && response.status() === 200) {
      try {
        const ct = response.headers()['content-type'] || '';
        if (ct.includes('json')) {
          const json = await response.json().catch(() => null);
          if (json) apiResults.push({ url, data: json });
        }
      } catch {}
    }
  });
  await page2.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page2.waitForTimeout(3000);

  // Extract IDs from API responses
  const apiIds: Array<{ id: string; title: string; source: string }> = [];
  for (const result of apiResults) {
    const text = JSON.stringify(result.data);
    const matches = [...text.matchAll(/"(?:contentId|content_id|id|clipId|clip_id)"\s*:\s*"?(\w{5,})"?/g)];
    for (const m of matches) {
      apiIds.push({ id: m[1], title: '', source: result.url });
    }
  }

  await browser.close();

  // ── Output ──────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log(`📋 Shelf: "${TARGET_SHELF}" — IDs from DOM (${clips.length} clips)`);
  console.log('══════════════════════════════════════════════════');
  if (clips.length > 0) {
    clips.forEach((c, i) => {
      console.log(`${i + 1}. ID: ${c.id}  | Type: ${c.type}`);
      console.log(`   Title: ${c.title || '(no title)'}`);
      console.log(`   URL: ${c.href}`);
    });
  } else {
    console.log('(ไม่พบ links ใน shelf — อาจ render ด้วย JS หลัง scroll)');
  }

  if (apiIds.length > 0) {
    const uniqueApiIds = [...new Map(apiIds.map(a => [a.id, a])).values()];
    console.log(`\n📡 IDs from API responses (${uniqueApiIds.length} unique):`);
    uniqueApiIds.slice(0, 30).forEach((a, i) => {
      console.log(`${i + 1}. ${a.id}  ← ${a.source.split('?')[0]}`);
    });
  }

  // Save JSON output
  const output = { domClips: clips, apiIds };
  const fs = await import('fs');
  fs.writeFileSync('scripts/shelf-ids-output.json', JSON.stringify(output, null, 2));
  console.log('\n✅ Full output saved to scripts/shelf-ids-output.json');
})();
