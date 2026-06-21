import { Page, expect } from '@playwright/test';
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
