// Extension self-test: loads content.js in jsdom and verifies highlight / pair picking / risk / XSS protection / false-positive filtering / SPA updates.
// Run: npm i -D jsdom && node test/content.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let JSDOM;
try {
  ({ JSDOM } = require('jsdom'));
} catch {
  if (!process.env.JSDOM_PATH) {
    console.log('SKIP: jsdom not installed (npm i -D jsdom)');
    process.exit(0);
  }
  ({ JSDOM } = require(process.env.JSDOM_PATH));
}

const root = process.env.W3_ROOT || path.resolve(import.meta.dirname, '..');
const src = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const watchSrc = fs.readFileSync(path.join(root, 'watchlist.js'), 'utf8');
const SRC = [watchSrc, src].join('\n;\n'); // 与 manifest 的注入顺序一致

const PEPE = '0x6982508145454ce325ddbe47a25d4ec3d2311933';
const SHALLOW = '0x1111111111111111111111111111111111111111';
const SOL = 'So11111111111111111111111111111111111111112';
const SOL_FAKE = '5HrFn2yPDpBWkGBs3oUJ1bx4QJbAmJkNVEvDdWVAy3qN';

const results = [];
const check = (name, cond, extra = '') => results.push({ name, ok: !!cond, extra });

const mkPair = (o = {}) => ({
  chainId: o.chainId || 'ethereum',
  dexId: 'uniswap',
  baseToken: { name: o.name || 'Pepe', symbol: o.symbol || 'PEPE' },
  priceUsd: '0.0000123',
  priceChange: { h24: 5.2 },
  liquidity: { usd: o.liq ?? 2_000_000 },
  volume: { h24: 1_234_567 },
  txns: { h24: { buys: 100, sells: 90 } },
  fdv: 5_000_000,
  pairCreatedAt: Date.now() - 36e5 * 30,
  url: 'https://dexscreener.com/ethereum/abc',
});

const pairs = {
  [PEPE]: [mkPair({ liq: 500_000 }), mkPair({ liq: 2_300_000 })],
  [SHALLOW]: [mkPair({ chainId: 'bsc', liq: 1000, name: '<img src=x onerror="window.__pwned=1">', symbol: 'BAD' })],
  [SOL]: [mkPair({ chainId: 'solana', liq: 3_000_000, symbol: 'SOLX', name: 'SolX' })],
};

const fetchCalls = [];
const BODY_TEXT = 'CA: 0x6982508145454ce325ddbe47a25d4ec3d2311933 long enough tweet text for highlight';
const html = `<!doctype html><html><body>
  <div id="tweet"><p>${BODY_TEXT}</p></div>
  <div id="sol"><p>Solana CA ${SOL} long enough tweet text content for highlight too</p></div>
  <div id="xss"><p>CA: ${SHALLOW} malicious token name test long enough text here</p></div>
  <div id="fake"><p>tx sig ${SOL_FAKE} this is only a transaction hash not a token text</p></div>
</body></html>`;

const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://x.com/home', pretendToBeVisual: true });
const { window } = dom;
window.fetch = async (url) => {
  fetchCalls.push(url);
  await new Promise((r) => setTimeout(r, 20));
  if (url.includes('dexscreener')) {
    const addr = url.split('/tokens/')[1];
    return { ok: true, status: 200, json: async () => ({ pairs: pairs[addr] ?? [] }) };
  }
  if (url.includes('honeypot.is')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        honeypotResult: { isHoneypot: url.includes('1111111') },
        simulationResult: { buyTax: 1, sellTax: 2 },
      }),
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

const errors = [];
window.addEventListener('error', (e) => errors.push(e.message));

const run = () => {
  const script = window.document.createElement('script');
  script.textContent = SRC;
  window.document.body.appendChild(script);
};
run();
await new Promise((r) => setTimeout(r, 900));

const doc = window.document;
const click = async (node) => {
  node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
};

const tweetSpans = doc.querySelectorAll('#tweet .w3-radar-highlight');
check('EVM address highlighted', tweetSpans.length === 1);
check('Solana address highlighted after DexScreener verification', doc.querySelectorAll('#sol .w3-radar-highlight').length === 1);
check('Highlight shows truncated address', tweetSpans[0] && tweetSpans[0].textContent.length < 16, tweetSpans[0]?.textContent);
check('Highlight has tooltip', !!tweetSpans[0] && tweetSpans[0].title.length > 0, tweetSpans[0]?.title);
check('No script errors', errors.length === 0, errors.join(' | '));
check('Transaction hash is not flagged as a token', doc.querySelectorAll('#fake .w3-radar-highlight').length === 0);
check('Body text preserved after highlight', doc.querySelector('#tweet').textContent.includes('long enough tweet text for highlight'));

