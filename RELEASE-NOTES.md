# Web3 Token Radar

A Chrome extension (Manifest V3) that highlights EVM / Solana token contract addresses on X
(Twitter) and shows live DEX price, **deepest-pool** liquidity and honeypot risk in a card,
without leaving the timeline.

- **Install (unpacked):** download [`web3-twitter-radar-v1.3.0.zip`](web3-twitter-radar-v1.3.0.zip),
  unzip it, open `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**
  and pick the unzipped folder. Then open x.com.
- **Privacy policy:** <https://\*.github.io/privacy.html> (in `store-site/`)
- **Tests:** `cd test && npm i -D jsdom && node run-tests.cjs` → 22 + 14 assertions
- **Tech notes:** [`TECH-NOTES.md`](TECH-NOTES.md)

No account, no wallet connection, no analytics. The extension talks only to
`api.dexscreener.com` and `api.honeypot.is`, both read-only.

Not financial advice.
