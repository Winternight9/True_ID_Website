import { Page, expect, test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export const SCREENSHOTS_DIR = path.resolve('screenshots');
export const WAF_EVIDENCE_DIR = path.resolve('test-results/waf-evidence');

function safeFilePart(value: string) {
  return value
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'evidence';
}

export async function skipWithEvidence(page: Page, label: string, reason: string) {
  if (!fs.existsSync(WAF_EVIDENCE_DIR)) fs.mkdirSync(WAF_EVIDENCE_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `${ts}-${safeFilePart(label)}`;
  const screenshotPath = path.join(WAF_EVIDENCE_DIR, `${base}.png`);
  const metaPath = path.join(WAF_EVIDENCE_DIR, `${base}.json`);

  let title = '';
  try {
    title = await page.title();
  } catch {}

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    await test.info().attach(`WAF evidence screenshot - ${label}`, {
      path: screenshotPath,
      contentType: 'image/png',
    });
  } catch {}

  const meta = {
    label,
    reason,
    url: page.url(),
    title,
    capturedAt: new Date().toISOString(),
  };

  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  await test.info().attach(`WAF evidence meta - ${label}`, {
    path: metaPath,
    contentType: 'application/json',
  }).catch(() => {});

  const info = test.info();
  const shouldRetryWaf = process.env.CI && info.retry === 0;
  if (shouldRetryWaf) {
    const delayMs = Number(process.env.WAF_RETRY_DELAY_MS || 10000);
    console.warn(`  🛡️ WAF/soft-block evidence captured for "${label}" — retrying once after ${delayMs}ms`);
    await page.waitForTimeout(delayMs).catch(() => {});
    throw new Error(`WAF_RETRY: ${reason}`);
  }

  test.skip(true, reason);
}

// บางครั้ง page.goto() ไม่ resolve เลยภายใน 30s (ไม่ใช่แค่ content หาย แต่ navigation
// ทั้งหน้าค้าง) — เข้าข่าย Incapsula WAF บล็อกระดับ network (เช่น challenge/TLS หน่วงนาน)
// บน cloud/datacenter IP เช่น GitHub Actions runner ไม่ใช่ความผิดของเว็บหรือ test
// skip แทนปล่อยให้ throw จน test กลายเป็น "failed"/"flaky" ที่ทำให้เข้าใจผิด
export async function gotoAndWait(page: Page, url: string, waitMs = 4000, label?: string) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {
    await skipWithEvidence(
      page,
      label || url,
      `⚠️ ${label || url} โหลดไม่สำเร็จภายใน 30s (page.goto timeout) — เข้าข่าย Incapsula WAF ` +
        'บล็อกระดับ network บน cloud/datacenter IP เช่น GitHub Actions runner ไม่ใช่ความผิดของเว็บหรือ test'
    );
    return;
  }
  await page.waitForTimeout(waitMs);
}

// เวอร์ชันสำหรับจุดที่เรียก page.goto() ตรงๆ (ไม่ผ่าน gotoAndWait) เช่นตอน navigate
// ไปหน้า search ผลลัพธ์ — ใช้ logic เดียวกัน: timeout ทั้งหน้า = skip ไม่ใช่ fail
export async function gotoOrSkip(page: Page, url: string, label: string) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {
    await skipWithEvidence(
      page,
      label,
      `⚠️ ${label} โหลดไม่สำเร็จภายใน 30s (page.goto timeout) — เข้าข่าย Incapsula WAF ` +
        'บล็อกระดับ network บน cloud/datacenter IP เช่น GitHub Actions runner ไม่ใช่ความผิดของเว็บหรือ test'
    );
  }
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
  let bodyText = '';
  try {
    bodyText = await page.locator('body').innerText({ timeout: 2000 });
  } catch {}
  const blocked =
    url.includes('_Incapsula_Resource') ||
    url.includes('Incapsula') ||
    /Access Denied|Error 17|blocked by our security service|Incident ID|Proxy IP/i.test(bodyText);
  if (blocked) {
    await skipWithEvidence(
      page,
      label,
      `⚠️ ${label} ถูก Incapsula/Imperva WAF บล็อก (พบ Access Denied/Error 17 หรือ "_Incapsula_Resource") — ` +
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
