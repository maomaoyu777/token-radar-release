/**
 * 监控列表（Pro 版基础）
 *
 * 存储：优先 chrome.storage.local（扩展环境），否则 localStorage（preview / 测试）。
 * 形状：[{ address, chainId, symbol, name, liquidity, addedAt }]
 *
 * 这个文件同时被 content.js（卡片上的「监控」按钮）和 popup（列表 + 开启邮件告警）使用，
 * 所以放在 content_scripts 的 js 数组里、排在 content.js 之前。
 */
(() => {
  'use strict';

  const KEY = 'w3r:watchlist';
  const MAX = 20;

  function extStorage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return chrome.storage.local;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function lsGet() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function lsSet(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch {
      return false;
    }
  }

  async function read() {
    const area = extStorage();
    if (area) {
      try {
        const got = await area.get(KEY);
        const list = got && got[KEY];
        return Array.isArray(list) ? list : [];
      } catch {
        return [];
      }
    }
    return lsGet();
  }

  async function write(list) {
    const area = extStorage();
    if (area) {
      try {
        await area.set({ [KEY]: list });
        return true;
      } catch {
        return false;
      }
    }
    return lsSet(list);
  }

  const norm = (a) => String(a || '').toLowerCase();

  async function list() {
    return read();
  }

  async function has(address) {
    const list = await read();
    return list.some((x) => norm(x.address) === norm(address));
  }

  /** 返回 { ok, reason?, count } */
  async function add(item) {
    if (!item || !item.address) return { ok: false, reason: 'no-address' };
    const list = await read();
    if (list.some((x) => norm(x.address) === norm(item.address))) {
      return { ok: false, reason: 'duplicate', count: list.length };
    }
    if (list.length >= MAX) return { ok: false, reason: 'full', count: list.length };

    list.unshift({
      address: String(item.address),
      chainId: item.chainId ? String(item.chainId) : '',
      symbol: item.symbol ? String(item.symbol) : '',
      name: item.name ? String(item.name) : '',
      liquidity: typeof item.liquidity === 'number' ? item.liquidity : null,
      addedAt: Date.now(),
    });
    const ok = await write(list);
    return { ok, reason: ok ? undefined : 'write-failed', count: list.length };
  }

  async function remove(address) {
    const list = await read();
    const next = list.filter((x) => norm(x.address) !== norm(address));
    const ok = await write(next);
    return { ok, removed: list.length - next.length, count: next.length };
  }

  async function clear() {
    return write([]);
  }

  window.W3RadarWatchlist = { KEY, MAX, list, has, add, remove, clear };
})();
