#!/usr/bin/env node
/**
 * ส่งสรุปผล Playwright test run ไปที่ Discord ผ่าน Incoming Webhook
 *
 * ต้องตั้ง env DISCORD_WEBHOOK_URL (เก็บเป็น GitHub Actions secret) ก่อนรัน
 * ถ้าไม่ตั้งไว้ จะ skip เงียบๆ (exit 0) เพื่อไม่ให้ workflow แดงเพราะลืมตั้ง secret
 *
 * Usage: node scripts/send-discord-report.js
 */

const { loadResults, summarize, fmtMs } = require('./lib/parse-playwright-results');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DEBUG = process.env.DISCORD_DEBUG !== '0';
const ATTACH_REPORT = process.env.DISCORD_ATTACH_REPORT !== '0';
const REPORT_DIR = path.resolve('screenshots');
const REPORT_IMAGE_DIR = path.resolve('test-results/discord-report');
const MAX_DISCORD_FILE_BYTES = Number(process.env.DISCORD_MAX_FILE_BYTES || 8 * 1024 * 1024);

function maskWebhookUrl(value = '') {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const maskedParts = parts.map((part, index) => {
      if (index < 2) return part;
      if (part.length <= 8) return '***';
      return `${part.slice(0, 4)}...${part.slice(-4)}`;
    });
    return `${url.origin}/${maskedParts.join('/')}`;
  } catch {
    return '[invalid URL]';
  }
}

function debugLog(message, detail) {
  if (!DEBUG) return;
  if (detail === undefined) {
    console.log(`🔎 ${message}`);
  } else {
    console.log(`🔎 ${message}: ${detail}`);
  }
}

function findLatestHtmlReport() {
  if (!ATTACH_REPORT) return null;
  if (!fs.existsSync(REPORT_DIR)) return null;

  const reports = fs.readdirSync(REPORT_DIR)
    .filter((file) => /^report_.*\.html$/i.test(file))
    .map((file) => {
      const filePath = path.join(REPORT_DIR, file);
      const stat = fs.statSync(filePath);
      return { file, filePath, stat };
    })
    .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

  return reports[0] || null;
}

async function renderHtmlReportToPng(reportFile) {
  if (!fs.existsSync(REPORT_IMAGE_DIR)) fs.mkdirSync(REPORT_IMAGE_DIR, { recursive: true });

  const { chromium } = require('playwright');
  const baseName = path.basename(reportFile.file, '.html');
  const outFile = `${baseName}.png`;
  const outPath = path.join(REPORT_IMAGE_DIR, outFile);
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 2200 },
      deviceScaleFactor: 1,
    });
    await page.goto(pathToFileURL(reportFile.filePath).href, { waitUntil: 'networkidle' });
    await page.screenshot({ path: outPath, fullPage: true });

    const stat = fs.statSync(outPath);
    return { file: outFile, filePath: outPath, stat };
  } finally {
    await browser.close();
  }
}

if (!WEBHOOK_URL) {
  console.log('⚠️  ไม่ได้ตั้ง DISCORD_WEBHOOK_URL — skip การส่ง Discord report');
  process.exit(0);
}

let webhookUrl;
try {
  webhookUrl = new URL(WEBHOOK_URL);
} catch {
  console.error('❌ DISCORD_WEBHOOK_URL ไม่ใช่ URL ที่ถูกต้อง');
  console.error(`   value: ${maskWebhookUrl(WEBHOOK_URL)}`);
  process.exit(1);
}

debugLog('Discord webhook env found', maskWebhookUrl(WEBHOOK_URL));
debugLog('Discord webhook host', webhookUrl.host);

