# Web3 Token Radar v1.3.0（修复版）

> 这份代码是在 Antigravity 产出的 v1.2.0 基础上**重写的修复版**：原版在真实 Chrome 里能跑，但存在几处会直接导致“数据错、风险提示错”的缺陷（见文末“修复对照表”）。

## 一、怎么装（30 秒）

1. 打开 Chrome / Edge，地址栏输入 `chrome://extensions/`（Edge 是 `edge://extensions/`）
2. 右上角打开 **开发者模式**
3. 点 **加载已解压的扩展程序**，选择本文件夹（`token-radar-fixed`）
4. 打开 `x.com`，推文里出现 `0x6982…1933` 这种蓝色高亮，点一下弹出数据卡

> 想先看卡片长什么样：直接双击 `preview.html`，用浏览器打开即可（用的是同一份 `styles.css`）。

## 二、实测数据来源

| 能力 | 接口 | 实测 |
|---|---|---|
| 价格 / 流动性 / 量 | `api.dexscreener.com/latest/dex/tokens/{ca}` | 200，`access-control-allow-origin: *`，PEPE 返回 30 个池子 |
| 貔貅盘 / 买卖税 | `api.honeypot.is/v2/IsHoneypot` | 200，CORS 通，返回 `honeypotResult` / `simulationResult` |

注意：DexScreener 免费接口有频率上限（约 300 次/分钟），**不要用脚本批量点**。

## 三、修复对照表

| # | 原版 v1.2.0 的问题 | 后果 | v1.3.0 修法 |
|---|---|---|---|
| 1 | `pairs[0]` 直接取第一条池子 | 同一代币有 30 个池子时，常取到极浅的池子 → **风控结论是错的**（实测取到 $500K 而实际最深 $2.3M） | 按 `liquidity.usd` 排序取最深池子 |
| 2 | 代币名直接 `innerHTML` 拼接 | 代币名可含 HTML → **页面脚本注入（XSS）**，实测 `<img onerror>` 被创建成元素 | 全部 `textContent` 渲染，链接只允许 `dexscreener.com` |
| 3 | Solana 正则带 `\b` 且不验证 | 交易哈希/签名被当代币高亮；无 `pump` 后缀的 Solana 地址永远识别不到 | 词边界只认 ASCII + 先经 DexScreener 确认链是 solana 再高亮 |
| 4 | 高亮点击 `stopPropagation` | 吞掉 X 自己的展开/跳转点击 | 只弹卡片，不阻止冒泡 |
| 5 | 每加一个节点遍历整棵子树 | 长推文流卡顿，且一次异常会杀死整个监听器 | 只增量处理新增节点，`try/catch` 隔离，重复注入只注册一次 |
| 6 | popup 与卡片两套逻辑 | 两处数据口径不一致（弹窗里也没做选池子） | popup 复用同一套选池子/格式化规则，并加地址格式校验 |

## 四、自测

```powershell
npm i -D jsdom
node test/run-tests.cjs
```

`content.test.mjs` 共 20 条断言：高亮（EVM/Solana/误报）、选最深池子、风控结论、XSS 防护、关闭按钮、SPA 增量更新、重复注入、Solana 不走 honeypot。当前 **20/20 通过**。

> 说明：本机 npm 装 `jsdom` 时走了临时代理，若你本地装不上，可用 `JSDOM_PATH` 指向任意已安装的 `jsdom` 目录。

## 五、真机实测记录（Chrome，2026-11-27 03:18）

已通过 `chrome://extensions/` 加载本目录，实测：

| 项目 | 结果 |
|---|---|
| 扩展加载 | ✅ 无报错 |
| 新建推文自动高亮 | ✅ 页面新插入的推文被识别并高亮为 `0x6982…1933` |
| 交易哈希误报 | ✅ 58 位 base58 交易哈希**没有**被蓝框 |
| 点击弹卡 | ✅ 卡片弹出、数据完整、可关闭 |
| 数据正确性 | ✅ Pepe (PEPE) · Ethereum/Uniswap · $3.525e-6 (+1.93%) · 池子 $23.26M · FDV $1.46B · 24h $1.14M · 池龄 1322 天 · 风控"正常"；与 DexScreener 当前返回一致（最深池子 `0xA43fe…C9f` = $23.26M） |
| 风控 | ✅ "正常（税 买0%/卖0%）"来自 honeypot.is 的实时模拟结果 |

**已知局限**：
- 扩展的 host 权限只覆盖 `x.com` / `twitter.com` 和两个 API，**不匹配 `file://`**，本地 `preview.html` 里扩展不会自动注入（页面自身加载脚本，效果一致）。
- x.com 搜索页会把含合约地址的推文折叠在图片卡片里看到，加上验证时 Chrome 窗口一直抢不到前台焦点，"在真实信息流里点高亮"这一步没有截图确认，已由本地测试页 + jsdom 覆盖。

