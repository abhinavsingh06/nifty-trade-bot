import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadNseHolidaySet } from "./marketCalendar.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENV_PATH = path.join(PROJECT_ROOT, ".env");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .reduce((acc, line) => {
      const separatorIndex = line.indexOf("=");
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

/**
 * Zerodha keys: prefer values from `.env` over `process.env` so a long-running
 * dashboard picks up token edits without restart (CLI already re-reads the file).
 * In containers, set vars in `.env` or rely on non-empty `process.env` when the file omits the key.
 */
function getZerodhaEnv(name, fileEnv, fallback) {
  const fv = fileEnv[name];
  const fileVal = fv != null && String(fv).trim() !== "" ? String(fv).trim() : "";
  const pv = process.env[name];
  const procVal = pv != null && String(pv).trim() !== "" ? String(pv).trim() : "";
  if (fileVal) return fileVal;
  if (procVal) return procVal;
  return fallback;
}

export function getEnv(name, fallback = "") {
  const fileEnv = parseEnvFile(ENV_PATH);
  if (name === "ZERODHA_ACCESS_TOKEN" || name === "ZERODHA_API_KEY" || name === "ZERODHA_API_SECRET") {
    return getZerodhaEnv(name, fileEnv, fallback);
  }
  return process.env[name] ?? fileEnv[name] ?? fallback;
}

