import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export function getEnv(name, fallback = "") {
  const fileEnv = parseEnvFile(ENV_PATH);
  return process.env[name] ?? fileEnv[name] ?? fallback;
}

function getNumber(name, fallback) {
  const value = Number(getEnv(name, fallback));
  return Number.isFinite(value) ? value : fallback;
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
    niftySymbol: getEnv("NIFTY_SYMBOL", "NIFTY 50"),
    optionLotSize: getNumber("OPTION_LOT_SIZE", 65),
    botMode: getEnv("BOT_MODE", "paper"),
    paperTrading: {
      initialCapital: getNumber("PAPER_INITIAL_CAPITAL", 100000),
      defaultLots: getNumber("PAPER_DEFAULT_LOTS", 1)
    },
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
