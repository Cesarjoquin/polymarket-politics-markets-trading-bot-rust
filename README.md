# Polymarket 5-Minute Up/Down Bot (Rust)

Automated **Rust** bot that trades Polymarket’s 5‑minute “Up or Down” markets (Bitcoin, Ethereum, Solana) via the CLOB REST API.

It:

- Connects with your Polymarket wallet (EOA + Gnosis Safe proxy)
- Finds active 5m Up/Down markets for **BTC, ETH, and/or SOL** (configurable)
- Places **one BUY per outcome (Up and Down)** per market when price conditions are met
- Tracks fills and places a **SELL** when price ≥ sell target, or **stop-loss** when price ≤ 67% of target
- Sells at current bid when it’s ≥ sell price; otherwise places limit at sell price
- Emergency exit near market close to avoid holding into resolution

## Prerequisites

- **Rust** 1.70+ (`rustup` recommended)
- A Polymarket account funded with **USDC on Polygon** and enabled for trading

## Build

```bash
cd arcane-build/polymarket-bot-rust
cargo build --release
```

## Configure

Copy the env template and set your credentials:

```bash
cp env.template .env
# Edit .env with your PRIVATE_KEY and optional FUNDER_ADDRESS
```

Example `.env`:

```env
PRIVATE_KEY=0x...         # EOA private key that controls your Polymarket account
CLOB_HOST=https://clob.polymarket.com
CHAIN_ID=137
GAMMA_HOST=https://gamma-api.polymarket.com

# Which 5m Up/Down markets to trade: btc, eth, sol (comma-separated; default: btc)
TRADE_MARKETS=btc,eth,sol

TARGET_PRICE_UP=0.45
SELL_PRICE_UP=0.55
TARGET_PRICE_DOWN=0.45
SELL_PRICE_DOWN=0.55
ORDER_AMOUNT_TOKEN=5
CHECK_INTERVAL=10000
SELL_DELAY_MS=10000

TRADING_MODE=continuous
# TRADING_MODE=once

# Optional: Gnosis Safe proxy (funder) for signatureType=2
FUNDER_ADDRESS=0xYourSafeProxyAddress
# Optional: log file
# LOG_FILE=logs/trading.log
```

- **PRIVATE_KEY**: EOA you use with Polymarket (e.g. MetaMask).
- **FUNDER_ADDRESS**: Your Polymarket Safe proxy address (recommended for CLOB `signatureType=2`). Omit to use the EOA as funder.
- **ORDER_AMOUNT_TOKEN**: Shares per side; minimum 5. USD per side ≈ `ORDER_AMOUNT_TOKEN × TARGET_PRICE_*`.
- **Stop loss**: Fixed at **67% of the buy (target) price** for both Up and Down.

## Run

```bash
cargo run --release
# or
./target/release/polymarket-bot
```

Stop with `Ctrl+C`.

## Behavior

- **One market at a time**: Only the **next** eligible 5m window across your chosen assets is traded (single slot).
- **Choose assets**: Set `TRADE_MARKETS=btc`, `btc,eth`, `btc,eth,sol`, etc. to trade Bitcoin, Ethereum, and/or Solana 5m Up/Down.
- **One BUY per outcome per market**: At most one Up and one Down per market duration; no re-buy after sell.
- **Sell when**:
  - Price ≥ configured sell price (take-profit), or
  - Price ≤ stop-loss (67% of target).
- **Emergency exit**: When close to market end, resting SELLs are cancelled and an aggressive exit is placed so you don’t hold into resolution.

## Project layout

- `src/main.rs` – Entry point, config load, bot run.
- `src/config.rs` – Env-based configuration and validation.
- `src/types.rs` – Market, order, and outcome types.
- `src/logger.rs` – Console and optional file / per-market logging.
- `src/gamma.rs` – Gamma API client for BTC 5m markets.
- `src/clob.rs` – CLOB client: EIP-712 auth (derive API key), HMAC L2, limit orders, balance, open orders, cancel.
- `src/bot.rs` – Main loop: discovery, enter market, fill detection, SELL placement, stop-loss, emergency exit.

## References

- [Polymarket CLOB](https://docs.polymarket.com/developers/CLOB/)
- [Polymarket API Reference](https://docs.polymarket.com/api-reference/introduction)
