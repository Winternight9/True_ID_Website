#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function main() {
  let publicIp = 'unknown';
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    publicIp = (await res.json()).ip || publicIp;
  } catch {}

  const isCircleCi = Boolean(process.env.CIRCLECI);
  const data = {
    publicIp,
    runnerName: process.env.RUNNER_NAME || process.env.CIRCLE_JOB || '',
    runnerOs: process.env.RUNNER_OS || (isCircleCi ? 'linux' : ''),
    runnerArch: process.env.RUNNER_ARCH || process.arch,
    githubRunId: process.env.GITHUB_RUN_ID || '',
    githubRepository: process.env.GITHUB_REPOSITORY || '',
    circleBuildNum: process.env.CIRCLE_BUILD_NUM || '',
    circleWorkflowId: process.env.CIRCLE_WORKFLOW_ID || '',
    circleProjectUsername: process.env.CIRCLE_PROJECT_USERNAME || '',
    circleProjectReponame: process.env.CIRCLE_PROJECT_REPONAME || '',
    capturedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.resolve('test-results'), { recursive: true });
  fs.writeFileSync(
    path.resolve('test-results/runner-network.json'),
    JSON.stringify(data, null, 2)
  );
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
