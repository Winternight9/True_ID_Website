#!/usr/bin/env node
/**
 * GitHub Actions Step Summary Generator
 * อ่าน test-results/results.json (Playwright JSON reporter) แล้วเขียนตาราง
 * markdown แบบ test case ต่อแถว ไปที่ $GITHUB_STEP_SUMMARY (หรือ stdout ถ้ารัน local)
 *
 * Usage: node scripts/generate-step-summary.js
 */

const fs = require('fs');
const path = require('path');

const RESULTS_FILE = path.resolve('test-results/results.json');
const SUMMARY_FILE = process.env.GITHUB_STEP_SUMMARY;

if (!fs.existsSync(RESULTS_FILE)) {
  console.error(`❌ ไม่พบไฟล์ ${RESULTS_FILE} — ต้องรัน "npx playwright test" ก่อน`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
const { stats } = data;

/** เดินไล่ suites แบบ recursive เก็บ test case ทั้งหมดออกมาเป็น flat list */
function collectCases(suites, parentTitles = []) {
  const cases = [];
  for (const suite of suites || []) {
    const titles = suite.title ? [...parentTitles, suite.title] : parentTitles;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const results = test.results || [];
        const last = results[results.length - 1] || {};
        const status =
          results.length > 1 && last.status === 'passed'
            ? 'flaky'
            : last.status || 'skipped';
        const duration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
        cases.push({
          group: titles.join(' › '),
          title: spec.title,
          status,
          retries: Math.max(0, results.length - 1),
          durationMs: duration,
          projectName: test.projectName || '',
          errorMessage: last.error?.message?.split('\n')[0] || '',
        });
      }
    }
    cases.push(...collectCases(suite.suites, titles));
  }
  return cases;
}

const cases = collectCases(data.suites);

const ICON = { passed: '✅', failed: '❌', timedOut: '⏱️', flaky: '⚠️', skipped: '⏭️', interrupted: '❌' };
const fmtMs = (ms) => `${(ms / 1000).toFixed(1)}s`;

const passCount = cases.filter((c) => c.status === 'passed').length;
const flakyCount = cases.filter((c) => c.status === 'flaky').length;
const failCount = cases.filter((c) => !['passed', 'flaky', 'skipped'].includes(c.status)).length;
const skipCount = cases.filter((c) => c.status === 'skipped').length;

const lines = [];
lines.push(`## 🎭 Playwright Test Report — ${new Date(stats.startTime).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
lines.push('');
lines.push(
  `**${passCount + flakyCount}/${cases.length} passed** · ⏱️ ${fmtMs(stats.duration)} total` +
    (failCount ? ` · ❌ ${failCount} failed` : '') +
    (flakyCount ? ` · ⚠️ ${flakyCount} flaky` : '') +
    (skipCount ? ` · ⏭️ ${skipCount} skipped` : '')
);
lines.push('');
lines.push('| Status | Test case | Group | Duration | Retries |');
lines.push('|---|---|---|---|---|');

for (const c of cases) {
  const icon = ICON[c.status] || '❔';
  lines.push(
    `| ${icon} ${c.status} | ${c.title} | ${c.group} | ${fmtMs(c.durationMs)} | ${c.retries} |`
  );
}

// แสดง error message แยกสำหรับเคสที่ fail/flaky เพื่อดูสาเหตุได้ทันทีโดยไม่ต้องเปิด artifact
const withErrors = cases.filter((c) => c.errorMessage && c.status !== 'passed');
if (withErrors.length) {
  lines.push('');
  lines.push('### Failure details');
  lines.push('');
  for (const c of withErrors) {
    lines.push(`<details><summary>${ICON[c.status] || '❔'} ${c.title}</summary>`);
    lines.push('');
    lines.push('```');
    lines.push(c.errorMessage);
    lines.push('```');
    lines.push('</details>');
  }
}

const markdown = lines.join('\n') + '\n';

if (SUMMARY_FILE) {
  fs.appendFileSync(SUMMARY_FILE, markdown);
  console.log(`✅ เขียน step summary ไปที่ ${SUMMARY_FILE}`);
} else {
  console.log(markdown);
}

// exit code สะท้อนผลจริง เผื่อ workflow อยากใช้ต่อ (เช่น gate การแจ้งเตือน)
process.exit(failCount > 0 ? 1 : 0);
