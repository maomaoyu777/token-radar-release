# Privacy Policy — Web3 Token Radar

**Last updated: 2026-11-27 · Version 1.3.0**

Web3 Token Radar ("the extension") is a Chrome extension that highlights crypto token contract
addresses in posts on X (Twitter) and shows publicly available market and contract-risk data for
the address you click.

## Short version

The extension has **no account system, no analytics, no telemetry and no server of our own**.
It does not collect, store, sell or share personal data. The only network requests it makes are
read-only calls to two public APIs, and they carry nothing but the token address you chose to look up.

## What the extension does with data

| Data | Where it goes | Why |
|---|---|---|
| Text of the X page you are viewing | **Stays in your browser** | Read locally to find `0x…` and Solana addresses so they can be highlighted. It is never transmitted or stored. |
| Token address you click or type | Sent to `api.dexscreener.com` and `api.honeypot.is` | To return price, liquidity, volume and contract-risk data. |
| Your IP address | Implicitly visible to those two APIs, as with any web request | Standard HTTP behaviour, outside our control. |
| Card data (price etc.) | Kept in memory for 30 seconds | To avoid duplicate requests when you re-open the same card. Cleared when the tab closes. |

The extension uses `chrome.storage.local` for **one thing only**: the watchlist you build yourself
(≤20 addresses you explicitly clicked "Watch" on). Nothing else is written, and it is never synced
or uploaded. It does not read other tabs, your history, your bookmarks or your clipboard. It cannot
see or touch your wallet — it never asks for a wallet connection and contains no blockchain-writing
code.

## Third-party services

Two public, read-only APIs are contacted. Their own privacy policies apply to those requests:

- **DexScreener** — <https://dexscreener.com> (market data)
- **Honeypot.is** — <https://honeypot.is> (contract simulation for EVM chains)

No data is sent to the extension's developer. There is no backend server.

## Permissions, and why each one exists

| Permission | Reason |
|---|---|
| `content_scripts` on `https://x.com/*` and `https://twitter.com/*` | To read post text on X in order to detect contract addresses. |
| Host access to `https://api.dexscreener.com/*` | To fetch public DEX pair data for the address you clicked. |
| Host access to `https://api.honeypot.is/*` | To run a public contract simulation (buy/sell tax, honeypot status). |
| `storage` | To save the watchlist you build by clicking "Watch" on a card (≤20 addresses). Local only — never synced or uploaded, deleted on uninstall. |

The extension requests **no** other Chrome permissions (no `tabs`, `cookies`, `history`,
`<all_urls>` or `activeTab`).

## Remote code

All JavaScript ships inside the extension package. The extension does **not** load, evaluate or
inject remote code, and does not use `eval` or `new Function`.

## Children

The extension is not directed at children and collects no data from anyone.

## Data deletion

Because no personal data is collected or stored by the developer, there is nothing to delete. To
remove all local traces, uninstall the extension; its in-memory cache disappears with the tab.

## Changes

Material changes to this policy will be published at this URL together with a new version number
in the extension's manifest.

## Contact

Questions about this policy: **[cantermattera@gmail.com](mailto:cantermattera@gmail.com)**

---

# 隐私政策（中文）

**最后更新：2026-11-27 · 版本 1.3.0**

Web3 Token Radar（下称"本扩展"）是一个 Chrome 扩展：在 X（推特）上识别代币合约地址并高亮，
点击后展示该地址的公开行情与合约风险数据。

## 一句话说明

本扩展**没有账号体系、没有统计埋点、没有自建服务器**。不收集、不存储、不转售任何个人数据。
唯一的网络请求是两个公开只读接口，请求内容只有你主动查询的那个代币地址。

## 数据处理

| 数据 | 去向 | 用途 |
|---|---|---|
| 你正在浏览的 X 页面文本 | **只留在本地浏览器** | 在本地检索 `0x…` 与 Solana 地址用于高亮，不上传、不存储 |
| 你点击/输入的代币地址 | 发送至 `api.dexscreener.com`、`api.honeypot.is` | 换取价格、流动性、交易量与合约风险数据 |
| 你的 IP | 上述两个接口按 HTTP 常规可见 | 网络请求的固有属性，非我方控制 |
| 卡片数据（价格等） | 内存保留 30 秒 | 避免重复打开同一张卡片时重复请求，关标签页即清空 |

本扩展只使用 `chrome.storage.local` 存**一样东西**：你自己点的监控列表（≤20 个地址），不做其他写入；不读取其他标签页、历史记录、
书签或剪贴板；不连接、不读取你的钱包，也不包含任何写链代码。

## 第三方服务

- **DexScreener** — <https://dexscreener.com>（行情）
- **Honeypot.is** — <https://honeypot.is>（EVM 合约模拟）

数据不会发送给开发者，不存在后端服务器。

## 权限说明

| 权限 | 用途 |
|---|---|
| `x.com` / `twitter.com` 的内容脚本 | 读取推文文本以识别合约地址 |
| `api.dexscreener.com` | 查询你点击地址的公开交易对数据 |
| `api.honeypot.is` | 做公开合约模拟（买卖税、貔貅检测） |
| `storage` | 保存你点「监控」加入的地址（≤20 个）；只存本地，不上传、不同步，卸载即删 |

除此之外**不申请**任何权限（无 `tabs`、`cookies`、`history`、`<all_urls>`、`activeTab`）。

## 远程代码

全部脚本随扩展打包，不加载、不执行、不注入远程代码，不使用 `eval` 与 `new Function`。

## 数据删除

开发者不收集数据，故无数据可删。卸载扩展即可清除全部本地痕迹。

## 联系方式

**[cantermattera@gmail.com](mailto:cantermattera@gmail.com)**
