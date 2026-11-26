// Web3 Token Radar - Content Script v1.3.0（修复版）
// 相对原版 v1.2.0 的修复：
// 1) 选池子：按流动性取最深的 pair，而不是 pairs[0]（原版会取到极浅池子给出错误风控结论）
// 2) 防注入：卡片里的代币名/符号/地址全部用 textContent 渲染，不再拼 innerHTML
// 3) Solana 识别更严：词边界只认 ASCII，且先用 DexScreener 验证确实是代币，避免把交易哈希误判
// 4) 高亮点击不再 stopPropagation，X 自己的展开/跳转不会被吞掉
// 5) SPA 内容变化只增量处理，单个节点的异常不会中断 MutationObserver
// 6) x.com 是 SPA：重复注入时只注册一次
(() => {
  'use strict';

  if (window.__w3RadarLoaded) return;
  window.__w3RadarLoaded = true;

  // 诊断开关：扩展 ID 页 →“允许访问文件网址”打开 preview.html 即自动加载本脚本
  const DEBUG = /^(file:|https:\/\/dexscreener\.com|https:\/\/x\.com\/i\/status)/.test(location.href);
  window.__w3RadarDebug = { version: '1.3.0-debug', hits: 0, scans: 0, errors: [] };

  const EVM_REGEX = /0x[a-fA-F0-9]{40}/g;
  const SOL_REGEX = /(?<![1-9A-HJ-NP-Za-km-z])([1-9A-HJ-NP-Za-km-z]{32,44})(?![1-9A-HJ-NP-Za-km-z])/g;

  const CHAIN_MAP = { ethereum: 1, eth: 1, bsc: 56, 'bsc-mainnet': 56, base: 8453, arbitrum: 42161, polygon: 137, optimism: 10 };
  const CARD_ID = 'w3-radar-card-root';
  const HIGHLIGHT_CLASS = 'w3-radar-highlight';
  const CARD_WIDTH = 340;

  let currentCard = null;
  let cardAnchor = null;
  let closedAnchor = null;
  const verifiedSol = new Set();
  const pendingSol = new Map();
  const dexsCache = new Map(); // address -> { at, pair }

  // ---------- 工具 ----------
  // i18n：扩展环境用 chrome.i18n（默认 en，zh_CN 随系统语言自动切）；无扩展环境（测试/预览）回退英文
  function t(key, fallback, subs) {
    try {
      if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
        const v = chrome.i18n.getMessage(key, subs);
        if (v) return v;
      }
    } catch {
      /* ignore */
    }
    if (!fallback) return key;
    return Array.isArray(subs) ? subs.reduce((s, v, i) => s.replace(`$${i + 1}`, v), fallback) : fallback;
  }

  const truncate = (addr) => (addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr);

  function formatUsd(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'N/A';
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  }

  function formatPrice(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 'N/A';
    if (n < 0.0001) return `$${n.toExponential(3)}`;
    if (n < 1) return `$${n.toFixed(4)}`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  }

  function formatAge(ms) {
    if (!ms) return 'N/A';
    const h = (Date.now() - ms) / 36e5;
    if (h < 1) return t('unitMinute', '$1 min', [String(Math.max(1, Math.round(h * 60)))]);
    if (h < 48) return t('unitHour', '$1 h', [h.toFixed(1)]);
    return t('unitDay', '$1 d', [(h / 24).toFixed(1)]);
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- 数据层 ----------
  async function fetchTokenData(address) {
    const hit = dexsCache.get(address);
    if (hit && Date.now() - hit.at < 30_000) return hit.pair;
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);
      if (!res.ok) throw new Error(`DexScreener HTTP ${res.status}`);
      const data = await res.json();
      const pairs = (data.pairs || []).filter((p) => p && p.liquidity);
      // 关键修复：按流动性排序，取最深的池子
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const best = pairs[0] || null;
      dexsCache.set(address, { at: Date.now(), pair: best });
      return best;
    } catch (err) {
      console.warn('[TokenRadar] DexScreener 查询失败:', err.message);
      return null;
    }
  }

  async function checkHoneypot(address, chainId) {
    const chain = CHAIN_MAP[String(chainId || '').toLowerCase()];
    if (!chain || !address.startsWith('0x')) return null;
    try {
      const res = await fetch(`https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${chain}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function evaluateRisk(pair, hpData) {
    const liquidity = pair?.liquidity?.usd ?? 0;
    const txns24h = (pair?.txns?.h24?.buys ?? 0) + (pair?.txns?.h24?.sells ?? 0);

    if (hpData?.honeypotResult?.isHoneypot) {
      return {
        ok: false,
        level: t('riskHoneypot', '🚨 Honeypot (cannot sell)'),
        desc: t('riskHoneypotDesc', 'Contract blocks selling or contains blacklist logic'),
      };
    }
    const buyTax = hpData?.simulationResult?.buyTax;
    const sellTax = hpData?.simulationResult?.sellTax;
    if (typeof sellTax === 'number' && sellTax > 15) {
      return {
        ok: false,
        level: t('riskHighTax', '⚠️ High tax (sell $1%)', [String(sellTax)]),
        desc: t('riskHighTaxDesc', 'This token has an extremely high sell tax'),
      };
    }
    if (liquidity < 5000) {
      return {
        ok: false,
        level: t('riskShallow', '⚠️ High risk (thin pool)'),
        desc: t('riskShallowDesc', 'Pool below $5,000 — easy to dump on'),
      };
    }
    if (liquidity < 30000 || txns24h < 50) {
      return {
        ok: false,
        level: t('riskMedium', '⚡ Medium risk (watch slippage)'),
        desc: t('riskMediumDesc', 'Low liquidity or low trading activity'),
      };
    }
    const hasTax = typeof buyTax === 'number' && typeof sellTax === 'number';
    return {
      ok: true,
      level: hasTax
        ? t('riskNormalTax', '✅ Normal (buy $1% / sell $2%)', [String(buyTax), String(sellTax)])
        : t('riskNormal', '✅ Normal'),
      desc: t('riskNormalDesc', 'Healthy pool depth, no obvious sell blocking'),
    };
  }

  // Solana 没有 honeypot 模拟接口，先用 DexScreener 确认真是代币再高亮
  function verifySolana(address) {
    if (verifiedSol.has(address)) return Promise.resolve(true);
    if (pendingSol.has(address)) return pendingSol.get(address);
    const p = fetchTokenData(address)
      .then((pair) => {
        const ok = !!pair && String(pair.chainId || '').toLowerCase().includes('solana');
        if (ok) verifiedSol.add(address);
        return ok;
      })
      .finally(() => pendingSol.delete(address));
    pendingSol.set(address, p);
    return p;
  }

  // ---------- 卡片 ----------
  function removeCurrentCard() {
    if (currentCard) {
      currentCard.remove();
      currentCard = null;
    }
    cardAnchor = null;
  }

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target;
      if (!currentCard) return;
      if (target instanceof Node && currentCard.contains(target)) return;
      if (target instanceof Element && target.closest(`.${HIGHLIGHT_CLASS}`)) return;
      removeCurrentCard();
    },
    true
  );

  function buildRow(label, valueNode) {
    const row = el('div', 'w3-radar-row');
    row.appendChild(el('span', 'w3-radar-label', label));
    const val = el('span', 'w3-radar-val');
    if (valueNode instanceof Node) val.appendChild(valueNode);
    else val.textContent = String(valueNode);
    row.appendChild(val);
    return row;
  }

  function placeCard(card, anchor) {
    const rect = anchor.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left - 24), Math.max(8, window.innerWidth - CARD_WIDTH - 16));
    let top = rect.bottom + 8;
    if (top + 280 > window.innerHeight) top = Math.max(8, rect.top - 8 - 280);
    card.style.left = `${window.scrollX + left}px`;
    card.style.top = `${window.scrollY + top}px`;
  }

  function renderLoading(card, anchor, address) {
    placeCard(card, anchor);
    const body = card.querySelector('.w3-radar-body');
    body.replaceChildren(el('div', 'w3-radar-loading', t('loading', 'Fetching on-chain pool and safety check…')));
  }

  function renderPair(card, pair, address) {
    return checkHoneypot(address, pair.chainId).then((hpData) => {
      if (currentCard !== card) return;
      const risk = evaluateRisk(pair, hpData);
      const body = card.querySelector('.w3-radar-body');
      body.replaceChildren();

      const name = el('span');
      name.textContent = `${pair.baseToken?.name || 'Token'} (${pair.baseToken?.symbol || ''})`;
      body.appendChild(buildRow(t('labelToken', 'Token'), name));

      const chain = el('span');
      chain.style.textTransform = 'capitalize';
      chain.textContent = `${pair.chainId || t('chainFallback', 'chain')} / ${pair.dexId || 'DEX'}`;
      body.appendChild(buildRow(t('labelChain', 'Chain / DEX'), chain));

      const change = Number(pair.priceChange?.h24 ?? 0);
      const price = el('span', change >= 0 ? 'w3-radar-up' : 'w3-radar-down');
      price.textContent = `${formatPrice(pair.priceUsd)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`;
      body.appendChild(buildRow(t('labelPrice', 'Price'), price));

      body.appendChild(buildRow(t('labelLiquidity', 'Liquidity'), formatUsd(pair.liquidity?.usd)));
      if (pair.fdv) body.appendChild(buildRow(t('labelFdv', 'FDV'), formatUsd(pair.fdv)));
      body.appendChild(buildRow(t('labelVolume', '24h volume'), formatUsd(pair.volume?.h24)));
      body.appendChild(buildRow(t('labelAge', 'Pool age'), formatAge(pair.pairCreatedAt)));

      const riskSpan = el('span', null, risk.level);
      riskSpan.style.color = risk.ok ? '#10b981' : '#ef4444';
      riskSpan.style.fontWeight = '600';
      riskSpan.title = risk.desc;
      body.appendChild(buildRow(t('labelRisk', 'Risk check'), riskSpan));

      const footer = el('div', 'w3-radar-footer');
      const link = el('a', 'w3-radar-btn', t('linkDex', 'Open DexScreener'));
      link.href = String(pair.url || '').startsWith('https://dexscreener.com') ? pair.url : 'https://dexscreener.com';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      footer.appendChild(link);

      // 监控按钮：把地址加进本地监控列表（Pro 版入口）
      const watchApi = window.W3RadarWatchlist;
      if (watchApi) {
        const watchBtn = el('button', 'w3-radar-btn w3-radar-watch', t('watchAdd', '＋ 监控'));
        watchBtn.type = 'button';
        watchBtn.style.marginLeft = '8px';
        watchBtn.style.background = '#374151';
        footer.appendChild(watchBtn);

        const markWatched = () => {
          watchBtn.textContent = t('watchAdded', '✓ 已监控');
          watchBtn.disabled = true;
          watchBtn.style.opacity = '0.7';
        };

        watchApi
          .has(address)
          .then((yes) => {
            if (yes) markWatched();
          })
          .catch(() => {});

        watchBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          watchBtn.disabled = true;
          try {
            const res = await watchApi.add({
              address,
              chainId: pair.chainId,
              symbol: pair.baseToken?.symbol,
              name: pair.baseToken?.name,
              liquidity: pair.liquidity?.usd,
            });
            if (res.ok) {
              markWatched();
            } else if (res.reason === 'duplicate') {
              markWatched();
            } else if (res.reason === 'full') {
              watchBtn.textContent = t('watchFull', '最多 20 个');
              watchBtn.disabled = false;
              setTimeout(() => (watchBtn.textContent = t('watchAdd', '＋ 监控')), 2000);
            } else {
              watchBtn.textContent = t('watchFail', '保存失败');
              watchBtn.disabled = false;
            }
          } catch {
            watchBtn.disabled = false;
          }
        });
      }

      body.appendChild(footer);
    });
  }

  function showRadarCard(anchor, address) {
    if (cardAnchor === anchor && currentCard) {
      removeCurrentCard();
      return;
    }
    removeCurrentCard();
    closedAnchor = null;

    const card = el('div', 'w3-radar-card');
    card.id = CARD_ID;

    const header = el('div', 'w3-radar-header');
    header.appendChild(el('span', 'w3-radar-title', t('cardTitle', '⚡ Token Radar')));
    const close = el('button', 'w3-radar-close', '×');
    close.type = 'button';
    close.title = t('tipClose', 'Close');
    close.setAttribute('aria-label', t('tipClose', 'Close'));
    header.appendChild(close);
    card.appendChild(header);

    const body = el('div', 'w3-radar-body');
    body.appendChild(el('div', 'w3-radar-loading', t('loading', 'Fetching on-chain pool and safety check…')));
    card.appendChild(body);

    document.body.appendChild(card);
    currentCard = card;
    cardAnchor = anchor;
    renderLoading(card, anchor, address);

    close.addEventListener('click', (e) => {
      e.stopPropagation();
      closedAnchor = anchor;
      removeCurrentCard();
    });

    fetchTokenData(address)
      .then((pair) => {
        if (currentCard !== card) return undefined;
        if (!pair) {
          body.replaceChildren(
            el('div', 'w3-radar-empty', t('noPool', 'No active DEX pool found')),
            el('div', 'w3-radar-empty-sub', address)
          );
          return undefined;
        }
        return renderPair(card, pair, address);
      })
      .catch((err) => {
        if (currentCard !== card) return;
        body.replaceChildren(el('div', 'w3-radar-empty', t('loadError', 'Failed to load, please try again')));
        console.warn('[TokenRadar] 卡片渲染失败:', err.message);
      });
  }

  // ---------- 文本识别与高亮 ----------
  function collectMatches(text) {
    const matches = [];
    for (const m of text.matchAll(EVM_REGEX)) matches.push({ addr: m[0], index: m.index, kind: 'evm' });
    for (const m of text.matchAll(SOL_REGEX)) matches.push({ addr: m[0], index: m.index, kind: 'sol' });
    matches.sort((a, b) => a.index - b.index);
    const out = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.index < cursor) continue;
      out.push(m);
      cursor = m.index + m.addr.length;
    }
    return out;
  }

  function makeSpan(addr, kind) {
    const span = el('span', HIGHLIGHT_CLASS);
    span.textContent = truncate(addr);
    span.title = kind === 'evm'
      ? t('tipEvm', '[EVM] Click to view token radar and honeypot risk')
      : t('tipSol', '[Solana] Click to view token radar and safety data');
    span.dataset.w3radar = addr;
    span.dataset.w3radarkind = kind;
    return span;
  }

  // 把 textNode 从相对偏移 rel 处的那段地址替换成高亮 span；返回后文节点（可能为空）
  function wrapAt(textNode, rel, addr, kind) {
    const text = textNode.nodeValue || '';
    if (text.slice(rel, rel + addr.length) !== addr) return null;
    const parent = textNode.parentNode;
    if (!parent) return null;

    const span = makeSpan(addr, kind);
    const frag = document.createDocumentFragment();
    if (rel > 0) frag.appendChild(document.createTextNode(text.slice(0, rel)));
    frag.appendChild(span);
    const afterText = text.slice(rel + addr.length);
    const afterNode = afterText ? document.createTextNode(afterText) : null;
    if (afterNode) frag.appendChild(afterNode);
    parent.replaceChild(frag, textNode);
    return afterNode;
  }

  function processTextNode(textNode) {
    const raw = textNode.nodeValue;
    if (!raw || raw.trim().length < 24) return;
    const parentEl = textNode.parentElement;
    if (!parentEl) return;
    if (parentEl.closest(`.${HIGHLIGHT_CLASS}`) || parentEl.closest(`#${CARD_ID}`)) return;

    const matches = collectMatches(raw);
    if (DEBUG && matches.length) console.log('[W3Radar] 命中候选地址', matches.map((m) => `${m.kind}:${m.addr}`));
    if (!matches.length) return;

    let node = textNode;
    let offset = 0;
    for (const m of matches) {
      if (!node) return;
      const rel = m.index - offset;
      if (rel < 0 || !node.isConnected) continue;

      if (m.kind === 'sol') {
        // 未确认的 Solana 地址先不高亮，确认后回填（同一位置可能已被 EVM 高亮占用，回填时会自动跳过）
        const nodeRef = node;
        const relRef = rel;
        const addrRef = m.addr;
        offset = m.index + m.addr.length;
        verifySolana(addrRef).then((ok) => {
          if (!ok || !nodeRef.isConnected) return;
          const cur = nodeRef.nodeValue || '';
          if (cur.slice(relRef, relRef + addrRef.length) !== addrRef) return;
          const after = wrapAt(nodeRef, relRef, addrRef, 'sol');
          if (after) pending.add(after), scheduleFlush();
        });
        continue;
      }

      const after = wrapAt(node, rel, m.addr, 'evm');
      if (!after) return;
      node = after;
      offset = m.index + m.addr.length;
    }
  }

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'OPTION', 'A']);

  function scan(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      processTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
    if (root instanceof Element) {
      if (SKIP_TAGS.has(root.tagName)) return;
      if (root.id === CARD_ID) return;
      if (root.classList.contains(HIGHLIGHT_CLASS)) return;
      // 扩展自身的侧边栏（chatgpt / claude 等）里的地址不识别
      if (root.closest('.w3-radar-ignore, #w3-radar-test-input, [class*="token-radar-test"]')) return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const v = node.nodeValue;
        if (!v || v.trim().length < 24) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest(`.${HIGHLIGHT_CLASS},#${CARD_ID}`)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    for (const t of texts) processTextNode(t);
  }

  // ---------- 点击 ----------
  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : e.target?.parentElement;
    const span = target?.closest?.(`.${HIGHLIGHT_CLASS}`);
    if (!span) return;
    // 不阻止冒泡，X 自身的点击行为照常生效
    if (closedAnchor === span) {
      closedAnchor = null;
      return;
    }
    showRadarCard(span, span.dataset.w3radar);
  });

  // ---------- 观察 SPA 变化 ----------
  const pending = new Set();
  let scheduled = false;

  function scheduleFlush() {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      const batch = Array.from(pending);
      pending.clear();
      for (const node of batch) {
        try {
          scan(node);
        } catch (err) {
          console.warn('[TokenRadar] 扫描异常已忽略:', err.message);
        }
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const added of mutation.addedNodes) {
        if (!added.isConnected) continue;
        pending.add(added);
        if (pending.size > 200) break;
      }
    }
    if (pending.size) scheduleFlush();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scan(document.body);
})();