## 六、图标与上架材料（v1.3.0 已补齐）

### 图标

原来 80~307 字节的占位图已替换为正式图标：深色圆角底 + 青蓝雷达同心环 + 扫描扇形 + 绿色命中光点。

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `icons/icon16.png` | 16×16 | 工具栏 |
| `icons/icon32.png` | 32×32 | Windows 高分屏、设备管理 |
| `icons/icon48.png` | 48×48 | 扩展管理页 |
| `icons/icon128.png` | 128×128 | 商店列表 |
| `icons/icon512.png` | 512×512 | 商店/宣传备用（不放 manifest） |

重新生成：`python make_icons.py`（需要 Pillow；16/32px 走“粗线简化版”，其余用完整版，避免小尺寸糊成一团）。
实测：Chrome 工具栏 16px 下雷达轮廓与命中点清晰可辨，扩展管理页显示无异常。

### 上架材料

- [`STORE_SUBMISSION.md`](STORE_SUBMISSION.md)：名称/描述/分类、**逐条权限用途声明**、单一用途声明、远程代码声明、隐私标签勾选表、素材清单与自检表
- [`MARKETING.md`](MARKETING.md)：X 推文串、Product Hunt/Reddit 标题、Reddit 草稿、商店英文长描述

### 商店素材（已生成）

素材在 `dist/store-assets/`，**不放进扩展 zip**（商店要 zip 里只有扩展文件）。

| 文件 | 规格 | 内容 |
|---|---|---|
| `store-1-inline.png` / `-en` | 1280×800 | 时间线内识别 + 数据卡展开（PEPE，池子 $23.26M） |
| `store-2-lookup.png` / `-en` | 1280×800 | 手动查询面板 + 卖点 |
| `store-3-risk-verdict.png` / `-en` | 1280×800 | 貔貅 / 高税 / 正常 三种结论 + 判定优先级 |
| `promo-440x280.png` / `-en` | 440×280 | 小型推广图 |

每组都有中英两版（`-en` 后缀），提交商店时选英文那套。

生成方式：改 `screenshots/store-*.html` 里的文案或配色，然后

```powershell
powershell -ExecutionPolicy Bypass -File screenshots/capture.ps1
```

脚本用 headless Chrome 按 2 倍渲染再缩回目标尺寸（文字边缘比直接截 1x 干净），
尺寸会强制校验成 1280×800 / 440×280；`?lang=en` 由 `screenshots/i18n-en.js` 做页面级文案替换。

### 多语言（i18n）

扩展已接入 Chrome 原生 i18n，**默认英文**，系统语言是简体中文时自动切中文：

```
_locales/en/messages.json       ← 默认（商店主语言）
_locales/zh_CN/messages.json
manifest.json → "default_locale": "en", "name": "__MSG_extName__"
```

- 卡片所有行标签、四种风控结论、加载/空态/错误文案、高亮 tooltip、popup 全部走 `chrome.i18n`
- 非扩展环境（jsdom 测试、`preview.html`）自动回退英文，不会报错
- 测试里加了两条断言：把 `zh_CN` 词条喂给 stub 的 `chrome.i18n`，确认卡片真的切成中文（22/22 通过）

加新语言：复制 `_locales/en` 改名（如 `ja`），翻译 `messages.json` 即可，无需改代码。

### 官网 / 隐私政策站点（可直接部署）

`store-site/` 是一套**纯静态、零构建**的站点，用来满足商店的「隐私政策 URL」要求，顺带当落地页：

| 文件 | 内容 |
|---|---|
| `store-site/index.html` | 落地页：卖点、三张卡、安装四步、CTA |
| `store-site/privacy.html` | **隐私政策**（中英双语，表格化，商店直接引用这个 URL） |
| `store-site/style.css` | 深色主题，响应式（≤880px 自动单栏） |
| `store-site/img/` | 图标 + 商店截图（英文版） |
| `store-site/.nojekyll` | 关掉 GitHub Pages 的 Jekyll 处理 |

- 右上角 `中文 / English` 切换，默认跟随浏览器语言；也支持 `privacy.html?lang=en` 强制语言
- 一条命令发布：`powershell -File .\deploy-to-github.ps1 -User <你的GitHub用户名>`（先看 `-DryRun`）
- 部署步骤与排查表：[`GITHUB-PAGES.md`](GITHUB-PAGES.md)
- 本地预览：`cd store-site; npx serve` 后打开 `http://localhost:3000/privacy.html`
- 联系邮箱已填好：`cantermattera@gmail.com`（`privacy.html` + `PRIVACY.md`），换邮箱时全局搜一次