let data;
try {
  data = loadResults();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const { cases, stories, stats, passCount, flakyCount, failCount, skipCount, wafBlockedCount } = summarize(data);
const total = cases.length;
debugLog('Loaded Playwright results', `${total} cases, ${stories.length} stories`);

// สีของ embed: แดง = มี fail, เหลือง = ผ่านหมดแต่มี flaky, เขียว = ผ่านหมดจริงๆ
const COLOR = { red: 0xe24b4a, amber: 0xef9f27, green: 0x639922 };
const color = failCount > 0 ? COLOR.red : flakyCount > 0 ? COLOR.amber : COLOR.green;
const headline =
  failCount > 0
    ? `🔴 ${failCount} test ล้มเหลว`
    : flakyCount > 0
      ? `🟡 ผ่านหมด แต่มี ${flakyCount} test flaky`
      : wafBlockedCount > 0
        ? `🟡 ผ่านตามเกณฑ์ แต่พบ ${wafBlockedCount} WAF/soft-block signal`
      : `🟢 ผ่านทั้งหมด ${passCount}/${total}`;

const runUrl =
  process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : undefined;

const fields = [];

for (const area of [...new Set(stories.map((s) => s.area))]) {
  const storyText = stories
    .filter((s) => s.area === area)
    .map((s) => {
      const statusIcon = s.failed ? '❌' : s.flaky ? '⚠️' : s.skipped ? '⏭️' : '✅';
      const notes = [
        s.flaky ? `${s.flaky} flaky` : '',
        s.failed ? `${s.failed} failed` : '',
        s.skipped ? `${s.skipped} skipped` : '',
        s.wafBlocked ? `${s.wafBlocked} WAF` : '',
      ].filter(Boolean).join(', ');
      return `${statusIcon} ${s.requirement} (${s.passed + s.flaky}/${s.total})${notes ? ` — ${notes}` : ''}`;
    })
    .join('\n')
    .slice(0, 1024);

  if (storyText) {
    fields.push({ name: `${area} story coverage`, value: storyText });
  }
}

const failedCases = cases.filter((c) => !['passed', 'flaky', 'skipped'].includes(c.status));
if (failedCases.length) {
  const text = failedCases
    .map((c) => `❌ **${c.area} · ${c.requirement}**${c.errorMessage ? `\n  ${c.errorMessage.slice(0, 150)}` : ''}`)
    .join('\n')
    .slice(0, 1024);
  fields.push({ name: `Failed tests (${failedCases.length})`, value: text });
}

const flakyCases = cases.filter((c) => c.status === 'flaky');
if (flakyCases.length) {
  const text = flakyCases
    .map((c) => `⚠️ **${c.area} · ${c.requirement}**\n  ${c.title} (retried ${c.retries}x)`)
    .join('\n')
    .slice(0, 1024);
  fields.push({ name: `Flaky tests (${flakyCases.length})`, value: text });
}

const skippedCases = cases.filter((c) => c.status === 'skipped');
if (skippedCases.length) {
  const text = skippedCases
    .map((c) => `⏭️ **${c.area} · ${c.requirement}**${c.skipReason ? `\n  ${c.skipReason.slice(0, 180)}` : ''}`)
    .join('\n')
    .slice(0, 1024);
  fields.push({ name: `Skipped tests (${skippedCases.length})`, value: text });
}

const wafBlockedCases = cases.filter((c) => c.wafBlocked);
if (wafBlockedCases.length) {
  const text = wafBlockedCases
    .map((c) => `🛡️ **${c.area} · ${c.requirement}**${c.skipReason ? `\n  ${c.skipReason.slice(0, 180)}` : ''}`)
    .join('\n')
    .slice(0, 1024);
  fields.push({ name: `WAF / soft-block signals (${wafBlockedCases.length})`, value: text });
}

const payload = {
  username: 'Playwright Bot',
  embeds: [
    {
      title: `🎭 TrueID Playwright Daily Report`,
      description:
        `${headline}\n` +
        `✅ ${passCount} passed · ⚠️ ${flakyCount} flaky · ❌ ${failCount} failed · ⏭️ ${skipCount} skipped · 🛡️ ${wafBlockedCount} WAF\n` +
        `⏱️ ${fmtMs(stats.duration)} total`,
      color,
      url: runUrl,
      fields,
      timestamp: new Date(stats.startTime).toISOString(),
      footer: { text: process.env.CIRCLE_PROJECT_REPONAME || process.env.GITHUB_REPOSITORY || 'True_ID_Website' },
    },
  ],
};

const payloadJson = JSON.stringify(payload);
const reportFile = findLatestHtmlReport();
debugLog(
  'Discord payload summary',
  `${payloadJson.length} bytes, ${payload.embeds.length} embed(s), ${fields.length} field(s)`
);
fields.forEach((field, index) => {
  debugLog(`Field ${index + 1}`, `${field.name.length} chars name, ${field.value.length} chars value`);
});
if (payloadJson.length > 6000) {
  console.warn(`⚠️  Discord payload ยาว ${payloadJson.length} bytes อาจเกิน limit ของ embed/webhook`);
}

(async () => {
  let requestBody = payloadJson;
  let requestHeaders = { 'Content-Type': 'application/json' };

  if (ATTACH_REPORT) {
    if (!reportFile) {
      console.warn(`⚠️  ไม่พบ HTML report ใน ${REPORT_DIR} — ส่ง Discord เฉพาะ embed`);
    } else {
      try {
        debugLog('Rendering HTML report to PNG', reportFile.file);
        const reportImage = await renderHtmlReportToPng(reportFile);

        if (reportImage.stat.size > MAX_DISCORD_FILE_BYTES) {
          console.warn(
            `⚠️  PNG report ใหญ่เกินไป (${reportImage.stat.size} bytes > ${MAX_DISCORD_FILE_BYTES} bytes) — ส่งเฉพาะ embed`
          );
        } else {
          const form = new FormData();
          const bytes = fs.readFileSync(reportImage.filePath);
          form.append('payload_json', payloadJson);
          form.append('files[0]', new Blob([bytes], { type: 'image/png' }), reportImage.file);
          requestBody = form;
          requestHeaders = undefined;
          debugLog('Attached PNG report', `${reportImage.file} (${reportImage.stat.size} bytes)`);
        }
      } catch (err) {
        console.warn(`⚠️  แปลง HTML report เป็น PNG ไม่สำเร็จ — ส่งเฉพาะ embed: ${err.message}`);
      }
    }
  } else {
    debugLog('Report image attachment disabled', 'DISCORD_ATTACH_REPORT=0');
  }

  return fetch(WEBHOOK_URL, {
    method: 'POST',
    ...(requestHeaders ? { headers: requestHeaders } : {}),
    body: requestBody,
  });
})()
  .then(async (res) => {
    const body = await res.text();
    debugLog('Discord response status', `${res.status} ${res.statusText}`);
    debugLog('Discord response body', body || '[empty]');
    if (!res.ok) {
      console.error(`❌ Discord webhook ตอบ ${res.status}: ${body || '[empty body]'}`);
      process.exit(1);
    }
    console.log('✅ ส่ง Discord report สำเร็จ');
  })
  .catch((err) => {
    console.error('❌ ส่ง Discord report ไม่สำเร็จ');
    console.error(`   name: ${err.name || 'UnknownError'}`);
    console.error(`   message: ${err.message}`);
    if (err.cause) {
      console.error(`   cause: ${err.cause.message || err.cause}`);
    }
    process.exit(1);
  });
