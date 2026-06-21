#!/usr/bin/env node
/**
 * TrueID Check — HTML Summary Report Generator
 * Reads test-results/results.json produced by Playwright's JSON reporter
 * and writes screenshots/report_<timestamp>.html
 */

const fs = require('fs');
const path = require('path');

const RESULTS_FILE = path.resolve('test-results/results.json');
const SCREENSHOTS_DIR = path.resolve('screenshots');
const OUTPUT_DIR = path.resolve('screenshots');

if (!fs.existsSync(RESULTS_FILE)) {
  console.error('❌ results.json not found. Run: npm test first.');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
const ts = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
const tsFile = new Date().toISOString().replace(/[:.]/g, '-');

// Collect all screenshots sorted by modified time (latest first)
let screenshots = [];
if (fs.existsSync(SCREENSHOTS_DIR)) {
  screenshots = fs.readdirSync(SCREENSHOTS_DIR)
    .filter(f => f.endsWith('.png'))
    .map(f => ({
      name: f,
      mtime: fs.statSync(path.join(SCREENSHOTS_DIR, f)).mtime,
      path: f,
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 40); // show latest 40
}

// Parse suites → tests
const allTests = [];
function parseSuite(suite) {
  if (suite.specs) {
    for (const spec of suite.specs) {
      for (const test of (spec.tests || [])) {
        const status = test.results?.[0]?.status || 'unknown';
        allTests.push({
          title: `${suite.title} › ${spec.title}`,
          status,
          duration: test.results?.[0]?.duration || 0,
          error: test.results?.[0]?.error?.message || '',
        });
      }
    }
  }
  if (suite.suites) {
    for (const child of suite.suites) parseSuite(child);
  }
}
for (const suite of (data.suites || [])) parseSuite(suite);

const passed = allTests.filter(t => t.status === 'passed').length;
const failed = allTests.filter(t => t.status === 'failed').length;
const skipped = allTests.filter(t => t.status === 'skipped').length;
const total = allTests.length;

const statusBadge = failed > 0
  ? '<span style="background:#e74c3c;color:#fff;padding:4px 14px;border-radius:20px;font-weight:bold;">❌ มีปัญหา</span>'
  : '<span style="background:#27ae60;color:#fff;padding:4px 14px;border-radius:20px;font-weight:bold;">✅ ผ่านทั้งหมด</span>';

const testRows = allTests.map(t => {
  const color = t.status === 'passed' ? '#27ae60' : t.status === 'failed' ? '#e74c3c' : '#f39c12';
  const icon = t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : '⚠️';
  const errHtml = t.error ? `<div style="font-size:11px;color:#e74c3c;margin-top:4px;white-space:pre-wrap;">${t.error.slice(0, 300)}</div>` : '';
  return `
  <tr>
    <td style="padding:8px 12px;">${icon} ${t.title}</td>
    <td style="padding:8px 12px;color:${color};font-weight:bold;">${t.status}</td>
    <td style="padding:8px 12px;">${(t.duration / 1000).toFixed(1)}s</td>
    <td style="padding:8px 12px;">${errHtml}</td>
  </tr>`;
}).join('');

const screenshotCards = screenshots.map(s => {
  const label = s.name.replace(/_\d{4}-\d{2}-.*\.png$/, '').replace(/_/g, ' ');
  return `
  <div style="display:inline-block;margin:8px;vertical-align:top;width:320px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.12);overflow:hidden;">
    <div style="padding:8px 12px;font-size:12px;font-weight:600;background:#f4f6fb;color:#333;">${label}</div>
    <img src="${s.path}" alt="${s.name}" style="width:100%;display:block;" loading="lazy"/>
    <div style="padding:4px 12px 8px;font-size:10px;color:#999;">${s.mtime.toLocaleString('th-TH')}</div>
  </div>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<title>TrueID Automated Check Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f8; margin: 0; padding: 24px; }
  h1 { color: #c0392b; }
  .summary { background:#fff; border-radius:10px; padding:20px 28px; box-shadow:0 2px 10px rgba(0,0,0,0.08); margin-bottom:24px; }
  table { width:100%; border-collapse:collapse; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.08); }
  th { background:#2c3e50; color:#fff; padding:10px 12px; text-align:left; }
  tr:nth-child(even) { background:#f9f9f9; }
  .section-title { font-size:20px; font-weight:700; margin:32px 0 12px; color:#2c3e50; }
  .stat { display:inline-block; margin-right:24px; font-size:18px; }
</style>
</head>
<body>
<h1>🎬 TrueID Automated Check Report</h1>
<div class="summary">
  <div style="margin-bottom:12px;">${statusBadge}&nbsp;&nbsp;<span style="color:#888;font-size:14px;">สร้างเมื่อ: ${ts}</span></div>
  <div>
    <span class="stat">📋 ทั้งหมด: <b>${total}</b></span>
    <span class="stat" style="color:#27ae60;">✅ ผ่าน: <b>${passed}</b></span>
    <span class="stat" style="color:#e74c3c;">❌ ล้มเหลว: <b>${failed}</b></span>
    <span class="stat" style="color:#f39c12;">⚠️ ข้าม: <b>${skipped}</b></span>
  </div>
</div>

<div class="section-title">📊 ผลการทดสอบ</div>
<table>
  <thead><tr>
    <th>Test</th><th>Status</th><th>Duration</th><th>Error</th>
  </tr></thead>
  <tbody>${testRows}</tbody>
</table>

<div class="section-title">📸 Screenshots (ล่าสุด)</div>
<div>${screenshotCards || '<p style="color:#888">ยังไม่มี screenshots</p>'}</div>
</body>
</html>`;

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const outFile = path.join(OUTPUT_DIR, `report_${tsFile}.html`);
fs.writeFileSync(outFile, html, 'utf8');
console.log(`\n✅ Report saved: ${outFile}`);
console.log(`   Passed: ${passed}/${total}  |  Failed: ${failed}  |  Skipped: ${skipped}`);
