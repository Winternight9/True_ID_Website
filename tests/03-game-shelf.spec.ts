/**
 * Test: Game Shelf — แนะนำสำหรับคุณ
 * URL: https://game.trueid.net/th-th
 * Checks: เลื่อนลงมาหา shelf "แนะนำสำหรับคุณ" แล้วเก็บข้อมูล items ภายใน
 */
import { test, expect } from '@playwright/test';
import { gotoAndWait, saveScreenshot } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

const URL = 'https://game.trueid.net/th-th';

test.describe('Game Shelf — แนะนำสำหรับคุณ', () => {

  test('เลื่อนหา shelf "แนะนำสำหรับคุณ" และเก็บข้อมูล items', async ({ page }) => {
    await gotoAndWait(page, URL, 6000);

    // ปิด cookie banner ก่อน (ถ้ามี)
    const cookieBtn = page.locator('button:has-text("ยอมรับ"), button:has-text("Accept")').first();
    if (await cookieBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cookieBtn.click();
      await page.waitForTimeout(500);
      console.log('  🍪 ปิด cookie banner แล้ว');
    }

    // เลื่อนลงทีละขั้นเพื่อ trigger lazy-load จนเจอ shelf
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(800);
    }

    // รอให้ข้อความ "แนะนำสำหรับคุณ" ปรากฏ แล้ว scroll เข้า view ก่อนถ่าย
    const shelfHeading = page.getByText('แนะนำสำหรับคุณ', { exact: false }).first();
    await shelfHeading.waitFor({ state: 'visible', timeout: 10000 });

    // scroll ให้ shelf อยู่กลางหน้าจอพอดี
    await shelfHeading.evaluate(el => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
    await page.waitForTimeout(1500);

    await saveScreenshot(page, '03-game-shelf-recommended');

    // ดึงข้อมูล items ภายใน shelf
    const items = await page.evaluate(() => {
      // หา element ที่มีข้อความ "แนะนำสำหรับคุณ" แล้วหา container ของมัน
      const headings = Array.from(document.querySelectorAll('*')).filter(
        el => el.childNodes.length <= 5 && el.textContent?.trim() === 'แนะนำสำหรับคุณ'
      );

      let shelfContainer: Element | null = null;
      for (const heading of headings) {
        // เดินขึ้นไปหา parent ที่มี card/item อยู่ข้างใน
        let parent = heading.parentElement;
        for (let i = 0; i < 6; i++) {
          if (!parent) break;
          const imgs = parent.querySelectorAll('img');
          if (imgs.length >= 2) {
            shelfContainer = parent;
            break;
          }
          parent = parent.parentElement;
        }
        if (shelfContainer) break;
      }

      if (!shelfContainer) return { error: 'ไม่พบ shelf container', items: [] };

      // ดึง card items ภายใน shelf
      const cards = Array.from(
        shelfContainer.querySelectorAll('a, [class*="card"], [class*="Card"], [class*="item"], [class*="Item"]')
      ).filter(el => el.querySelector('img'));

      const seen = new Set<string>();
      const result = [];

      for (const card of cards) {
        const img = card.querySelector('img');
        const titleEl = card.querySelector(
          '[class*="title"], [class*="Title"], [class*="name"], [class*="Name"], h3, h4, h5, p'
        );
        const href = (card as HTMLAnchorElement).href || card.querySelector('a')?.href || '';
        const title = titleEl?.textContent?.trim() || img?.getAttribute('alt') || '';
        const key = href || title;

        if (!key || seen.has(key)) continue;
        seen.add(key);

        result.push({
          title,
          href,
          thumbnail: img?.src || img?.getAttribute('data-src') || '',
        });
      }

      return { error: null, items: result };
    });

    // แสดงผลใน console
    if (items.error) {
      console.warn(`  ⚠️  ${items.error}`);
    } else {
      console.log(`\n  📦 พบ ${items.items.length} items ใน shelf "แนะนำสำหรับคุณ":`);
      items.items.forEach((item, i) => {
        console.log(`  [${i + 1}] "${item.title}" → ${item.href}`);
      });
    }

    // บันทึก JSON
    const outDir = path.resolve('test-results');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'game-shelf-recommended.json');
    fs.writeFileSync(outFile, JSON.stringify(items.items, null, 2), 'utf-8');
    console.log(`\n  📄 บันทึกข้อมูล → ${outFile}`);

    // ── Assertions ────────────────────────────────────────────────────────
    expect(items.error, `shelf container ต้องพบ`).toBeNull();
    expect(items.items.length, 'shelf "แนะนำสำหรับคุณ" ต้องมีอย่างน้อย 5 items').toBeGreaterThanOrEqual(5);

    // no duplicate hrefs/titles
    const keys = items.items.map(i => i.href || i.title);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size, `ห้ามมี duplicate items — พบ ${keys.length - uniqueKeys.size} ซ้ำ`).toBe(keys.length);

    console.log(`  ✅ เก็บได้ ${items.items.length} items (ไม่ซ้ำ)`);
  });

});
