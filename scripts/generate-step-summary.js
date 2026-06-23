#!/usr/bin/env node
/**
 * GitHub Actions Step Summary Generator
 * อ่าน test-results/results.json (Playwright JSON reporter) แล้วเขียนตาราง
 * markdown แบบ test case ต่อแถว ไปที่ $GITHUB_STEP_SUMMARY (หรือ stdout ถ้ารัน local)
 *
 * Usage: node scripts/generate-step-summary.js
 */

const { loadResults, summarize, ICON, fmtMs } = require('./lib/parse-playwright-results');

const SUMMARY_FILE = process.env.GITHUB_STEP_SUMMARY;

let data;
try {
  data = loadResults();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const { cases, stories, stats, passCount, flakyCount, failCount, skipCount, wafBlockedCount } = summarize(data);

const lines = [];
lines.push(`## 🎭 Playwright Test Report — ${new Date(stats.startTime).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
lines.push('');
lines.push(
  `**${passCount + flakyCount}/${cases.length} passed** · ⏱️ ${fmtMs(stats.duration)} total` +
    (failCount ? ` · ❌ ${failCount} failed` : '') +
    (flakyCount ? ` · ⚠️ ${flakyCount} flaky` : '') +
    (skipCount ? ` · ⏭️ ${skipCount} skipped` : '') +
    (wafBlockedCount ? ` · 🛡️ ${wafBlockedCount} WAF/soft-block suspected` : '')
);
lines.push('');
lines.push('### Story Coverage');
lines.push('');
lines.push('| Area | Story | Requirement | Status | Cases | Duration | Notes |');
lines.push('|---|---|---|---|---:|---:|---|');

for (const s of stories) {
  const icon = ICON[s.status] || '❔';
  const notes = [
    s.flaky ? `${s.flaky} flaky` : '',
    s.failed ? `${s.failed} failed` : '',
    s.skipped ? `${s.skipped} skipped` : '',
    s.wafBlocked ? `${s.wafBlocked} WAF` : '',
  ].filter(Boolean).join(', ') || '-';
  lines.push(
    `| ${s.area} | ${s.story} | ${s.requirement} | ${icon} ${s.status} | ${s.passed + s.flaky}/${s.total} | ${fmtMs(s.durationMs)} | ${notes} |`
  );
}

lines.push('');
lines.push('### Test Case Details');
lines.push('');
lines.push('| Status | Area | Requirement | Test case | Duration | Retries |');
lines.push('|---|---|---|---|---:|---:|');

for (const c of cases) {
  const icon = ICON[c.status] || '❔';
  lines.push(
    `| ${icon} ${c.status} | ${c.area} | ${c.requirement} | ${c.title} | ${fmtMs(c.durationMs)} | ${c.retries} |`
  );
}

// แสดง error message แยกสำหรับเคสที่ fail/flaky เพื่อดูสาเหตุได้ทันทีโดยไม่ต้องเปิด artifact
const withErrors = cases.filter((c) => c.errorMessage && c.status !== 'passed');
if (withErrors.length) {
  lines.push('');
  lines.push('### Failure details');
  lines.push('');
  for (const c of withErrors) {
    lines.push(`<details><summary>${ICON[c.status] || '❔'} ${c.area} / ${c.requirement}</summary>`);
    lines.push('');
    lines.push(`Test: ${c.title}`);
    lines.push('');
    lines.push('```');
    lines.push(c.errorMessage);
    lines.push('```');
    lines.push('</details>');
  }
}

const skippedCases = cases.filter((c) => c.status === 'skipped');
if (skippedCases.length) {
  lines.push('');
  lines.push('### Skipped details');
  lines.push('');
  for (const c of skippedCases) {
    lines.push(`<details><summary>${ICON[c.status] || '❔'} ${c.area} / ${c.requirement}</summary>`);
    lines.push('');
    lines.push(`Test: ${c.title}`);
    lines.push('');
    lines.push(c.skipReason || 'No skip reason recorded.');
    lines.push('');
    lines.push(`Group: ${c.group}`);
    lines.push('</details>');
  }
}

const wafBlockedCases = cases.filter((c) => c.wafBlocked);
if (wafBlockedCases.length) {
  lines.push('');
  lines.push('### WAF / Soft-Block Signals');
  lines.push('');
  lines.push(
    'These cases look environment-related on GitHub-hosted runners, usually from Incapsula/Imperva WAF, ' +
      'datacenter IP reputation, or degraded SSR/API content. They are logged separately from product regressions.'
  );
  lines.push('');
  for (const c of wafBlockedCases) {
    lines.push(`- **${c.area} / ${c.requirement}** — ${c.skipReason || c.errorMessage || 'No reason recorded.'}`);
  }
}

const markdown = lines.join('\n') + '\n';

if (SUMMARY_FILE) {
  require('fs').appendFileSync(SUMMARY_FILE, markdown);
  console.log(`✅ เขียน step summary ไปที่ ${SUMMARY_FILE}`);
} else {
  console.log(markdown);
}

// exit code สะท้อนผลจริง เผื่อ workflow อยากใช้ต่อ (เช่น gate การแจ้งเตือน)
process.exit(failCount > 0 ? 1 : 0);
