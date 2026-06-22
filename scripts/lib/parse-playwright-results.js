#!/usr/bin/env node
/**
 * อ่านและแปลง test-results/results.json (Playwright JSON reporter) ให้เป็น
 * flat list ของ test case ใช้ร่วมกันระหว่าง generate-step-summary.js และ
 * send-discord-report.js เพื่อไม่ให้ logic การตีความ status เพี้ยนไปคนละทาง
 */

const fs = require('fs');
const path = require('path');

function loadResults(resultsFile = path.resolve('test-results/results.json')) {
  if (!fs.existsSync(resultsFile)) {
    throw new Error(`ไม่พบไฟล์ ${resultsFile} — ต้องรัน "npx playwright test" ก่อน`);
  }
  return JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
}

function looksLikeWafBlock(text = '') {
  return /incapsula|imperva|waf|soft-block|datacenter|cloud ip|page\.goto timeout|_Incapsula_Resource/i.test(text);
}

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
        const annotations = [...(test.annotations || []), ...(last.annotations || [])];
        const skipReason =
          annotations.find((a) => a.type === 'skip' && a.description)?.description || '';
        const errorMessage = last.error?.message?.split('\n')[0] || '';
        cases.push({
          group: titles.join(' › '),
          title: spec.title,
          status,
          retries: Math.max(0, results.length - 1),
          durationMs: duration,
          projectName: test.projectName || '',
          errorMessage,
          skipReason,
          wafBlocked: looksLikeWafBlock(`${skipReason}\n${errorMessage}`),
        });
      }
    }
    cases.push(...collectCases(suite.suites, titles));
  }
  return cases;
}

function summarize(data) {
  const cases = collectCases(data.suites);
  const passCount = cases.filter((c) => c.status === 'passed').length;
  const flakyCount = cases.filter((c) => c.status === 'flaky').length;
  const failCount = cases.filter((c) => !['passed', 'flaky', 'skipped'].includes(c.status)).length;
  const skipCount = cases.filter((c) => c.status === 'skipped').length;
  const wafBlockedCount = cases.filter((c) => c.wafBlocked).length;
  return { cases, stats: data.stats, passCount, flakyCount, failCount, skipCount, wafBlockedCount };
}

const ICON = { passed: '✅', failed: '❌', timedOut: '⏱️', flaky: '⚠️', skipped: '⏭️', interrupted: '❌' };
const fmtMs = (ms) => `${(ms / 1000).toFixed(1)}s`;

module.exports = { loadResults, collectCases, summarize, ICON, fmtMs };
