#!/usr/bin/env sh
set -u

TEST_EXIT=0
REPORT_EXIT=0
DISCORD_EXIT=0

echo "🐳 Running TrueID Playwright tests in Docker"
echo "🔎 Node: $(node --version)"
echo "🔎 npm: $(npm --version)"
echo "🔎 CI=${CI:-}"
echo "🔎 DISCORD_WEBHOOK_URL set: $(if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then echo yes; else echo no; fi)"
echo "🔎 DISCORD_DEBUG=${DISCORD_DEBUG:-}"
echo "🔎 DISCORD_REQUIRED=${DISCORD_REQUIRED:-0}"

npm test -- --workers=1
TEST_EXIT=$?
echo "🔎 Playwright exit code: ${TEST_EXIT}"

node scripts/generate-report.js
REPORT_EXIT=$?
echo "🔎 HTML report exit code: ${REPORT_EXIT}"

node scripts/send-discord-report.js
DISCORD_EXIT=$?
echo "🔎 Discord report exit code: ${DISCORD_EXIT}"

if [ "${TEST_EXIT}" -ne 0 ]; then
  exit "${TEST_EXIT}"
fi

if [ "${REPORT_EXIT}" -ne 0 ]; then
  exit "${REPORT_EXIT}"
fi

if [ "${DISCORD_REQUIRED:-0}" = "1" ] && [ "${DISCORD_EXIT}" -ne 0 ]; then
  exit "${DISCORD_EXIT}"
fi

exit 0