### 商店提交用文档

- [`STORE_SUBMISSION.md`](STORE_SUBMISSION.md)：名称/描述/分类、**逐条权限用途声明**、单一用途声明、远程代码声明、隐私标签勾选表、素材清单与自检表
- [`MARKETING.md`](MARKETING.md)：X 推文串、Product Hunt/Reddit 标题、Reddit 草稿、商店英文长描述
- [`PRIVACY.md`](PRIVACY.md)：隐私政策 Markdown 源文件（`store-site/privacy.html` 是它的网页版）
- [`GITHUB-PAGES.md`](GITHUB-PAGES.md)：把站点发到公网的三种方式 + 排查表

> 权限已从 v1.1 的 `activeTab` + `storage` 收紧为 `permissions: []`——本扩展实际只用到 host 权限，少两项可少一轮人工审核。

## 七、还没做的（需要你决定）

- **发布隐私政策**：`store-site/` 已做好，按 [`GITHUB-PAGES.md`](GITHUB-PAGES.md) 推到 GitHub Pages 即可拿到 URL（记得先改邮箱）
- **真机验收（部分完成）**：已在 Chrome 里加载并验证高亮/弹卡/数据（见第五节）；剩余"在真实 x.com 信息流里点击"一步，受窗口焦点限制没截到图。
- **arbitrage_engine.py / safe_executor.py**：属于"执行真实资金"的模块，我没有接手做任何实盘相关改动。

## 八、商业化与发布（新增）

| 文档 | 用途 |
|---|---|
| [`LAUNCH-KIT.md`](LAUNCH-KIT.md) | X 首发串、Reddit、Show HN、Product Hunt、即刻/V2EX 全文，可直接复制；含一周发布节奏 |
| [`SUBMISSION-CHECKLIST.md`](SUBMISSION-CHECKLIST.md) | 商店逐字段填写值 + 隐私标签勾选 + 驳回理由对照表 |
| [`TECH-NOTES.md`](TECH-NOTES.md) | 技术说明（接单/面试用）：四个关键工程决策与可交付证据 |
| [`REVENUE-PLAN.md`](REVENUE-PLAN.md) | 变现方式与**现实收益区间**、48 小时可落地三条路线、负债结论 |

扩展内已加「反馈 / 建议」入口（`mailto:cantermattera@gmail.com`），
`popup.js` 里预留 `SUPPORT_URL`，填入 Sponsors / Ko-fi 地址后 popup 自动多出「支持开发」按钮（留空则不显示，避免死链）。

## 九、其他变现资产（新增）

| 文件 / 目录 | 用途 |
|---|---|
| [`GUMROAD-LISTING.md`](GUMROAD-LISTING.md) | 源码包商品页文案（$29 单档）、FAQ、上架步骤 |
| [`POST-THIS.txt`](POST-THIS.txt) | X 首发串纯文本，可直接粘贴（含 6 条推文 + 发布说明） |
| `pro-worker/` | **Pro 版原型**：Cloudflare Worker，自选地址监控 + 条件邮件告警（14 单测 + 9 e2e） |
| `dist/token-radar-source-kit-v1.3.0.zip` | 可售卖的源码包（756 KB / 48 文件，含三套测试） |

Pro 版告警规则：貔貅由否转是、卖出税跳过 15%、卖出税单次涨 ≥10 点、流动性腰斩、撤池、池子 < $5K。
同一订阅 30 分钟最多一封邮件；阈值可按订阅覆盖；成本在 500 订阅以内接近 0。

## 十、Pro 版 UI 与收款（新增）

**扩展内已实现**（`storage` 仅存本地监控列表，≤20 个地址）：

| 位置 | 功能 |
|---|---|
| 卡片底部 | 「＋ 监控」按钮 → `✓ 已监控`，把地址（含链、代号、当时流动性）存进本地监控列表 |
| popup | 「我的监控 n/20」列表，可单个移除 |
| popup | 「邮件告警（Pro）」：填邮箱 + 你自己的 Worker 地址 → 一键为监控地址开通告警 |

测试：`content.test.mjs` 22 条 + `watchlist.test.mjs` 14 条 + Pro `alerts` 14 条 + `e2e` 9 条，
全部通过（扩展包与源码包各自从 zip 解压复测过）。

**收款**：见 [`STRIPE-GUIDE.md`](STRIPE-GUIDE.md)（Gumroad 当天可开、Stripe Payment Link + 手动开通、¥59 验证定价）。

**商品封面**：`dist/store-assets/gumroad-cover-1280x720.png`（由 `screenshots/gumroad-cover.html` 渲染）。