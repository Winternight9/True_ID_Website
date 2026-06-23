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

const STORY_RULES = [
  {
    id: 'watch-shelf',
    area: 'Watch',
    story: 'Watch shelf',
    requirement: 'Shelf "คลิปสั้นหนังแนะนำ" visible, items >= 5, no duplicates',
    match: (c) => c.group.includes('01-watch-shelf') && c.title.includes('คลิปสั้นหนังแนะนำ'),
  },
  {
    id: 'watch-header',
    area: 'Watch',
    story: 'Watch header',
    requirement: 'Header and search entry point render',
    match: (c) => c.group.includes('01-watch-shelf') && !c.title.includes('คลิปสั้นหนังแนะนำ'),
  },
  {
    id: 'sfv-player',
    area: 'Watch',
    story: 'SFV player',
    requirement: 'SFV player loads',
    match: (c) => c.group.includes('02-sfv-player') && c.title.includes('video player element'),
  },
  {
    id: 'sfv-scroll',
    area: 'Watch',
    story: 'SFV scroll',
    requirement: 'Scroll 20 items, unique, correct /short/ type',
    match: (c) => c.group.includes('02-sfv-player') && c.title.includes('เลื่อนเปลี่ยนวิดีโอ'),
  },
  {
    id: 'game-shelf',
    area: 'Game',
    story: 'Game shelf',
    requirement: 'Shelf "แนะนำสำหรับคุณ" visible, items >= 5, no duplicates',
    match: (c) => c.group.includes('03-game-shelf'),
  },
  {
    id: 'game-search-puzzle',
    area: 'Game',
    story: 'Game search',
    requirement: 'EN "puzzle" returns results and IDs are unique',
    match: (c) => c.group.includes('04-game-search-home'),
  },
  {
    id: 'home-search-th',
    area: 'Home',
    story: 'Home search',
    requirement: 'TH "ชินจัง" returns results and IDs are extracted from DOM',
    match: (c) => c.group.includes('05-home-search'),
  },
  {
    id: 'home-search-empty',
    area: 'Home',
    story: 'Home search edge',
    requirement: 'Empty keyword does not crash or navigate unexpectedly',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('TrueID Home') && c.title.includes('empty keyword'),
  },
  {
    id: 'home-search-invalid',
    area: 'Home',
    story: 'Home search edge',
    requirement: 'Invalid "*******" returns 0 results and shows no-result UI',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('TrueID Home') && c.title.includes('invalid keyword'),
  },
  {
    id: 'home-search-special',
    area: 'Home',
    story: 'Home search edge',
    requirement: 'Special characters do not crash',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('TrueID Home') && c.title.includes('special characters'),
  },
  {
    id: 'home-search-en',
    area: 'Home',
    story: 'Home search',
    requirement: 'EN "drama" returns results',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('TrueID Home') && c.title.startsWith('EN keyword'),
  },
  {
    id: 'home-search-mixed',
    area: 'Home',
    story: 'Home search',
    requirement: 'Mixed "ชินจัง movie" returns results',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('TrueID Home') && c.title.includes('mixed TH+EN'),
  },
  {
    id: 'game-search-empty',
    area: 'Game',
    story: 'Game search edge',
    requirement: 'Empty keyword does not crash or navigate unexpectedly',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('Game Search') && c.title.includes('empty keyword'),
  },
  {
    id: 'game-search-invalid',
    area: 'Game',
    story: 'Game search edge',
    requirement: 'Invalid "*******" returns 0 results and shows no-result UI',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('Game Search') && c.title.includes('invalid keyword'),
  },
  {
    id: 'game-search-special',
    area: 'Game',
    story: 'Game search edge',
    requirement: 'Special characters do not crash',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('Game Search') && c.title.includes('special characters'),
  },
  {
    id: 'game-search-th',
    area: 'Game',
    story: 'Game search',
    requirement: 'TH "แอคชั่น" returns results',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('Game Search') && c.title.includes('TH keyword'),
  },
  {
    id: 'game-search-en',
    area: 'Game',
    story: 'Game search',
    requirement: 'EN "racing" returns results',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('Game Search') && c.title.startsWith('EN keyword'),
  },
  {
    id: 'game-search-mixed',
    area: 'Game',
    story: 'Game search',
    requirement: 'Mixed "puzzle เกม" returns results',
    match: (c) => c.group.includes('06-search-edge-cases') && c.group.includes('Game Search') && c.title.includes('mixed TH+EN'),
  },
];

