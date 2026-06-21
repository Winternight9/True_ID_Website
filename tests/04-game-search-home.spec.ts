/**
 * Test: Game Search — ค้นหาเกมด้วยคำว่า "puzzle"
 * URL: https://game.trueid.net/th-th
 * Checks: เปิด search พิมพ์ "puzzle" แล้วดักจับ API response เก็บข้อมูลเกมที่ออกมา
 *
 * DOM facts (จาก Network inspect):
 *   - API search return JSON: { data: { data: [ { id, content_type, thumb, title, ... } ] } }
 *   - URL ของ API มี "search" อยู่ใน path
 */
import { test, expect } from '@playwright/test';
import { gotoAndWait, saveScreenshot } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

const URL = 'https://game.trueid.net/th-th';
const SEARCH_KEYWORD = 'puzzle';

test.describe('Game Search', () => {

  test(`ค้นหา "${SEARCH_KEYWORD}" แล้วเก็บผลลัพธ์เกมที่ออกมา`, async ({ page }) => {
    await gotoAndWait(page, URL, 4000);

    // ดักจับ API response ของ search — กรองเฉพาะ request ที่มี keyword ใน URL หรือ request body
    let searchApiData: any[] = [];
    page.on('response', async (response) => {
      const url = response.url();
      if (!url.includes('search') || response.status() !== 200) return;
      try {
        // เช็ค URL query string ก่อน
        const urlHasKeyword = url.toLowerCase().includes(SEARCH_KEYWORD.toLowerCase());
        // เช็ค request body (กรณี POST)
        const reqBody = response.request().postData() || '';
        const bodyHasKeyword = reqBody.toLowerCase().includes(SEARCH_KEYWORD.toLowerCase());

        if (!urlHasKeyword && !bodyHasKeyword) return;

        const json = await response.json();
        const items =
          json?.data?.data ||
          json?.data ||
          json?.results ||
          [];
        if (Array.isArray(items) && items.length > 0) {
          searchApiData = items;
          console.log(`  📡 ดักจับ API (${items.length} items): ${url.slice(0, 120)}`);
        }
      } catch {
        // ไม่ใช่ JSON ข้ามไป
      }
    });

    // คลิก search icon
    const searchIcon = page.locator('span[aria-label="search"], [class*="anticon-search"]').first();
    await searchIcon.waitFor({ state: 'visible', timeout: 8000 });
    await searchIcon.click();
    await page.waitForTimeout(1500);

    // พิมพ์คำค้นหา
    const searchInput = page.locator(
      'input[type="search"], input[type="text"], input[placeholder*="ค้นหา"], input[placeholder*="search"]'
    ).first();
    await searchInput.waitFor({ state: 'visible', timeout: 8000 });
    await searchInput.fill(SEARCH_KEYWORD);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');

    // รอ navigate + API response กลับมา (SPA ใช้ commit แทน load)
    await page.waitForURL(`**/search/${SEARCH_KEYWORD}`, { waitUntil: 'commit', timeout: 10000 });
    await page.waitForTimeout(3000);

    await saveScreenshot(page, `04-game-search-${SEARCH_KEYWORD}`);

    // debug — แสดง raw data ของ item แรก
    if (searchApiData.length > 0) {
      const first = searchApiData[0];
      console.log(`\n  🔎 debug item[0]: title="${first.title}" | genres=${JSON.stringify(first.genres)} | detail="${(first.detail || '').slice(0, 50)}" | synopsis="${(first.synopsis || '').slice(0, 50)}"`);
    }

    // map ข้อมูลจาก API
    const results = searchApiData.slice(0, 30).map((item: any) => ({
      id: item.id || '',
      title: item.title || '',
      content_type: item.content_type || '',
      detail: item.detail || '',
      synopsis: item.synopsis || '',
      genres: item.genres || [],
      article_category: item.article_category || [],
      devices: (item.info?.devices || []).map((d: any) => d.value),
      controllers: (item.info?.controllers || []).map((c: any) => c.value),
      developer: item.setting?.developers || '',
      published_at: item.setting?.publishedAt || item.publish_date || '',
      navigate: item.navigate || (item.id ? `https://game.trueid.net/th-th/game/${item.id}` : ''),
      thumb: item.thumb || '',
      matchesKeyword: [
        item.title || '',
        item.detail || '',
        item.synopsis || '',
        ...(item.genres || []),
      ].some((text: string) => text.toLowerCase().includes(SEARCH_KEYWORD.toLowerCase())),
    }));

    // แสดงผลใน console
    const matchCount = results.filter((r: any) => r.matchesKeyword).length;
    console.log(`\n  🔍 ผลลัพธ์การค้นหา "${SEARCH_KEYWORD}" — พบ ${results.length} items:`);
    results.forEach((r: any, i: number) => {
      const mark = r.matchesKeyword ? '✅' : '  ';
      console.log(`  ${mark} [${i + 1}] "${r.title}" (${r.content_type})`);
    });
    console.log(`\n  📊 ตรงกับ "${SEARCH_KEYWORD}": ${matchCount}/${results.length} items`);

    // บันทึก JSON
    const outDir = path.resolve('test-results');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `game-search-${SEARCH_KEYWORD}.json`);
    fs.writeFileSync(
      outFile,
      JSON.stringify({ keyword: SEARCH_KEYWORD, total: results.length, matchCount, results }, null, 2),
      'utf-8'
    );
    console.log(`  📄 บันทึกข้อมูล → ${outFile}`);

    // ── Assertions ────────────────────────────────────────────────────────
    expect(results.length, `ค้นหา "${SEARCH_KEYWORD}" ต้องพบผลลัพธ์อย่างน้อย 1 item`).toBeGreaterThan(0);

    // no duplicate IDs
    const ids = results.map((r: any) => r.id).filter(Boolean);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size, `ห้ามมี duplicate IDs — expected ${ids.length}, got ${uniqueIds.size}`).toBe(ids.length);

    console.log(`  ✅ ค้นหา "${SEARCH_KEYWORD}" พบ ${results.length} ผลลัพธ์ (ไม่ซ้ำ)`);
  });

});
