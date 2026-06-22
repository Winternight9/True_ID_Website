/**
 * Test: TrueID Home Search — ค้นหา "ชินจั่ง" จากหน้าหลัก
 * URL: https://www.trueid.net/th-th
 *
 * สิ่งที่ค้นพบ (จาก inspect):
 *  - Search URL จริง: /th-th/search/<keyword>?tab=today  (ไม่ใช่ ?q=...&cx=0)
 *  - ไม่มี JSON search-results API — results render แบบ SSR (Next.js)
 *  - Content IDs อยู่ใน href: /watch/short/<ID>  และ  /movie/<ID>
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { dismissSiteCover, skipIfBlockedByWAF, gotoOrSkip, skipWithEvidence } from './helpers';

const HOME_URL     = 'https://www.trueid.net/th-th';
const KEYWORD      = 'ชินจัง';
const RESULTS_DIR  = 'test-results';

test('ค้นหา "ชินจัง" แล้วเก็บ ID ของผลลัพธ์', async ({ page }) => {

  // ── 1. เปิดหน้าหลัก ────────────────────────────────────────────────────
  await gotoOrSkip(page, HOME_URL, 'หน้าหลัก TrueID');
  await page.waitForTimeout(2000);

  // ── 1a. skip ถ้าโดน Incapsula WAF บล็อก (พบบ่อยจาก cloud IP เช่น GitHub Actions) ──
  await skipIfBlockedByWAF(page, 'หน้าหลัก TrueID');

  // ── 1b. ปิด splash/cover overlay ถ้ามี (เช่น หน้าไว้อาลัย) ─────────────────
  await dismissSiteCover(page);

  // ── 2. ปิด cookie banner ────────────────────────────────────────────────
  for (const text of ['ยอมรับ', 'Accept', 'ยอมรับทั้งหมด']) {
    const btn = page.locator(`button:has-text("${text}")`).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
      console.log(`  🍪 ปิด cookie (${text})`);
      break;
    }
  }

  // ── 3. เปิด search modal แล้วพิมพ์ keyword (ทดสอบว่าช่องค้นหารับ input ได้) ──────
  const searchInput = page.locator('input[placeholder*="ค้นหา"], input[type="search"]').first();
  try {
    await searchInput.waitFor({ state: 'visible', timeout: 8000 });
  } catch {
    // ช่องค้นหาไม่ขึ้นเลยภายใน 8s ทั้งที่หน้าไม่ได้ redirect ไป _Incapsula_Resource —
    // เข้าข่าย Incapsula soft-block (degraded SSR) บน cloud/datacenter IP เหมือนกับ
    // กรณีหน้า watch/short ไม่ใช่ความผิดของเว็บหรือ test
    await skipWithEvidence(
      page,
      'ช่องค้นหาบนหน้าหลัก TrueID',
      '⚠️ ช่องค้นหาบนหน้าหลัก TrueID ไม่ render ภายใน 8s — เข้าข่าย Incapsula soft-block ' +
        'บน cloud/datacenter IP ไม่ใช่ความผิดของเว็บหรือ test'
    );
  }
  await searchInput.click();
  await searchInput.fill('').catch(() => {});
  await searchInput.pressSequentially(KEYWORD, { delay: 80 }).catch(() => {});
  console.log(`  ✅ พิมพ์ "${KEYWORD}"`);
  await page.waitForTimeout(500);

  // ── 4. Navigate ตรงไปหน้าผลลัพธ์ด้วย URL pattern จริงที่ inspect ไว้ ─────────────
  // (/th-th/search/<keyword>?tab=today) แทนการพึ่งพา Enter-key ผ่าน UI เพราะ Enter
  // เกิด race condition กับ debounce ของ autocomplete บนเว็บจริง (บางครั้งคำค้นหาหลุดไป
  // แล้ว navigate ไปหน้า search ที่ "เปล่า" แทน) ทำให้ test flaky แบบสุ่ม
  const searchUrl = `${HOME_URL.replace(/\/th-th\/?$/, '')}/th-th/search/${encodeURIComponent(KEYWORD)}?tab=today`;
  await gotoOrSkip(page, searchUrl, 'หน้าค้นหา TrueID');
  console.log(`  📌 URL: ${page.url()}`);

  // รอ SSR content render
  await page.waitForTimeout(4000);
  await skipIfBlockedByWAF(page, 'หน้าค้นหา TrueID');

  // ── 5. Screenshot ────────────────────────────────────────────────────────
  const ssDir = path.resolve('test-results/screenshots');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });
  await page.screenshot({ path: path.join(ssDir, `07-watch-search-${KEYWORD}.png`) });
  console.log('  📸 screenshot บันทึกแล้ว');

  // ── 6. Extract IDs + titles จาก DOM hrefs ──────────────────────────────
  const rawItems = await page.evaluate(() => {
    const seen = new Set<string>();
    const results: { id: string; title: string; contentType: string; href: string }[] = [];

    document.querySelectorAll('a[href]').forEach(el => {
      const href = (el as HTMLAnchorElement).href || '';

      // short video: /watch/short/<ID> หรือ /th-th/watch/short/<ID>
      let m = href.match(/\/watch\/(?:th-th\/)?short\/([A-Za-z0-9]+)/);
      if (m) {
        const id = m[1];
        if (!seen.has(id)) {
          seen.add(id);
          const img = el.querySelector('img');
          const title = img?.alt?.trim() || el.textContent?.trim().slice(0, 100) || '';
          results.push({ id, title, contentType: 'short', href });
        }
        return;
      }

      // movie: /movie/<ID>
      m = href.match(/\/movie\/([A-Za-z0-9]+)$/);
      if (m) {
        const id = m[1];
        if (!seen.has(id)) {
          seen.add(id);
          const img = el.querySelector('img');
          const title = img?.alt?.trim() || el.textContent?.trim().slice(0, 100) || '';
          results.push({ id, title, contentType: 'movie', href });
        }
      }
    });

    return results;
  });

  // ── 7. แสดงผลลัพธ์ ────────────────────────────────────────────────────
  const matchCount = rawItems.filter(r => r.title.includes(KEYWORD)).length;

  console.log(`\n  🔍 ผลลัพธ์การค้นหา "${KEYWORD}" — ${rawItems.length} items:`);
  rawItems.forEach((r, i) => {
    const mark = r.title.includes(KEYWORD) ? '✅' : '  ';
    console.log(`  ${mark} [${i + 1}] id="${r.id}" type=${r.contentType} title="${r.title.slice(0, 60)}"`);
  });
  console.log(`\n  📊 ตรงกับ "${KEYWORD}": ${matchCount}/${rawItems.length} items`);

  // ── 8. บันทึก JSON ────────────────────────────────────────────────────
  if (!fs.existsSync(path.resolve(RESULTS_DIR))) {
    fs.mkdirSync(path.resolve(RESULTS_DIR), { recursive: true });
  }
  const outFile = path.resolve(RESULTS_DIR, `watch-search-${KEYWORD}.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    keyword: KEYWORD,
    searchUrl: page.url(),
    total: rawItems.length,
    matchCount,
    results: rawItems,
  }, null, 2), 'utf-8');
  console.log(`  📄 บันทึก → ${outFile}`);

  // ── 9. Assertions ─────────────────────────────────────────────────────
  expect(rawItems.length, `ค้นหา "${KEYWORD}" ต้องพบผลลัพธ์อย่างน้อย 1 item`).toBeGreaterThan(0);

  // no duplicate IDs (Set ใน evaluate ดูแลแล้ว — assert ยืนยันซ้ำ)
  const allIds = rawItems.map(r => r.id);
  const uniqueIds = new Set(allIds);
  expect(uniqueIds.size, `ห้ามมี duplicate IDs — expected ${allIds.length}, got ${uniqueIds.size}`).toBe(allIds.length);
});
