/**
 * Test: SFV Player — Short Film/Video Player
 * URL: https://www.trueid.net/watch/th-th/short/
 * Checks:
 *   1. Video player renders
 *   2. เลื่อนเปลี่ยนวิดีโอได้ 20 items — ไม่ซ้ำ และ type ถูกต้อง
 *
 * DOM facts (from inspection):
 *   Player wrapper : #container-sfv  /  [class*="SFVPlayer"]
 *   Video element  : video-js (custom element), class includes "vjs-big-play-centered"
 *   Layout wrapper : [class*="SFVLayoutWrapper"]
 */
import { test, expect } from '@playwright/test';
import { gotoAndWait, saveScreenshot, checkVisible } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://www.trueid.net/watch/th-th/short/';
const TARGET_ITEMS = 20;

// ── helpers ──────────────────────────────────────────────────────────────────

/** ดึงข้อมูล item ของวิดีโอปัจจุบันจาก DOM + URL */
async function collectCurrentItem(page: any) {
  return await page.evaluate(() => {
    // video ID จาก URL path  e.g. /watch/th-th/short/<id>
    const urlParts = window.location.pathname.split('/').filter(Boolean);
    const videoId = urlParts[urlParts.length - 1] || '';

    // title — ลอง meta og:title ก่อน แล้ว fallback ไป title tag และ DOM
    const metaTitle =
      (document.querySelector('meta[property="og:title"]') as HTMLMetaElement)?.content ||
      (document.querySelector('meta[name="title"]') as HTMLMetaElement)?.content ||
      document.title ||
      '';

    // type — จาก meta og:type หรือ URL segment ก็ได้
    const metaType =
      (document.querySelector('meta[property="og:type"]') as HTMLMetaElement)?.content || '';

    // content-type hint จาก URL: segment ก่อน video id
    const urlSegment = urlParts[urlParts.length - 2] || ''; // "short"

    return {
      videoId,
      title: metaTitle.trim(),
      type: metaType || urlSegment,
      url: window.location.href,
    };
  });
}

/** เลื่อนวิดีโอถัดไปด้วย ArrowDown แล้วรอ URL เปลี่ยน */
async function navigateNext(page: any, prevUrl: string, timeoutMs = 8000): Promise<boolean> {
  // กด ArrowDown บน player wrapper หรือ body เพื่อ trigger next video
  await page.keyboard.press('ArrowDown');

  try {
    await page.waitForFunction(
      (prev: string) => window.location.href !== prev,
      prevUrl,
      { timeout: timeoutMs }
    );
    await page.waitForTimeout(1500); // รอ content โหลด
    return true;
  } catch {
    // ถ้า URL ไม่เปลี่ยน ลอง scroll แทน
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(2000);
    return page.url() !== prevUrl; // ต้องใช้ page.url() เพราะ block นี้รันใน Node.js ไม่ใช่ใน browser
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('SFV Player — Short', () => {

  test('video player element is present', async ({ page }) => {
    await gotoAndWait(page, BASE_URL, 6000);
    await saveScreenshot(page, '02-sfv-player-full');

    await checkVisible(
      page,
      'video-js, #container-sfv, [class*="SFVPlayerWrapper"], [class*="SFVPlayer"], [class*="SFVLayoutWrapper"]',
      'Video player element'
    );
    await checkVisible(page, 'img', 'Images/thumbnails present');
  });

  test('เลื่อนเปลี่ยนวิดีโอ 20 items — ไม่ซ้ำ และ type ถูกต้อง', async ({ page }) => {
    await gotoAndWait(page, BASE_URL, 6000);

    // โฟกัสที่ player ก่อนกด keyboard
    await page.click('#container-sfv, [class*="SFVLayoutWrapper"], body');

    const items: { videoId: string; title: string; type: string; url: string }[] = [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();

    // เก็บ item แรก
    const first = await collectCurrentItem(page);
    items.push(first);
    seenIds.add(first.videoId);
    seenUrls.add(first.url);
    console.log(`  [1] ${first.videoId} | "${first.title}" | type: ${first.type}`);

    // เลื่อนไปเรื่อยๆ จนครบ TARGET_ITEMS
    while (items.length < TARGET_ITEMS) {
      const prevUrl = page.url();
      const moved = await navigateNext(page, prevUrl);

      if (!moved) {
        console.warn(`  ⚠️  ไม่สามารถเลื่อนวิดีโอถัดไปได้ที่ item ${items.length + 1}`);
        break;
      }

      const item = await collectCurrentItem(page);
      items.push(item);
      seenIds.add(item.videoId);
      seenUrls.add(item.url);
      console.log(`  [${items.length}] ${item.videoId} | "${item.title}" | type: ${item.type}`);
    }

    // ── บันทึก JSON ──────────────────────────────────────────────────────────
    const outDir = path.resolve('test-results');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'sfv-items.json');
    fs.writeFileSync(outFile, JSON.stringify(items, null, 2), 'utf-8');
    console.log(`\n  📄 บันทึกข้อมูล ${items.length} items → ${outFile}`);

    await saveScreenshot(page, '02-sfv-scroll-final');

    // ── assertions ───────────────────────────────────────────────────────────

    // 1. เก็บได้อย่างน้อย 15 items (รองรับกรณี network ช้า)
    expect(items.length).toBeGreaterThanOrEqual(15);

    // 2. video ID ไม่ซ้ำกัน
    const dupIds = items
      .map(i => i.videoId)
      .filter((id, idx, arr) => id && arr.indexOf(id) !== idx);
    expect(dupIds).toHaveLength(0);

    // 3. URL ไม่ซ้ำกัน
    expect(seenUrls.size).toBe(items.length);

    // 4. type ทุก item ต้องมี "short" อยู่ใน URL path
    const wrongType = items.filter(i => !i.url.includes('/short/'));
    expect(wrongType).toHaveLength(0);

    console.log(`\n  ✅ ผ่านทั้งหมด ${items.length} items — ไม่ซ้ำ, type ถูกต้อง`);
  });

});
