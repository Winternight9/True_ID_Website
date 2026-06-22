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

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!WEBHOOK_URL) {
  console.log('⚠️  ไม่ได้ตั้ง DISCORD_WEBHOOK_URL — skip การส่ง Discord report');
  process.exit(0);
}

let data;
try {
  data = loadResults();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const { cases, stats, passCount, flakyCount, failCount, skipCount, wafBlockedCount } = summarize(data);
const total = cases.length;

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

const failedCases = cases.filter((c) => !['passed', 'flaky', 'skipped'].includes(c.status));
if (failedCases.length) {
  const text = failedCases
    .map((c) => `❌ **${c.title}**${c.errorMessage ? `\n  ${c.errorMessage.slice(0, 150)}` : ''}`)
    .join('\n')
    .slice(0, 1024);
  fields.push({ name: `Failed tests (${failedCases.length})`, value: text });
}

const flakyCases = cases.filter((c) => c.status === 'flaky');
if (flakyCases.length) {
  const text = flakyCases.map((c) => `⚠️ ${c.title} (retried ${c.retries}x)`).join('\n').slice(0, 1024);
  fields.push({ name: `Flaky tests (${flakyCases.length})`, value: text });
}

const skippedCases = cases.filter((c) => c.status === 'skipped');
if (skippedCases.length) {
  const text = skippedCases
    .map((c) => `⏭️ **${c.title}**${c.skipReason ? `\n  ${c.skipReason.slice(0, 180)}` : ''}`)
    .join('\n')
    .slice(0, 1024);
  fields.push({ name: `Skipped tests (${skippedCases.length})`, value: text });
}

const wafBlockedCases = cases.filter((c) => c.wafBlocked);
if (wafBlockedCases.length) {
  const text = wafBlockedCases
    .map((c) => `🛡️ **${c.title}**${c.skipReason ? `\n  ${c.skipReason.slice(0, 180)}` : ''}`)
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
      footer: { text: 'ekanant1412/True_ID_Website' },
    },
  ],
};

fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
})
  .then(async (res) => {
    if (!res.ok) {
      console.error(`❌ Discord webhook ตอบ ${res.status}: ${await res.text()}`);
      process.exit(1);
    }
    console.log('✅ ส่ง Discord report สำเร็จ');
  })
  .catch((err) => {
    console.error('❌ ส่ง Discord report ไม่สำเร็จ:', err.message);
    process.exit(1);
  });
