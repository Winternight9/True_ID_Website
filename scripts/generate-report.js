#!/usr/bin/env node
/**
 * TrueID Check — HTML Summary Report Generator
 * Reads test-results/results.json produced by Playwright's JSON reporter
 * and writes screenshots/report_<timestamp>.html
 */

const fs = require('fs');
const path = require('path');
const { loadResults, summarize, ICON, fmtMs } = require('./lib/parse-playwright-results');

const SCREENSHOTS_DIR = path.resolve('screenshots');
const OUTPUT_DIR = path.resolve('screenshots');

let data;
try {
  data = loadResults();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const { cases, stories, stats, passCount, flakyCount, failCount, skipCount, wafBlockedCount } = summarize(data);
const ts = new Date(stats.startTime || Date.now()).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
const tsFile = new Date().toISOString().replace(/[:.]/g, '-');
const total = cases.length;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function statusClass(status) {
  if (status === 'passed') return 'passed';
  if (status === 'flaky') return 'flaky';
  if (status === 'skipped') return 'skipped';
  return 'failed';
}

function statusLabel(status) {
  return `${ICON[status] || '❔'} ${status}`;
}

let screenshots = [];
if (fs.existsSync(SCREENSHOTS_DIR)) {
  screenshots = fs.readdirSync(SCREENSHOTS_DIR)
    .filter((f) => f.endsWith('.png'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(SCREENSHOTS_DIR, f)).mtime,
      path: f,
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 40);
}

const headline =
  failCount > 0
    ? 'มี test ล้มเหลว'
    : flakyCount > 0
      ? 'ผ่าน แต่มี flaky'
      : skipCount > 0
        ? 'ผ่านตามเกณฑ์ แต่มี skipped'
        : 'ผ่านทั้งหมด';

const storyCards = stories.map((s) => {
  const notes = [
    s.flaky ? `${s.flaky} flaky` : '',
    s.failed ? `${s.failed} failed` : '',
    s.skipped ? `${s.skipped} skipped` : '',
    s.wafBlocked ? `${s.wafBlocked} WAF` : '',
  ].filter(Boolean);

  return `
    <section class="story ${statusClass(s.status)}">
      <div class="story-top">
        <span class="pill">${escapeHtml(s.area)}</span>
        <span class="status ${statusClass(s.status)}">${statusLabel(s.status)}</span>
      </div>
      <h3>${escapeHtml(s.story)}</h3>
      <p>${escapeHtml(s.requirement)}</p>
      <div class="story-meta">
        <span>${s.passed + s.flaky}/${s.total} cases passed</span>
        <span>${fmtMs(s.durationMs)}</span>
      </div>
      ${notes.length ? `<div class="notes">${escapeHtml(notes.join(' · '))}</div>` : ''}
    </section>`;
}).join('');

const caseRows = cases.map((c) => `
  <tr>
    <td><span class="status ${statusClass(c.status)}">${statusLabel(c.status)}</span></td>
    <td>${escapeHtml(c.area)}</td>
    <td>${escapeHtml(c.requirement)}</td>
    <td>${escapeHtml(c.title)}</td>
    <td>${fmtMs(c.durationMs)}</td>
    <td>${c.retries}</td>
  </tr>`).join('');

const attentionCases = cases.filter((c) => c.status !== 'passed' || c.errorMessage || c.skipReason);
const attentionHtml = attentionCases.map((c) => `
  <details class="detail ${statusClass(c.status)}">
    <summary>${statusLabel(c.status)} ${escapeHtml(c.area)} · ${escapeHtml(c.requirement)}</summary>
    <div class="detail-body">
      <div><b>Test:</b> ${escapeHtml(c.title)}</div>
      <div><b>Group:</b> ${escapeHtml(c.group)}</div>
      ${c.errorMessage ? `<pre>${escapeHtml(c.errorMessage)}</pre>` : ''}
      ${c.skipReason ? `<pre>${escapeHtml(c.skipReason)}</pre>` : ''}
    </div>
  </details>`).join('');

const screenshotCards = screenshots.map((s) => {
  const label = s.name.replace(/_\d{4}-\d{2}-.*\.png$/, '').replace(/_/g, ' ');
  return `
    <figure class="screenshot">
      <figcaption>${escapeHtml(label)}</figcaption>
      <img src="${escapeHtml(s.path)}" alt="${escapeHtml(s.name)}" loading="lazy"/>
      <small>${s.mtime.toLocaleString('th-TH')}</small>
    </figure>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>TrueID Automated Check Report</title>
<style>
  :root {
    --bg: #f5f7fb;
    --panel: #ffffff;
    --text: #1f2937;
    --muted: #667085;
    --border: #d9dee8;
    --passed: #1f8f55;
    --failed: #c2413b;
    --flaky: #b7791f;
    --skipped: #667085;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  }
  header {
    max-width: 1280px;
    margin: 0 auto 20px;
  }
  h1 { margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }
  h2 { margin: 28px 0 12px; font-size: 20px; letter-spacing: 0; }
  h3 { margin: 12px 0 8px; font-size: 18px; letter-spacing: 0; }
  .subtitle { color: var(--muted); }
  .summary {
    max-width: 1280px;
    margin: 0 auto 24px;
    display: grid;
    grid-template-columns: repeat(6, minmax(120px, 1fr));
    gap: 12px;
  }
  .stat, .story, .detail, table, .screenshot {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .stat { padding: 14px 16px; }
  .stat b { display: block; font-size: 24px; margin-top: 4px; }
  .main-status { grid-column: span 2; }
  .main-status b { color: ${failCount ? 'var(--failed)' : flakyCount ? 'var(--flaky)' : 'var(--passed)'}; }
  main { max-width: 1280px; margin: 0 auto; }
  .stories {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 12px;
  }
  .story { padding: 16px; border-left: 5px solid var(--passed); }
  .story.failed { border-left-color: var(--failed); }
  .story.flaky { border-left-color: var(--flaky); }
  .story.skipped { border-left-color: var(--skipped); }
  .story p { margin: 0; color: var(--muted); line-height: 1.45; }
  .story-top, .story-meta {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
  }
  .story-meta { margin-top: 14px; color: var(--muted); font-size: 13px; }
  .pill {
    padding: 3px 9px;
    border-radius: 999px;
    background: #eef2f7;
    color: #475467;
    font-size: 12px;
    font-weight: 700;
  }
  .status { font-weight: 700; white-space: nowrap; }
  .status.passed { color: var(--passed); }
  .status.failed { color: var(--failed); }
  .status.flaky { color: var(--flaky); }
  .status.skipped { color: var(--skipped); }
  .notes { margin-top: 10px; color: var(--flaky); font-size: 13px; }
  table {
    width: 100%;
    border-collapse: collapse;
    overflow: hidden;
  }
  th, td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    text-align: left;
    vertical-align: top;
    font-size: 14px;
  }
  th { background: #eef2f7; color: #344054; }
  tr:last-child td { border-bottom: 0; }
  .detail { margin-bottom: 8px; padding: 0; }
  .detail summary { cursor: pointer; padding: 12px 14px; font-weight: 700; }
  .detail-body { padding: 0 14px 14px; color: var(--muted); }
  pre {
    white-space: pre-wrap;
    background: #111827;
    color: #f9fafb;
    border-radius: 6px;
    padding: 10px;
    overflow: auto;
  }
  .screenshots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }
  .screenshot { margin: 0; overflow: hidden; }
  .screenshot figcaption { padding: 10px 12px; font-weight: 700; background: #eef2f7; }
  .screenshot img { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
  .screenshot small { display: block; padding: 8px 12px; color: var(--muted); }
  @media (max-width: 900px) {
    body { padding: 16px; }
    .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .main-status { grid-column: span 2; }
    table { display: block; overflow-x: auto; }
  }
</style>
</head>
<body>
<header>
  <h1>TrueID Automated Check Report</h1>
  <div class="subtitle">สร้างเมื่อ ${escapeHtml(ts)} · รวมเวลา ${fmtMs(stats.duration || 0)}</div>
</header>

<section class="summary">
  <div class="stat main-status">Status <b>${escapeHtml(headline)}</b></div>
  <div class="stat">Total <b>${total}</b></div>
  <div class="stat">Passed <b>${passCount}</b></div>
  <div class="stat">Flaky <b>${flakyCount}</b></div>
  <div class="stat">Failed <b>${failCount}</b></div>
  <div class="stat">Skipped / WAF <b>${skipCount} / ${wafBlockedCount}</b></div>
</section>

<main>
  <h2>Story Coverage</h2>
  <section class="stories">${storyCards}</section>

  <h2>Test Case Details</h2>
  <table>
    <thead>
      <tr><th>Status</th><th>Area</th><th>Requirement</th><th>Test</th><th>Duration</th><th>Retries</th></tr>
    </thead>
    <tbody>${caseRows}</tbody>
  </table>

  <h2>Attention Needed</h2>
  ${attentionHtml || '<p class="subtitle">ไม่มี failed, flaky, skipped หรือ error detail ในรอบนี้</p>'}

  <h2>Screenshots ล่าสุด</h2>
  <section class="screenshots">${screenshotCards || '<p class="subtitle">ยังไม่มี screenshots</p>'}</section>
</main>
</body>
</html>`;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const outFile = path.join(OUTPUT_DIR, `report_${tsFile}.html`);
fs.writeFileSync(outFile, html, 'utf8');
console.log(`\n✅ Report saved: ${outFile}`);
console.log(`   Passed: ${passCount}/${total} | Failed: ${failCount} | Flaky: ${flakyCount} | Skipped: ${skipCount} | WAF: ${wafBlockedCount}`);
