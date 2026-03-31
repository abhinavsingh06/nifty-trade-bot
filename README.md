# NIFTY Zerodha Bot

This project is a local scaffold for three trading workflows:

- signal-only alerts
- manual Zerodha-ready order tickets
- guarded auto-execution

It uses sample NIFTY candle data by default, and it can switch to live Zerodha Kite data when your API credentials are configured.

## Quick start

1. Copy `.env.example` to `.env`.
2. Run `npm run smoke`.
3. Inspect JSON artifacts in `runtime/`.

## Scripts

- `npm run dashboard` launches a local UI dashboard at `http://127.0.0.1:3020`.
- `npm run signals` generates the latest CALL or PUT bias.
- `npm run tickets` produces a manual order ticket with risk sizing.
- `npm run autotrade` runs the guarded execution flow.
- `npm run monitor` evaluates open positions and submits exit orders when stop or target rules fire.
- `npm run backtest` runs a validation pass over historical/sample candles and writes expectancy stats.
- `npm run review-forward` reviews pending live-session signals and resolves them when stop or target conditions are hit.
- `npm run check-session` validates that the current Zerodha access token is still usable.
- `npm run reconcile` compares local tracked positions with Zerodha orders and broker positions.
- `npm run login:url` prints your Kite Connect login URL.
- `npm run session:exchange -- <request_token>` exchanges a request token for an access token.
- `npm run instruments:refresh` downloads the latest NFO instrument list used for option contract selection.
- `npm run smoke` exercises all three.

## What is implemented

- chart-based signal scoring using SMA, VWAP, range breakout or breakdown, and volume confirmation
- multi-factor confirmation gating across trend, breakout, momentum, structure, and candle body quality
- risk controls for minimum signal quality, daily loss cap, per-trade risk cap, and max trades per day
- validation artifacts including backtest scorecards and forward-review tracking
- manual ticket generation for Zerodha-style workflows
- live Kite Connect REST integration for session exchange, historical candles, quotes, instrument refresh, and order placement
- NIFTY option contract selection from the latest cached NFO instrument file
- paper-trade-first mode switch so live auth does not immediately place orders unless `BOT_MODE=live`
- persistent open-position tracking with monitor-driven stop-loss and target handling
- option-premium-aware monitor exits when option quotes are available
- broker-side reconciliation against Zerodha order, **trade (fill)**, and position endpoints
- optional **NSE holiday calendar** with `MARKET_SESSION_STRICT` for session-aware automation
- **Trailing stops** (underlying + option premium) after target 1; monitor **exit polling** and strict **wait-for-fill** mode
- **Option-premium-based** realized PnL in daily `trade-state` when exit fills are known
- persisted runtime artifacts for automation use

## Session rules, monitoring, and reconciliation