await click(tweetSpans[0]);
let card = doc.getElementById('w3-radar-card-root');
check('Click opens the radar card', !!card);
check('Deepest liquidity pair picked ($2.30M)', !!card && card.textContent.includes('$2.30M'), card?.textContent.slice(0, 120));
check('Risk verdict rendered', /excellent|risk|honeypot|normal|\u2705|\ud83d\udea8|\u26a0/i.test(card?.textContent || ''), card?.textContent.slice(0, 160));
check('DexScreener link present', !!card?.querySelector('a[href^="https://dexscreener.com"]'));

await click(card.querySelector('.w3-radar-close'));
check('Close button works', !doc.getElementById('w3-radar-card-root'));

await click(doc.querySelector('#xss .w3-radar-highlight'));
card = doc.getElementById('w3-radar-card-root');
check('HTML in token name is not turned into elements', !!card && !card.querySelector('img'));
check('onerror payload not executed', !window.__pwned);
check('Honeypot verdict shown as risk', !!card && /honeypot|\u8c94|\u8c89|\ud83d\udea8/i.test(card.textContent), card?.textContent.slice(-120));

const host = doc.getElementById('tweet');
for (let i = 0; i < 3; i++) {
  const p = doc.createElement('p');
  p.textContent = `new tweet ${PEPE} ` + 'y'.repeat(40);
  host.appendChild(p);
  await new Promise((r) => setTimeout(r, 80));
}
const nowSpans = doc.querySelectorAll('#tweet .w3-radar-highlight');
check('SPA-added content is highlighted', nowSpans.length === 4, String(nowSpans.length));
check('No nested highlights', [...nowSpans].every((s) => !s.querySelector('.w3-radar-highlight')));
run();
await new Promise((r) => setTimeout(r, 200));
check('Re-injection does not double wrap', doc.querySelectorAll('#tweet .w3-radar-highlight').length === 4);

await click(doc.querySelector('#sol .w3-radar-highlight'));
card = doc.getElementById('w3-radar-card-root');
check('Solana card renders', !!card && card.textContent.includes('SOLX'), card?.textContent.slice(0, 160));
check('Solana never calls honeypot.is', !fetchCalls.some((u) => u.includes('honeypot.is') && u.includes(SOL)));

// 7. i18n: with chrome.i18n present the zh_CN catalog must be used
{
  const zhDom = new JSDOM(
    `<!doctype html><body><div id="t"><p>CA: ${PEPE} long enough tweet text content for highlight</p></div></body>`,
    { runScripts: 'dangerously', url: 'https://x.com/home', pretendToBeVisual: true }
  );
  const zw = zhDom.window;
  const zhMsgs = JSON.parse(fs.readFileSync(path.join(root, '_locales', 'zh_CN', 'messages.json'), 'utf8'));
  zw.chrome = {
    i18n: {
      getMessage(key, subs) {
        const m = zhMsgs[key];
        if (!m) return '';
        let s = m.message;
        if (Array.isArray(subs)) subs.forEach((v, i) => (s = s.replace(`$${i + 1}`, v)));
        return s;
      },
    },
  };
  zw.fetch = async (url) => {
    if (url.includes('dexscreener')) return { ok: true, json: async () => ({ pairs: [mkPair({ liq: 2_300_000 })] }) };
    return { ok: true, json: async () => ({ honeypotResult: { isHoneypot: false }, simulationResult: { buyTax: 0, sellTax: 0 } }) };
  };
  const zs = zw.document.createElement('script');
  zs.textContent = SRC;
  zw.document.body.appendChild(zs);
  await new Promise((r) => setTimeout(r, 600));
  zw.document.querySelector('#t .w3-radar-highlight').dispatchEvent(new zw.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 400));
  const ztext = zw.document.getElementById('w3-radar-card-root')?.textContent || '';
  check('i18n: zh_CN catalog applied', ztext.includes('代币资产'), ztext.slice(0, 80));
  check('i18n: risk verdict localized', ztext.includes('✅ 正常'), ztext.slice(-80));
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${!r.ok && r.extra ? '  -> ' + r.extra : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
