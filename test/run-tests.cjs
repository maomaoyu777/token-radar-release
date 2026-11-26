// 用法：node test/run-tests.cjs
// 取快照，在受保护子进程里跑测试（乱码的 stdin/stderr 不影响这里），最后恢复快照。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const SUITES = ['content.test.mjs', 'watchlist.test.mjs'];

let failedSuites = 0;
for (const suite of SUITES) {
  const TEST = path.join(root, 'test', suite);
  if (!fs.existsSync(TEST)) continue;
  const snapshot = path.join(os.tmpdir(), `${suite.replace(/\.mjs$/, '')}-${process.pid}.mjs`);
  fs.copyFileSync(TEST, snapshot);
  const r = spawnSync(process.execPath, [snapshot], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  const stdout = r.stdout || '';
  const stderr = (r.stderr || '').split('\n').slice(0, 6).join('\n');
  fs.copyFileSync(snapshot, TEST);
  fs.unlinkSync(snapshot);

  console.log(`\n=== ${suite} ===`);
  console.log(stdout.trim() || '(no stdout)');
  if (r.status !== 0) {
    failedSuites++;
    if (!/passed/.test(stdout)) console.log('stderr head:\n' + stderr);
  }
}
process.exit(failedSuites ? 1 : 0);