function storyMetaFor(testCase) {
  return STORY_RULES.find((rule) => rule.match(testCase)) || {
    id: 'other',
    area: 'Other',
    story: 'Supporting check',
    requirement: testCase.title,
  };
}

function statusRank(status) {
  return { failed: 5, timedOut: 5, interrupted: 5, flaky: 4, skipped: 3, passed: 1 }[status] || 5;
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
        const annotations = [
          ...(test.annotations || []),
          ...results.flatMap((r) => r.annotations || []),
        ];
        const skipReason =
          annotations.find((a) => a.type === 'skip' && a.description)?.description || '';
        const allErrorMessages = results
          .map((r) => r.error?.message?.split('\n')[0] || '')
          .filter(Boolean);
        const errorMessage = allErrorMessages[allErrorMessages.length - 1] || '';
        const testCase = {
          group: titles.join(' › '),
          title: spec.title,
          status,
          retries: Math.max(0, results.length - 1),
          durationMs: duration,
          projectName: test.projectName || '',
          errorMessage,
          skipReason,
          wafBlocked: looksLikeWafBlock(`${skipReason}\n${allErrorMessages.join('\n')}`),
        };
        Object.assign(testCase, storyMetaFor(testCase));
        cases.push(testCase);
      }
    }
    cases.push(...collectCases(suite.suites, titles));
  }
  return cases;
}

function summarizeStories(cases) {
  const byId = new Map();
  for (const c of cases) {
    if (!byId.has(c.id)) {
      byId.set(c.id, {
        id: c.id,
        area: c.area,
        story: c.story,
        requirement: c.requirement,
        cases: [],
        total: 0,
        passed: 0,
        flaky: 0,
        failed: 0,
        skipped: 0,
        wafBlocked: 0,
        durationMs: 0,
        status: 'passed',
      });
    }

    const story = byId.get(c.id);
    story.cases.push(c);
    story.total += 1;
    story.durationMs += c.durationMs || 0;
    if (c.status === 'passed') story.passed += 1;
    else if (c.status === 'flaky') story.flaky += 1;
    else if (c.status === 'skipped') story.skipped += 1;
    else story.failed += 1;
    if (c.wafBlocked) story.wafBlocked += 1;
    if (statusRank(c.status) > statusRank(story.status)) story.status = c.status;
  }

  return [...byId.values()].sort((a, b) => {
    const area = a.area.localeCompare(b.area);
    if (area) return area;
    return a.story.localeCompare(b.story) || a.requirement.localeCompare(b.requirement);
  });
}

function summarize(data) {
  const cases = collectCases(data.suites);
  const stories = summarizeStories(cases);
  const passCount = cases.filter((c) => c.status === 'passed').length;
  const flakyCount = cases.filter((c) => c.status === 'flaky').length;
  const failCount = cases.filter((c) => !['passed', 'flaky', 'skipped'].includes(c.status)).length;
  const skipCount = cases.filter((c) => c.status === 'skipped').length;
  const wafBlockedCount = cases.filter((c) => c.wafBlocked).length;
  return { cases, stories, stats: data.stats, passCount, flakyCount, failCount, skipCount, wafBlockedCount };
}

const ICON = { passed: '✅', failed: '❌', timedOut: '⏱️', flaky: '⚠️', skipped: '⏭️', interrupted: '❌' };
const fmtMs = (ms) => `${(ms / 1000).toFixed(1)}s`;

module.exports = { loadResults, collectCases, summarizeStories, summarize, ICON, fmtMs };
