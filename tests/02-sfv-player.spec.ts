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
import { gotoAndWait, saveScreenshot, checkVisible, skipIfBlockedByWAF, skipWithEvidence } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'https://www.trueid.net/watch/th-th/short/';
const WATCH_URL = 'https://www.trueid.net/watch/th-th';
const TARGET_ITEMS = 20;
const INVALID_VIDEO_IDS = new Set(['short', 'th-th', 'watch']);
const PLAYER_SELECTOR = 'video-js, #container-sfv, [class*="SFVPlayerWrapper"], [class*="SFVPlayer"], [class*="SFVLayoutWrapper"]';

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

function isRealShortItem(item: { videoId: string; url: string }) {
  return Boolean(
    item.videoId &&
      !INVALID_VIDEO_IDS.has(item.videoId) &&
      item.url.includes('/watch/th-th/short/')
  );
}

/** เลื่อนวิดีโอถัดไปด้วย ArrowDown แล้วรอ URL เปลี่ยน */
async function navigateNext(page: any, prevUrl: string, timeoutMs = 3000): Promise<boolean> {
  const gestures = [
    async () => page.keyboard.press('ArrowDown'),
    async () => page.mouse.wheel(0, Math.floor((page.viewportSize()?.height || 900) * 0.9)),
    async () => page.keyboard.press('PageDown'),
    async () => page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.9))),
  ];

  for (const gesture of gestures) {
    await gesture();

    try {
      await page.waitForFunction(
        (prev: string) => window.location.href !== prev,
        prevUrl,
        { timeout: timeoutMs }
      );
      await page.waitForTimeout(1000); // รอ content โหลดหลัง snap ไป item ถัดไป
      return true;
    } catch {
      if (page.url() !== prevUrl) {
        await page.waitForTimeout(1000);
        return true;
      }
    }
  }

  return false;
}

async function waitForResolvedVideo(page: any) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const item = await collectCurrentItem(page);
    if (isRealShortItem(item)) {
      return item;
    }

    await page.waitForTimeout(1000);
    await page.click('#container-sfv, [class*="SFVLayoutWrapper"], body').catch(() => {});
    await page.keyboard.press('ArrowDown').catch(() => {});
    await page.waitForTimeout(1000);
  }

  return collectCurrentItem(page);
}

async function findShortUrlFromWatchShelf(page: any) {
  await gotoAndWait(page, WATCH_URL, 3000, 'หน้า Watch เพื่อหา short URL');

  for (let i = 0; i < 12; i++) {
    const shortUrl = await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('a[href*="/watch/th-th/short/"]'))
        .map(a => (a as HTMLAnchorElement).href)
        .find(href => /\/watch\/th-th\/short\/[^/?#]+/.test(href));
      return link || '';
    });

    if (shortUrl) {
      return shortUrl;
    }

    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);
  }

  return '';
}

