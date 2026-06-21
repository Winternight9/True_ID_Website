import { Page, expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export const SCREENSHOTS_DIR = path.resolve('screenshots');

export async function gotoAndWait(page: Page, url: string, waitMs = 4000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(waitMs);
}

export async function saveScreenshot(page: Page, name: string) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(SCREENSHOTS_DIR, `${name}_${ts}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

// บางครั้งเว็บ trueid.net / game.trueid.net แสดง splash/cover overlay เต็มจอ
// (เช่น หน้าไว้อาลัย "สถิตกลางใจปวงประชา") ที่บัง search input ไว้
// section[class*="CoverTheme"] intercept pointer events จนกว่าจะกดปุ่ม "เข้าสู่เว็บไซต์"
export async function dismissSiteCover(page: Page) {
  const enterBtn = page.getByText('เข้าสู่เว็บไซต์', { exact: false }).first();
  const visible = await enterBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (visible) {
    await enterBtn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
  }
}

// www.trueid.net อยู่หลัง Incapsula (Imperva) WAF ซึ่งมัก challenge/block
// request ที่มาจาก cloud/datacenter IP (เช่น GitHub Actions hosted runner)
// แล้ว redirect ไปหน้า /_Incapsula_Resource แทนหน้าจริง — ไม่ใช่ bug ของเว็บ
// หรือของ test เลย แต่เป็นข้อจำกัดของ network ที่รัน CI อยู่
// เรียกใช้หลัง page.goto() ไปหน้าที่สงสัยว่าจะถูกบล็อก เพื่อ skip แบบมีเหตุผล
// ชัดเจน ดีกว่าให้ assertion timeout แล้วโผล่เป็น "failed" ที่ทำให้เข้าใจผิด
export async function skipIfBlockedByWAF(page: Page, label: string) {
  const url = page.url();
  const blocked = url.includes('_Incapsula_Resource') || url.includes('Incapsula');
  if (blocked) {
    test.skip(
      true,
      `⚠️ ${label} ถูก Incapsula WAF บล็อก (พบ "_Incapsula_Resource" ใน URL) — ` +
        `มักเกิดกับ cloud/datacenter IP เช่น GitHub Actions runner ไม่ใช่ความผิดของเว็บหรือ test`
    );
  }
}

export async function checkVisible(page: Page, selector: string, label: string) {
  try {
    await expect(page.locator(selector).first()).toBeVisible({ timeout: 8000 });
    console.log(`  ✅ ${label}`);
    return true;
  } catch {
    console.warn(`  ❌ ${label} — not found (selector: ${selector})`);
    return false;
  }
}

export async function checkText(page: Page, text: string, label: string) {
  try {
    await expect(page.getByText(text, { exact: false }).first()).toBeVisible({ timeout: 8000 });
    console.log(`  ✅ ${label}`);
    return true;
  } catch {
    console.warn(`  ❌ ${label} — text "${text}" not visible`);
    return false;
  }
}
