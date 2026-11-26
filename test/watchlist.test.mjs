// 监控列表（watchlist.js）单元测试：node test/watchlist.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  if (!process.env.JSDOM_PATH) {
    console.log('SKIP: jsdom 未安装');
    process.exit(0);
  }
  ({ JSDOM } = require(process.env.JSDOM_PATH));
}

const root = process.env.W3_ROOT || path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'watchlist.js'), 'utf8');

const results = [];
const check = (name, cond, extra = '') => results.push({ name, ok: !!cond, extra });

function makeWorld() {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://x.com/home' });
  dom.window.eval(src);
  return dom.window;
}

// 1. 基本增删查
{
  const w = makeWorld();
  const W = w.W3RadarWatchlist;
  check('模块暴露到 window', !!W && typeof W.add === 'function');
  check('初始为空', (await W.list()).length === 0);

  const r1 = await W.add({ address: '0xAAA', symbol: 'A', chainId: 'ethereum', liquidity: 1000 });
  check('add 成功并返回 count', r1.ok === true && r1.count === 1, JSON.stringify(r1));

  const r2 = await W.add({ address: '0xaaa' });
  check('大小写不同视为重复', r2.ok === false && r2.reason === 'duplicate');

  check('has 忽略大小写', (await W.has('0xAaA')) === true);

  const r3 = await W.remove('0xaaa');
  check('remove 生效', r3.ok === true && r3.removed === 1 && (await W.list()).length === 0);
}

// 2. 上限 20
{
  const w = makeWorld();
  const W = w.W3RadarWatchlist;
  for (let i = 0; i < 25; i++) await W.add({ address: '0xB' + i });
  const list = await W.list();
  check('上限 20 生效', list.length === 20 && W.MAX === 20, String(list.length));
  const over = await W.add({ address: '0xOVER' });
  check('超限返回 full', over.ok === false && over.reason === 'full');
}

// 3. 非法输入
{
  const w = makeWorld();
  const W = w.W3RadarWatchlist;
  check('空地址被拒', (await W.add({})).ok === false);
  check('空地址 reason=no-address', (await W.add({})).reason === 'no-address');
}

// 4. 持久化：新实例能读到旧数据（同一 localStorage）
{
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://x.com/home' });
  dom.window.eval(src);
  await dom.window.W3RadarWatchlist.add({ address: '0xPERSIST', symbol: 'P' });

  // 同一个 window 重新 eval 一次 = 模拟页面重载后重新注入
  dom.window.eval(src);
  const list = await dom.window.W3RadarWatchlist.list();
  check('重新注入后仍能读到数据', list.some((x) => x.address === '0xPERSIST'), JSON.stringify(list));
}

// 5. 字段裁剪：长名字/未知字段不进存储
{
  const w = makeWorld();
  const W = w.W3RadarWatchlist;
  await W.add({ address: '0xF', symbol: 'SYM', name: 'Name', liquidity: 'not-a-number', evil: '<script>' });
  const item = (await W.list())[0];
  check('liquidity 非数字被置为 null', item.liquidity === null, String(item.liquidity));
  check('未知字段不被写入', !('evil' in item), JSON.stringify(Object.keys(item)));
}

// 6. clear
{
  const w = makeWorld();
  const W = w.W3RadarWatchlist;
  await W.add({ address: '0xC1' });
  await W.clear();
  check('clear 清空', (await W.list()).length === 0);
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.extra ? '  -> ' + r.extra : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