function getNumber(name, fallback) {
  const value = Number(getEnv(name, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function getBoolEnv(name, fallback = false) {
  const v = getEnv(name, "");
  if (v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
}

export function getConfig() {
  return {
    projectRoot: PROJECT_ROOT,
    runtimeDir: path.join(PROJECT_ROOT, "runtime"),
    marketTimezone: getEnv("MARKET_TIMEZONE", "Asia/Kolkata"),
    marketHours: {
      openHour: getNumber("MARKET_OPEN_HOUR", 9),
      openMinute: getNumber("MARKET_OPEN_MINUTE", 15),
      closeHour: getNumber("MARKET_CLOSE_HOUR", 15),
      closeMinute: getNumber("MARKET_CLOSE_MINUTE", 30)
    },
    /** When true, `isTradeSessionOpen` also blocks dates in `data/nse-holidays.json` (or override path). */
    marketSessionStrict: getBoolEnv("MARKET_SESSION_STRICT", false),
    nseHolidayCalendarPath: getEnv("NSE_HOLIDAY_CALENDAR_PATH", ""),
    nseHolidaySet: loadNseHolidaySet(getEnv("NSE_HOLIDAY_CALENDAR_PATH", ""), PROJECT_ROOT),
    /** After target 1, ratchet stop: NIFTY points below peak (CALL) or above trough (PUT). 0 = breakeven-only. */
    trailingStopUnderlyingPoints: getNumber("TRAILING_STOP_UNDERLYING_POINTS", 0),
    /** After target 1, trail option premium by this many rupees (0 = only underlying trail / breakeven). */
    trailingStopOptionPoints: getNumber("TRAILING_STOP_OPTION_POINTS", 0),
    /** If true (live exits), wait for fill poll before removing local open position. */
    exitWaitForFill: getBoolEnv("EXIT_WAIT_FOR_FILL", false),
    exitPollMaxMs: getNumber("EXIT_POLL_MAX_MS", 90_000),
    exitPollIntervalMs: getNumber("EXIT_POLL_INTERVAL_MS", 2000),
    /** Skip monitor exits outside `isTradeSessionOpen` (recommended live). */
    monitorRequireTradeSession: getBoolEnv("MONITOR_REQUIRE_TRADE_SESSION", true),
    niftySymbol: getEnv("NIFTY_SYMBOL", "NIFTY 50"),
    optionLotSize: getNumber("OPTION_LOT_SIZE", 65),
    botMode: getEnv("BOT_MODE", "paper"),
    paperTrading: {
      initialCapital: getNumber("PAPER_INITIAL_CAPITAL", 20000),
      defaultLots: getNumber("PAPER_DEFAULT_LOTS", 1)
    },
    /** Cap notional per paper entry (₹); 0 = no cap. */
    paperMaxTradeRupees: getNumber("PAPER_MAX_TRADE_RUPEES", 0),
    /** Max paper entry notional as % of wallet cash; 0 = no cap. */
    paperMaxTradePctWallet: getNumber("PAPER_MAX_TRADE_PCT_WALLET", 0),
    /** Block new paper buys after this many losing closes today (IST); 0 = off. */
    paperCooldownLossCountToday: getNumber("PAPER_COOLDOWN_LOSS_COUNT_TODAY", 0),
    /** Block new paper buys when today's realized paper P&L ≤ this negative amount; 0 = off. */
    paperCooldownMaxDailyLossRupees: getNumber("PAPER_COOLDOWN_MAX_DAILY_LOSS_RUPEES", 0),
    /** Dashboard WS poll interval when no open positions (ms). */
    dashboardBroadcastMsIdle: getNumber("DASHBOARD_BROADCAST_MS_IDLE", 15_000),
    /** Dashboard WS poll when there are open positions (ms). */
    dashboardBroadcastMsOpen: getNumber("DASHBOARD_BROADCAST_MS_OPEN", 5000),
    /** Positions show stale if last quote refresh is older than this (ms). */
    quoteStaleAfterMs: getNumber("QUOTE_STALE_AFTER_MS", 60_000),
    /** Throttle Zerodha session health checks in dashboard payload (ms). */
    sessionHealthTtlMs: getNumber("SESSION_HEALTH_TTL_MS", 60_000),
    /** Max paper BUY entries per IST calendar day (0 = unlimited). Mirrors a 2–3 trades/day desk rule. */
    dailyTradeSlotLimit: getNumber("DAILY_TRADE_SLOT_LIMIT", 3),
    minSignalScore: getNumber("MIN_SIGNAL_SCORE", 7),
    minConfirmationCount: getNumber("MIN_CONFIRMATION_COUNT", 3),
    /** `normal` | `patient` — patient tightens TRADEABLE using recent range + follow-through bar */
    tradeDiscipline: getEnv("TRADE_DISCIPLINE", "normal").trim(),
    signalMinRecentRangePoints: getNumber("SIGNAL_MIN_RECENT_RANGE_POINTS", 0),
    signalFollowThroughBuffer: getNumber("SIGNAL_FOLLOW_THROUGH_BUFFER", 3),
    historicalLookbackMinutes: getNumber("HISTORICAL_LOOKBACK_MINUTES", 120),
    backtestLookaheadCandles: getNumber("BACKTEST_LOOKAHEAD_CANDLES", 6),
    backtestLookbackDays: getNumber("BACKTEST_LOOKBACK_DAYS", 5),
    instrumentsCachePath: path.join(PROJECT_ROOT, "runtime", "instruments-nfo.csv"),
    orderDefaults: {
      variety: getEnv("ORDER_VARIETY", "regular"),
      product: getEnv("ORDER_PRODUCT", "MIS"),
      validity: getEnv("ORDER_VALIDITY", "DAY"),
      orderType: getEnv("ORDER_TYPE", "MARKET")
    },
    niftyIndex: {
      exchange: getEnv("NIFTY_INDEX_EXCHANGE", "NSE"),
      tradingsymbol: getEnv("NIFTY_INDEX_TRADINGSYMBOL", "NIFTY 50"),
      instrumentToken: getNumber("NIFTY_INDEX_INSTRUMENT_TOKEN", 256265)
    },
    optionSelection: {
      exchange: getEnv("OPTION_EXCHANGE", "NFO"),
      strikeStep: getNumber("OPTION_STRIKE_STEP", 50),
      expiryPreference: getEnv("EXPIRY_PREFERENCE", "current")
    },
    risk: {
      maxRiskPerTrade: getNumber("MAX_RISK_PER_TRADE", 2500),
      maxDailyLoss: getNumber("MAX_DAILY_LOSS", 7500),
      maxTradesPerDay: getNumber("MAX_TRADES_PER_DAY", 3)
    },
    zerodha: {
      baseUrl: getEnv("ZERODHA_BASE_URL", "https://api.kite.trade"),
      apiKey: getEnv("ZERODHA_API_KEY"),
      apiSecret: getEnv("ZERODHA_API_SECRET"),
      accessToken: getEnv("ZERODHA_ACCESS_TOKEN"),
      userId: getEnv("ZERODHA_USER_ID"),
      redirectUrl: getEnv("ZERODHA_REDIRECT_URL")
    },
    openai: {
      apiKey: getEnv("OPENAI_API_KEY"),
      model: getEnv("OPENAI_MODEL", "gpt-5.4")
    },
    crypto: {
      provider: getEnv("CRYPTO_PROVIDER", "coingecko"),
      baseUrl: getEnv("CRYPTO_BASE_URL", "https://api.coingecko.com/api/v3"),
      apiKey: getEnv("CRYPTO_API_KEY"),
      coinId: getEnv("CRYPTO_COIN_ID", "bitcoin"),
      vsCurrency: getEnv("CRYPTO_VS_CURRENCY", "usd"),
      symbol: getEnv("CRYPTO_SYMBOL", "BTCUSDT"),
      intervalMinutes: getNumber("CRYPTO_INTERVAL_MINUTES", 15),
      lookbackCandles: getNumber("CRYPTO_LOOKBACK_CANDLES", 24)
    }
  };
}
