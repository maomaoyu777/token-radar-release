# 技术说明：一个生产级 Chrome 扩展长什么样

> 用途：接单/面试时讲给客户听的版本。讲"为什么这么做"，比讲"用了什么技术"值钱。
> 代码在 `content.js`（约 450 行）与 `popup.js`，无构建步骤、无依赖。

---

## 1. 为什么要重做，而不是照抄教程

网上 Chrome 扩展教程几乎都会写成这样：

```js
// 你会在 9 成教程里看到
const data = await fetch(url).then(r => r.json());
card.innerHTML = `<div>${data.name}</div>`;
observer.observe(document.body, { childList: true, subtree: true });
```

这四行在 demo 里能跑，上线就出事。这个项目的价值全在**把它变成能交付的样子**。

---

## 2. 四个真正影响结果的决定

### 2.1 选哪个池子（决定风控结论对不对）

一个代币在 DexScreener 上可能返回 30 个交易对。实测 PEPE：

| 排序 | 池子 | 流动性 |
|---|---|---|
| 1 | Uniswap `0xA43fe…C9f` | **$23.26M** |
| 2 | Uniswap `0x11950…b58` | $2.14M |
| 3 | Aero `0xce262…13F` | $151K |
| … | … | 一路到几千美元 |

`pairs[0]` 这次侥幸是对的，但接口顺序**不保证**按流动性排。一旦拿到 $500K 的浅池子，
风控会算成"中风险"，而用户实际交易的是 $23M 的深池子 —— **结论相反，还看不出来**。

```js
const pairs = (data.pairs || []).filter(p => p && p.liquidity);
pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
const best = pairs[0] || null;
```

> 面试可以这么讲：**这是我唯一改过一次产品行为的地方，其余都是工程卫生。**

### 2.2 能不能被注入（XSS）

代币名是**链上/社区随便起的名字**，可以是 `<img src=x onerror=...>`。
教程写法 `innerHTML = \`...${pair.baseToken.name}...\`` 直接把执行权限交给了别人。

修复不是"过滤一下"，而是**永远不拼 HTML**：

```js
function el(tag, cls, text) {          // 所有文本走 textContent
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
```

链接也做白名单，防止 `javascript:` 伪协议：

```js
link.href = String(pair.url || '').startsWith('https://dexscreener.com')
  ? pair.url
  : 'https://dexscreener.com';
```

测试里有一条专门断言：喂一个带 `<img onerror>` 的代币名，**卡片里不能出现 img 元素，载荷不能执行**。

### 2.3 Solana 地址：漏报与误报同时存在

SOL 地址是 32–44 位 base58，和**交易签名同形**。常见正则 `\b[A-Za-z0-9]{43,44}\b` 的问题：

- 交易哈希会被当成代币高亮（误报）
- 不含 pump 后缀的正常代币永远识别不到（漏报）

两条修法：

```js
// 1) 词边界只认 ASCII 之外，不能用 \b（\b 把 base58 字符也当单词字符）
/(?<![1-9A-HJ-NP-Za-km-z])([1-9A-HJ-NP-Za-km-z]{32,44})(?![1-9A-HJ-NP-Za-km-z])/g

// 2) 先问 DexScreener "这真是 solana 链上的代币吗"，确认后再高亮
verifySolana(addr).then(ok => ok && wrap(addr));
```

代价是 Solana 高亮是**异步**的（先灰着，确认后变蓝），换来的是不误报。

### 2.4 X 是 SPA：监听整棵树会卡死

教程写法：

```js
new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(processNode))).observe(body, {subtree: true});
```

推文信息流每秒都在插入节点，`processNode` 每次都全量递归 → 主线程被打满，一次异常还会把整个 observer 杀掉。

改成**只处理新增节点 + 批量 + 容错**：

```js
const pending = new Set();
observer = new MutationObserver(muts => {
  for (const m of muts) for (const n of m.addedNodes) if (n.isConnected) pending.add(n);
  scheduleFlush();                       // rAF 合并一次
});
function flush() {
  for (const n of pending) {
    try { scan(n); } catch (e) { console.warn(e); }   // 单点异常不中断
  }
}
```

另外两个细节：

- 注入两次（x.com 页面内导航会重注入）→ `window.__w3RadarLoaded` 防重复注册
- 点击高亮**不调用 `stopPropagation`**，否则会吞掉 X 自己的"展开这条推文"

---

## 3. 交付才会被看重的部分

| 维度 | 这个项目怎么做的 |
|---|---|
| 测试 | jsdom + 假 fetch，22 条断言覆盖高亮/选池子/风控/XSS/关闭/SPA 增量/重复注入/i18n |
| 可复盘 | 每条修复都能对应一个失败用例（先写测试再看红） |
| i18n | Chrome 原生 `_locales`，默认 en，zh_CN 自动切换，非扩展环境自动回退 |
| 权限 | `permissions: []`，只留 3 个 host，审核最容易过 |
| 隐私 | 无后端、无埋点、无存储；页面文本只在本地处理 |
| 图标 | 脚本生成（`make_icons.py`），16px 单独简化版 |
| 文档 | README / 提交清单 / 发布 Kit / 部署脚本 全在仓库里 |

---

## 4. 接单时可以怎么说

> "我做了一个 Chrome 扩展，在 X 上自动识别合约地址并弹出行情和风控卡。
> 它不是一个 demo：有 22 条自动化测试、双语、最小权限、隐私政策页面、可一键发布。
> 技术上最难的不是调接口，是**在 SPA 动态页面里做增量 DOM 处理而不卡顿**，
> 以及**接口返回多个交易对时怎么选对那个** —— 这两点大多数教程代码都是错的。"

这段话可以直接放进 Upwork / 电鸭 的 profile。