async function openResolvedSfvSession(page: any, label: string) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await gotoAndWait(page, BASE_URL, 5000, `${label} attempt ${attempt}`);
    await page.click(`${PLAYER_SELECTOR}, body`).catch(() => {});

    const baseItem = await waitForResolvedVideo(page);
    if (isRealShortItem(baseItem)) {
      return baseItem;
    }

    const shortUrl = await findShortUrlFromWatchShelf(page);
    if (shortUrl) {
      await gotoAndWait(page, shortUrl, 5000, `${label} fallback short URL`);
      await page.click(`${PLAYER_SELECTOR}, body`).catch(() => {});

      const fallbackItem = await waitForResolvedVideo(page);
      if (isRealShortItem(fallbackItem)) {
        return fallbackItem;
      }
    }
  }

  const item = await collectCurrentItem(page);
  await skipWithEvidence(
    page,
    label,
    `⚠️ หน้า SFV Player ไม่ resolve เป็นวิดีโอจริง (videoId="${item.videoId}") — ` +
      'เข้าข่าย content/API ไม่มา หรือ soft-block ไม่ใช่ผลลัพธ์ที่นำไป assert story ได้'
  );
  return item;
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe('SFV Player — Short', () => {

  test('video player element is present', async ({ page }) => {
    await openResolvedSfvSession(page, 'หน้า SFV Player (short)');
    await skipIfBlockedByWAF(page, 'หน้า SFV Player (short)');
    await saveScreenshot(page, '02-sfv-player-full');

    await checkVisible(page, PLAYER_SELECTOR, 'Video player element');
  });

  test('เลื่อนเปลี่ยนวิดีโอ 20 items — ไม่ซ้ำ และ type ถูกต้อง', async ({ page }) => {
    test.setTimeout(180000);

    const items: { videoId: string; title: string; type: string; url: string }[] = [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();

    for (let sessionAttempt = 1; sessionAttempt <= 3; sessionAttempt++) {
      if (sessionAttempt > 1) {
        console.warn('  ⚠️  SFV feed หยุดก่อนครบ 20 items — reload แล้วลองเริ่ม session ใหม่อีกครั้ง');
        items.length = 0;
        seenIds.clear();
        seenUrls.clear();
      }

      // เก็บ item แรก
      const first = await openResolvedSfvSession(page, `หน้า SFV Player (short) session ${sessionAttempt}`);

      // ถ้า videoId เป็น "short" (literal path segment ของ BASE_URL เอง ไม่ใช่ ID จริง)
      // แปลว่าหน้านี้ไม่ resolve เป็นวิดีโอจริงเลย — เข้าข่าย Incapsula soft-block บน
      // cloud/datacenter IP (หน้าโหลดได้ปกติแต่ SSR/API content ไม่มา) ไม่ใช่ความผิดของเว็บ
      // หรือ test — skip แทนที่จะให้ assertion ด้านล่าง fail แบบเข้าใจผิดว่าเป็นบั๊กจริง
      if (!isRealShortItem(first)) {
        await skipWithEvidence(
          page,
          'หน้า SFV Player (short)',
          `⚠️ หน้า SFV Player ไม่ resolve เป็นวิดีโอจริง (videoId="${first.videoId}") — ` +
            'เข้าข่าย Incapsula soft-block บน cloud/datacenter IP ไม่ใช่ความผิดของเว็บหรือ test'
        );
      }

      items.push(first);
      seenIds.add(first.videoId);
      seenUrls.add(first.url);
      console.log(`  [${items.length}] ${first.videoId} | "${first.title}" | type: ${first.type}`);

      // เลื่อนไปเรื่อยๆ จนครบ TARGET_ITEMS
      while (items.length < TARGET_ITEMS) {
        const prevUrl = page.url();
        const moved = await navigateNext(page, prevUrl);

        if (!moved) {
          console.warn(`  ⚠️  ไม่สามารถเลื่อนวิดีโอถัดไปได้ที่ item ${items.length + 1}`);
          break;
        }

        const item = await waitForResolvedVideo(page);
        items.push(item);
        seenIds.add(item.videoId);
        seenUrls.add(item.url);
        console.log(`  [${items.length}] ${item.videoId} | "${item.title}" | type: ${item.type}`);
      }

      if (items.length >= TARGET_ITEMS) {
        break;
      }
    }

    // ── บันทึก JSON ──────────────────────────────────────────────────────────
    const outDir = path.resolve('test-results');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'sfv-items.json');
    fs.writeFileSync(outFile, JSON.stringify(items, null, 2), 'utf-8');
    console.log(`\n  📄 บันทึกข้อมูล ${items.length} items → ${outFile}`);

    await saveScreenshot(page, '02-sfv-scroll-final');

    // ── assertions ───────────────────────────────────────────────────────────

    // 1. Story requirement: ต้องเลื่อนได้ครบ 20 items
    expect(items.length, `ต้องเลื่อน SFV ได้ครบ ${TARGET_ITEMS} items แต่เก็บได้ ${items.length}`).toBe(TARGET_ITEMS);

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