- **Holidays + strict session:** set `MARKET_SESSION_STRICT=1` to block signals, live candles, auto-signals, and risk checks on dates listed in `data/nse-holidays.json` (override path with `NSE_HOLIDAY_CALENDAR_PATH`). Sync that file yearly with the [NSE holiday list](https://www.nseindia.com/resources/exchange-communication-holidays).
- **Trailing stops:** after target 1 is hit (breakeven arm), set `TRAILING_STOP_UNDERLYING_POINTS` (NIFTY points) and/or `TRAILING_STOP_OPTION_POINTS` (premium rupees) to ratchet stops with peak/trough price.
- **Exit orchestration (live):** monitor submits exit orders then polls `/orders` for fill (`EXIT_POLL_MAX_MS`, `EXIT_POLL_INTERVAL_MS`). Set `EXIT_WAIT_FOR_FILL=1` to **keep the position open locally** until a fill is confirmed (safer if the order rests on the book).
- **Monitor outside hours:** default `MONITOR_REQUIRE_TRADE_SESSION=1` skips monitoring when the session is closed; set `0` if you must manage overnight positions from the bot.
- **PnL:** `recordTradeExit` uses **option entry vs exit premium** when available (`optionFillPrice` or mark `optionPrice`); otherwise it falls back to the underlying proxy.
- **Reconcile:** `npm run reconcile` loads orders, **today’s trades (fills)**, and net positions; open rows include a same-day trade summary per symbol; `closedFillHints` estimates premium PnL from exit `order_id` vs local entry.

## Suggested automation prompts

Point your automations at this project directory and use commands like:

```bash
npm run signals
npm run tickets
npm run autotrade
```

## Zerodha setup

1. Fill in `ZERODHA_API_KEY`, `ZERODHA_API_SECRET`, `ZERODHA_USER_ID`, and `ZERODHA_REDIRECT_URL` in `.env`.
2. Run `npm run login:url` and open the printed URL.
3. After Zerodha redirects back, copy the `request_token` from the redirect URL.
4. Run `npm run session:exchange -- <request_token>`.
5. Put the returned `access_token` into `ZERODHA_ACCESS_TOKEN`.
6. Run `npm run instruments:refresh` once to cache the latest option instruments.

### Dashboard login flow

If you want to log in from the dashboard and save the token automatically:

1. Set your Zerodha app redirect URL to `http://127.0.0.1:3020/zerodha/callback`.
2. Put the same value in `.env` as `ZERODHA_REDIRECT_URL`.
3. Open the dashboard and use `Login to Zerodha`.
4. After Zerodha redirects back, the app exchanges the request token and saves `ZERODHA_ACCESS_TOKEN` into `.env` automatically.

Official Zerodha references used for this integration:
- [Kite Connect docs](https://www.kite.trade/docs/connect/v3)
- [Historical candles](https://kite.trade/docs/connect/v3/historical/)

## Safety note

This scaffold is not production-safe for live capital yet. Keep `BOT_MODE=paper` until you are satisfied with order reconciliation, session handling, and kill-switch behavior.

## Local dashboard

Build and launch:

```bash
npm run dashboard
```

Then open:

```text
http://127.0.0.1:3020
```

The React dashboard shows:

- session health
- latest signal and ticket state
- open and recently closed positions
- monitor and reconcile summaries
- one-click command buttons for the main bot flows
- React + TypeScript frontend served from a built bundle
- Tailwind-powered UI cards and action panels
- CALL/PUT suggestion cards based on market move plus headline sentiment swing

## Unattended signals (office / market hours)

Leave the machine on with a valid Zerodha access token so live candles work. In `.env`:

```env
AUTO_SIGNALS_ENABLED=1
AUTO_SIGNALS_INTERVAL_MINUTES=15
```

Then run **`npm run dashboard`** and keep it running. The server will:

1. **Run `signals` as soon as the session enters NSE cash hours** (first tick after open — checks every minute).
2. **Run again every `AUTO_SIGNALS_INTERVAL_MINUTES`** while the market is open, so each pass uses the latest 5m candle window and refreshed quotes — your trade hub updates over the WebSocket after each successful run.
3. **Optional spot-move runs:** set `AUTO_SIGNALS_SPOT_MOVE_PCT` (e.g. `0.15` for 0.15%). Between interval ticks the scheduler polls the index quote; if spot moved by at least that percentage versus the spot saved at the last successful run, it runs an extra pass. This is additive to the time-based schedule, not a replacement for candle/structure analysis inside the engine.

To run **only** the scheduler without the HTTP UI (e.g. on a headless box):

```bash
npm run auto-signals
```

Each run appends a short entry to **`runtime/auto-signals-scheduler-state.json`** (timestamps, direction, score, spot).

### Stricter, less “rushed” suggestions (`TRADE_DISCIPLINE=patient`)

When set to `patient`, a TRADEABLE call is only kept if the last ~12-bar range is wide enough (default minimum width 28 index points unless you set `SIGNAL_MIN_RECENT_RANGE_POINTS`) and the latest candle shows follow-through (green close above the prior bar’s high for CALL, red close below the prior bar’s low for PUT, with `SIGNAL_FOLLOW_THROUGH_BUFFER` points of slack). Otherwise the status becomes `WAIT_CONFIRMATION` and notes are added to the signal. The core scoring in `signalEngine` is unchanged; this layer only clamps overly eager TRADEABLE outputs.

### Webhook / WhatsApp

Set `NOTIFY_WEBHOOK_URL` to an HTTPS endpoint that accepts JSON POSTs. On each auto run, if the signal is **`TRADEABLE`**, the server POSTs a small payload (`event`, human `text`, and a trimmed `signal` object). Optional header `X-Notify-Secret` if `NOTIFY_WEBHOOK_SECRET` is set. Wire that URL to n8n, Zapier, or your own relay that calls WhatsApp (Twilio, Meta Cloud API, CallMeBot, etc.); the bot does not speak WhatsApp directly.

## Deploy on Oracle Cloud (Always Free) with Docker

This is the easiest “free + always on” way to run the scheduler + WebSocket dashboard.

### Create the VM

- Create an **Always Free** compute instance (Ubuntu recommended).
- In Oracle Networking, allow inbound:
  - **TCP 22** (SSH)
  - **TCP 80/443** (if using HTTPS via Caddy; recommended)
  - OR **TCP 3020** (if you want to expose the app directly without a reverse proxy)

### Install Docker

On the VM:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker \"$USER\"
```

Log out and back in so `docker` works without `sudo`.

### Deploy the bot (simple, HTTP on port 3020)

1. Copy your project to the VM (git clone / scp / rsync).
2. On the VM, create `.env` (copy from `.env.example`) and fill in your secrets. Keep `.env` **only** on the server.
3. Run:

```bash
docker compose up -d --build
```

The dashboard will be available at:

```text
http://<VM_PUBLIC_IP>:3020
```

### Deploy with HTTPS (recommended): Caddy reverse proxy

If you have a domain name pointing to the VM:

- Use `docker-compose.prod.yml` + `Caddyfile`
- Edit the `Caddyfile` and replace `YOUR_DOMAIN.com` and set the basic-auth credentials.
- Then run:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Now the dashboard is:

```text
https://YOUR_DOMAIN.com
```

#### Zerodha redirect URL (important)

For the dashboard login flow to work on the server, set:

- `ZERODHA_REDIRECT_URL=https://YOUR_DOMAIN.com/zerodha/callback`

and also set the same redirect URL in your Zerodha Kite app settings.

### Optional: self-host n8n on the same VM

`docker-compose.prod.yml` includes an optional `n8n` service (disabled by default). If you enable it, point:

- `NOTIFY_WEBHOOK_URL=https://YOUR_DOMAIN.com/n8n/webhook/nifty-tradeable`

and use the `X-Notify-Secret` header check inside the n8n workflow.

## Security note: rotate secrets if ever exposed

If you ever pasted logs or terminal output that contained `.env` values (OpenAI key, Zerodha token/secret), **rotate them** in the respective dashboards. Treat tokens as compromised once printed or shared.

## Session handling

Zerodha access tokens expire daily and normal app flows should expect re-login rather than silent token refresh. Use:

```bash
npm run check-session
```

If the token is expired, the CLI will tell you to:

```bash
npm run login:url
npm run session:exchange -- <request_token>
```
