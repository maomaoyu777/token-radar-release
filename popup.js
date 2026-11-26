// popup.js v1.3.0 - 手动输入 CA 快速查询
// 修复：复用 content.js 的选池子逻辑（按流动性取最深池子）、数值格式化、输入校验、textContent 渲染
// i18n：文案来自 _locales，默认 en；静态文案通过 data-i18n 在此填充
(() => {
  'use strict';

  const caInput = document.getElementById('caInput');
  const searchBtn = document.getElementById('searchBtn');
  const resultBox = document.getElementById('resultBox');
  const resultContent = document.getElementById('resultContent');

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

  // 填充静态文案
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    const v = t(key, node.textContent.trim());
    if (v) node.textContent = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    const key = node.dataset.i18nPlaceholder;
    const v = t(key, node.getAttribute('placeholder') || '');
    if (v) node.setAttribute('placeholder', v);
  });

  const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
  const SOL_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  // ---------- 联系 / 支持（改这里即可，不用动别处） ----------
  const FEEDBACK_MAIL = 'cantermattera@gmail.com';
  // 填入 GitHub Sponsors / Ko-fi / 爱发电 等地址后，popup 会自动多出一个「支持开发」按钮；
  // 留空则不显示，避免出现死链。
  const SUPPORT_URL = '';

  function renderFooterLinks() {
    const box = document.getElementById('footerLinks');
    if (!box) return;

    const feedback = document.createElement('a');
    feedback.href = `mailto:${FEEDBACK_MAIL}?subject=${encodeURIComponent('[Token Radar] feedback')}`;
    feedback.textContent = t('popupFeedback', '反馈 / 建议');
    box.appendChild(feedback);

    if (SUPPORT_URL) {
      const support = document.createElement('a');
      support.href = SUPPORT_URL;
      support.target = '_blank';
      support.rel = 'noopener noreferrer';
      support.className = 'support';
      support.textContent = t('popupSupport', '支持开发');
      box.appendChild(support);
    }
  }
  renderFooterLinks();

  // ---------- 监控列表 ----------
  const watchListEl = document.getElementById('watchList');
  const watchCountEl = document.getElementById('watchCount');

  const shortAddr = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');

  async function renderWatchList() {
    const api = window.W3RadarWatchlist;
    if (!api || !watchListEl) return;

    const items = await api.list();
    watchCountEl.textContent = `${items.length}/${api.MAX}`;
    watchListEl.replaceChildren();

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'watch-empty';
      empty.textContent = t('watchEmpty', '还没有监控地址。在 X 上点开任意合约卡片，按「＋ 监控」加入。');
      watchListEl.appendChild(empty);
      return;
    }

    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'watch-item';

      const sym = document.createElement('span');
      sym.className = 'sym';
      sym.textContent = item.symbol || shortAddr(item.address);

      const addr = document.createElement('span');
      addr.className = 'addr';
      addr.textContent = `${shortAddr(item.address)}${item.chainId ? ' · ' + item.chainId : ''}`;
      addr.title = item.address;

      const rm = document.createElement('button');
      rm.className = 'rm';
      rm.type = 'button';
      rm.textContent = '×';
      rm.title = t('watchRemove', '移除');
      rm.addEventListener('click', async () => {
        await api.remove(item.address);
        renderWatchList();
      });

      row.append(sym, addr, rm);
      watchListEl.appendChild(row);
    }
  }

  renderWatchList();

  // ---------- Pro：为监控列表开启邮件告警 ----------
  const proEmail = document.getElementById('proEmail');
  const proEndpoint = document.getElementById('proEndpoint');
  const proEnable = document.getElementById('proEnable');
  const proResult = document.getElementById('proResult');

  function say(text, color) {
    proResult.textContent = text;
    proResult.style.color = color || '#94a3b8';
  }

  proEnable.addEventListener('click', async () => {
    const email = (proEmail.value || '').trim();
    const endpoint = (proEndpoint.value || '').trim().replace(/\/+$/, '');

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      say(t('proBadEmail', '邮箱格式不对'), '#f59e0b');
      return;
    }
    if (!/^https?:\/\//.test(endpoint)) {
      say(t('proBadEndpoint', 'Worker 地址需以 https:// 开头'), '#f59e0b');
      return;
    }

    const api = window.W3RadarWatchlist;
    const items = api ? await api.list() : [];
    if (!items.length) {
      say(t('proEmpty', '监控列表是空的，先在卡片上添加地址'), '#f59e0b');
      return;
    }

    proEnable.disabled = true;
    say(t('proWorking', '正在提交…'));
    try {
      const res = await fetch(`${endpoint}/subscribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, address: items[0].address }),
      });
      if (res.ok || res.status === 409) {
        say(t('proOk', `已为 ${items[0].address} 开启告警（邮件发到 ${email}）`), '#10b981');
      } else {
        const body = await res.text();
        say(t('proFail', `提交失败：${res.status} ${body.slice(0, 80)}`), '#ef4444');
      }
    } catch (err) {
      say(t('proFail', `提交失败：${err.message}`), '#ef4444');
    } finally {
      proEnable.disabled = false;
    }
  });

  const fmtUsd = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'N/A';
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  };

  const fmtPrice = (v) => {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return 'N/A';
    if (n < 0.0001) return `$${n.toExponential(3)}`;
    if (n < 1) return `$${n.toFixed(4)}`;
    return `$${n.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  };

  function row(label, valueText, cls) {
    const r = document.createElement('div');
    r.className = 'row';
    const l = document.createElement('span');
    l.className = 'label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = `val ${cls || ''}`.trim();
    v.textContent = valueText;
    r.append(l, v);
    return r;
  }

  function notice(text, color) {
    const d = document.createElement('div');
    d.style.cssText = `text-align:center;color:${color || '#9ca3af'};padding:6px;`;
    d.textContent = text;
    resultContent.replaceChildren(d);
  }

  searchBtn.onclick = async () => {
    const query = caInput.value.trim();
    if (!query) return;

    resultBox.style.display = 'block';
    if (!EVM_RE.test(query) && !SOL_RE.test(query)) {
      notice(t('popupInvalid', 'Invalid address: EVM needs 0x + 40 hex chars, Solana needs 32–44 base58 chars'), '#f59e0b');
      return;
    }

    searchBtn.textContent = '…';
    searchBtn.disabled = true;
    notice(t('popupLoading', 'Fetching data…'));

    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const pairs = (data.pairs || []).filter((p) => p && p.liquidity);
      // 与 content.js 一致：取流动性最深的池子
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const pair = pairs[0] || null;

      if (!pair) {
        notice(t('popupNoPool', 'No active pool found for this address'));
        return;
      }

      const change = Number(pair.priceChange?.h24 ?? 0);
      const body = document.createDocumentFragment();
      body.appendChild(row(t('popupAssets', 'Token'), `${pair.baseToken?.name || 'Token'} (${pair.baseToken?.symbol || ''})`));
      body.appendChild(row(t('popupNetwork', 'Chain / DEX'), `${pair.chainId || ''} / ${pair.dexId || ''}`.trim()));
      body.appendChild(row(t('popupPrice', 'Price'), `${fmtPrice(pair.priceUsd)} (${change >= 0 ? '+' : ''}${change.toFixed(2)}%)`, change >= 0 ? 'up' : 'down'));
      body.appendChild(row(t('popupLiquidity', 'Liquidity'), fmtUsd(pair.liquidity?.usd)));
      body.appendChild(row(t('popupVolume', '24h volume'), fmtUsd(pair.volume?.h24)));

      const linkWrap = document.createElement('div');
      linkWrap.style.marginTop = '8px';
      const link = document.createElement('a');
      link.href = String(pair.url || '').startsWith('https://dexscreener.com') ? pair.url : 'https://dexscreener.com';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.cssText = 'display:block;text-align:center;color:#38bdf8;text-decoration:none;font-size:11px;';
      link.textContent = t('popupOpenDex', 'Open on DexScreener →');
      linkWrap.appendChild(link);
      body.appendChild(linkWrap);

      resultContent.replaceChildren(body);
    } catch (err) {
      notice(t('popupFail', 'Request failed: $1', [err.message]), '#ef4444');
    } finally {
      searchBtn.textContent = t('popupSearch', 'Check');
      searchBtn.disabled = false;
    }
  };

  caInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchBtn.click();
  });
})();
