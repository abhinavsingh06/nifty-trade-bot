import {
  fetchHistoricalCandles,
  fetchOrderHistory,
  fetchOrders,
  fetchPositions,
  fetchProfile,
  fetchQuote,
  fetchTrades,
  refreshInstruments
} from "./kiteApi.js";
import { loadOptionInstruments, selectOptionContract } from "./optionSelector.js";
import {
  closePositionRecord,
  createPositionRecord,
  evaluateExit,
  listClosedPositions,
  listOpenPositions,
  removeOpenPosition,
  updateOpenPosition
} from "./positionManager.js";
import {
  buildPaperWalletSnapshot,
  creditPaperExit,
  creditPaperPartialExit,
  debitPaperEntry,
  getPaperWallet
} from "./paperWallet.js";
import { readForwardTracker, registerForwardSignal, reviewForwardSignals } from "./forwardTracker.js";
import { analyzeSignal } from "./signalEngine.js";
import { calculateATR, calculateRSI, calculateSupertrend, calculateVWAP } from "./marketData.js";
import { applyTradeDiscipline } from "./signalDiscipline.js";
import { buildRiskCheck, recordPaperPartialRealized, recordTradeExit, recordTradePlacement } from "./riskManager.js";
import { buildManualTicket, buildPositionSummary } from "./reporters.js";
import { isTradeSessionOpen } from "./marketCalendar.js";
import { pollOrderFill } from "./exitOrders.js";
import { placeOrder } from "./zerodhaClient.js";
import { appendDayJournal } from "./tradingDayJournal.js";
import { assertAutotradeEntryAllowed, assertPaperEntryAllowed } from "./tradingDeskPolicy.js";

function summarizeTradesForSymbol(trades, tradingsymbol) {
  const legs = trades.filter((t) => t.tradingsymbol === tradingsymbol);
  let buyQty = 0;
  let sellQty = 0;
  let buyValue = 0;
  let sellValue = 0;
  for (const t of legs) {
    const q = Number(t.quantity ?? 0);
    const p = Number(t.average_price ?? 0);
    if (t.transaction_type === "BUY") {
      buyQty += q;
      buyValue += q * p;
    } else if (t.transaction_type === "SELL") {
      sellQty += q;
      sellValue += q * p;
    }
  }
  return {
    legCount: legs.length,
    buyQuantity: buyQty,
    sellQuantity: sellQty,
    netQuantity: buyQty - sellQty,
    vwapBuy: buyQty > 0 ? Number((buyValue / buyQty).toFixed(4)) : null,
    vwapSell: sellQty > 0 ? Number((sellValue / sellQty).toFixed(4)) : null
  };
}

async function enrichSignal(config, signal, options = {}) {
  const { enableLiveBrokerData = true } = options;
  const hasLiveAuth = enableLiveBrokerData && config.zerodha.apiKey && config.zerodha.accessToken;
  signal.spotPrice = signal.indicators.latestClose;
  signal.option = buildPaperOption(config, signal, signal.spotPrice);
  signal.optionLastPrice = null;

  if (!hasLiveAuth) {
    return signal;
  }

  const instrumentKey = `${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`;
  const quoteMap = await fetchQuote(config, [instrumentKey]);
  const quote = quoteMap[instrumentKey];

  if (quote?.last_price) {
    signal.spotPrice = quote.last_price;
  }

  let instruments = loadOptionInstruments(config);
  if (!instruments.length) {
    await refreshInstruments(config, config.optionSelection.exchange);
    instruments = loadOptionInstruments(config);
  }

  signal.option = selectOptionContract(config, instruments, signal, signal.spotPrice, signal.timestamp);
  if (signal.option?.tradingsymbol) {
    const optionKey = `${signal.option.exchange}:${signal.option.tradingsymbol}`;
    const optionQuoteMap = await fetchQuote(config, [optionKey]);
    signal.optionLastPrice = optionQuoteMap[optionKey]?.last_price ?? null;
  }
  return signal;
}

function buildPaperOption(config, signal, spotPrice, strikeOffsetSteps = 0) {
  const step = config.optionSelection.strikeStep;
  const atm = Math.round(spotPrice / step) * step;
  const offset = Math.max(0, Number(strikeOffsetSteps ?? 0));
  const strike =
    signal.direction === "CALL" ? atm + step * offset : atm - step * offset;
  const side = signal.direction === "CALL" ? "CE" : "PE";
  return {
    exchange: config.optionSelection.exchange,
    tradingsymbol: `NIFTY_PAPER_${strike}${side}`,
    strike,
    instrument_type: side
  };
}

export async function fetchCallPutAtmPremiums(config, spotPrice, asOfIso) {
  const hasLiveAuth = config.zerodha.apiKey && config.zerodha.accessToken;
  if (!hasLiveAuth || !(Number(spotPrice) > 0)) {
    return { call: null, put: null, callOption: null, putOption: null };
  }

  let instruments = loadOptionInstruments(config);
  if (!instruments.length) {
    await refreshInstruments(config, config.optionSelection.exchange);
    instruments = loadOptionInstruments(config);
  }

  const ts = asOfIso || new Date().toISOString();
  const pseudoCall = { direction: "CALL" };
  const pseudoPut = { direction: "PUT" };
  const callOption = selectOptionContract(config, instruments, pseudoCall, spotPrice, ts, {});
  const putOption = selectOptionContract(config, instruments, pseudoPut, spotPrice, ts, {});
  const keys = [];
  if (callOption?.tradingsymbol) {
    keys.push(`${callOption.exchange}:${callOption.tradingsymbol}`);
  }
  if (putOption?.tradingsymbol) {
    keys.push(`${putOption.exchange}:${putOption.tradingsymbol}`);
  }
  if (!keys.length) {
    return { call: null, put: null, callOption, putOption };
  }

  const map = await fetchQuote(config, keys);
  const callKey = callOption ? `${callOption.exchange}:${callOption.tradingsymbol}` : null;
  const putKey = putOption ? `${putOption.exchange}:${putOption.tradingsymbol}` : null;

  return {
    call: callKey ? map[callKey]?.last_price ?? null : null,
    put: putKey ? map[putKey]?.last_price ?? null : null,
    callOption,
    putOption
  };
}

/**
 * ATM + 1-step OTM CE/PE for intraday cards (live quotes). Empty rows if auth/quote missing.
 */
export async function fetchStrikeLadderPremiums(config, spotPrice, asOfIso) {
  const step = config.optionSelection.strikeStep;
  const spotN = Number(spotPrice);
  const atmStrike = Number.isFinite(spotN) ? Math.round(spotN / step) * step : 0;
  const indexLabel = String(config.niftyIndex?.tradingsymbol || "NIFTY")
    .split(/\s+/)[0]
    .trim() || "NIFTY";

  const hasLive = config.zerodha.apiKey && config.zerodha.accessToken;
  if (!hasLive || !(spotN > 0)) {
    return { atmStrike, indexLabel, rows: [] };
  }

  let instruments = loadOptionInstruments(config);
  if (!instruments.length) {
    await refreshInstruments(config, config.optionSelection.exchange);
    instruments = loadOptionInstruments(config);
  }

  const ts = asOfIso || new Date().toISOString();
  const specs = [
    { id: "call-buy", action: "CALL", strikeOffsetSteps: 0, moneynessLabel: "ATM" },
    { id: "put-buy", action: "PUT", strikeOffsetSteps: 0, moneynessLabel: "ATM" },
    { id: "call-otm1", action: "CALL", strikeOffsetSteps: 1, moneynessLabel: "1 strike OTM" },
    { id: "put-otm1", action: "PUT", strikeOffsetSteps: 1, moneynessLabel: "1 strike OTM" }
  ];

  const meta = [];
  for (const spec of specs) {
    const pseudo = { direction: spec.action };
    const opt = selectOptionContract(config, instruments, pseudo, spotN, ts, {
      strikeOffsetSteps: spec.strikeOffsetSteps
    });
    if (!opt?.tradingsymbol) continue;
    meta.push({ ...spec, option: opt, strike: Number(opt.strike) });
  }

  if (!meta.length) {
    return { atmStrike, indexLabel, rows: [] };
  }

  const keys = meta.map((m) => `${m.option.exchange}:${m.option.tradingsymbol}`);
  const quoteMap = await fetchQuote(config, keys);

  const rows = [];
  for (const m of meta) {
    const key = `${m.option.exchange}:${m.option.tradingsymbol}`;
    const premium = quoteMap[key]?.last_price ?? null;
    if (!(premium > 0)) continue;
    rows.push({
      id: m.id,
      action: m.action === "CALL" ? "CALL BUY" : "PUT BUY",
      strikeOffsetSteps: m.strikeOffsetSteps,
      strike: m.strike,
      premium,
      option: m.option,
      moneynessLabel: m.moneynessLabel,
      tradeLegLabel: `${indexLabel} ${m.strike} ${m.action === "CALL" ? "CE" : "PE"}`
    });
  }

  return { atmStrike, indexLabel, rows };
}

/**
 * Fetch strike-wise OI, OI change, premiums, IV (greeks), and per-strike PCR.
 * Returns { rows, totalCeOi, totalPeOi, pcr, callVolumePct, putVolumePct, atmStrike }
 */
export async function fetchOptionChainOI(config, spotPrice, asOfIso) {
  const step = config.optionSelection.strikeStep;
  const spotN = Number(spotPrice);
  const atmStrike = Number.isFinite(spotN) ? Math.round(spotN / step) * step : 0;
  const indexLabel = String(config.niftyIndex?.tradingsymbol || "NIFTY")
    .split(/\s+/)[0]
    .trim() || "NIFTY";

  const empty = { rows: [], totalCeOi: 0, totalPeOi: 0, pcr: null, callVolumePct: null, putVolumePct: null, atmStrike, indexLabel };

  const hasLive = config.zerodha.apiKey && config.zerodha.accessToken;
  if (!hasLive || !(spotN > 0)) return empty;

  let instruments = loadOptionInstruments(config);
  if (!instruments.length) {
    await refreshInstruments(config, config.optionSelection.exchange);
    instruments = loadOptionInstruments(config);
  }

  const ts = asOfIso || new Date().toISOString();
  const offsets = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  const meta = [];

  for (const offset of offsets) {
    for (const side of ["CALL", "PUT"]) {
      const pseudo = { direction: side };
      const opt = selectOptionContract(config, instruments, pseudo, spotN, ts, { strikeOffsetSteps: offset });
      if (!opt?.tradingsymbol) continue;
      meta.push({ side, offset, option: opt, strike: Number(opt.strike) });
    }
  }

  if (!meta.length) return empty;

  const keys = [...new Set(meta.map((m) => `${m.option.exchange}:${m.option.tradingsymbol}`))];
  let quoteMap = {};
  try {
    quoteMap = await fetchQuote(config, keys);
  } catch {
    return empty;
  }

  const strikeMap = {};
  for (const m of meta) {
    const key = `${m.option.exchange}:${m.option.tradingsymbol}`;
    const q = quoteMap[key];
    if (!strikeMap[m.strike]) strikeMap[m.strike] = { strike: m.strike };
    const entry = strikeMap[m.strike];
    const oi = q?.oi ?? 0;
    const oiChange = q?.oi_day_high != null ? oi - (q.oi_day_low ?? oi) : 0;
    const premium = q?.last_price ?? null;
    const iv = q?.greeks?.iv ?? null;
    const volume = q?.volume ?? 0;
    if (m.side === "CALL") {
      entry.ceOi = oi;
      entry.ceChg = oiChange;
      entry.cePremium = premium;
      entry.ceIv = iv ? Number((iv * 100).toFixed(1)) : null;
      entry.ceSymbol = m.option.tradingsymbol;
      entry.ceVolume = volume;
    } else {
      entry.peOi = oi;
      entry.peChg = oiChange;
      entry.pePremium = premium;
      entry.peIv = iv ? Number((iv * 100).toFixed(1)) : null;
      entry.peSymbol = m.option.tradingsymbol;
      entry.peVolume = volume;
    }
  }

  const rows = Object.values(strikeMap)
    .sort((a, b) => a.strike - b.strike)
    .map((row) => {
      const ceOi = row.ceOi || 0;
      const peOi = row.peOi || 0;
      const pcr = ceOi > 0 ? Number((peOi / ceOi).toFixed(2)) : null;
      const bias = pcr == null ? "—"
        : pcr > 1.5 ? "CE hebias"
        : pcr > 1.2 ? "PE hebias"
        : pcr < 0.5 ? "CE hebias"
        : pcr < 0.8 ? "CE hebias"
        : "Balanced";
      return { ...row, ceOi: ceOi / 100000, peOi: peOi / 100000, ceChg: (row.ceChg || 0) / 100000, peChg: (row.peChg || 0) / 100000, pcr, bias };
    });

  let totalCeOi = 0;
  let totalPeOi = 0;
  let totalCeVol = 0;
  let totalPeVol = 0;
  for (const r of rows) { totalCeOi += r.ceOi; totalPeOi += r.peOi; totalCeVol += (strikeMap[r.strike]?.ceVolume || 0); totalPeVol += (strikeMap[r.strike]?.peVolume || 0); }
  const pcr = totalCeOi > 0 ? Number((totalPeOi / totalCeOi).toFixed(2)) : null;
  const totalVol = totalCeVol + totalPeVol;
  const callVolumePct = totalVol > 0 ? Number(((totalCeVol / totalVol) * 100).toFixed(0)) : null;
  const putVolumePct = totalVol > 0 ? Number(((totalPeVol / totalVol) * 100).toFixed(0)) : null;

  return { rows, totalCeOi: Number(totalCeOi.toFixed(1)), totalPeOi: Number(totalPeOi.toFixed(1)), pcr, callVolumePct, putVolumePct, atmStrike, indexLabel };
}

/**
 * Fetch India VIX last price (NSE:INDIA VIX).
 * Returns null on any error.
 */
export async function fetchIndiaVix(config) {
  try {
    const q = await fetchQuote(config, ["NSE:INDIA VIX"]);
    return q?.["NSE:INDIA VIX"]?.last_price ?? null;
  } catch {
    return null;
  }
}

/**
 * Compute Max Pain from option chain rows.
 * rows: [{ strike, ceOi (lakhs), peOi (lakhs) }]
 * Returns the strike with minimum total open-interest payoff to option buyers.
 */
export function calculateMaxPain(rows) {
  if (!rows?.length) return null;
  const strikes = rows.map((r) => r.strike);
  let minPain = Infinity;
  let maxPainStrike = null;
  for (const k of strikes) {
    let pain = 0;
    for (const row of rows) {
      pain += (row.ceOi || 0) * Math.max(0, k - row.strike);
      pain += (row.peOi || 0) * Math.max(0, row.strike - k);
    }
    if (pain < minPain) { minPain = pain; maxPainStrike = k; }
  }
  return maxPainStrike;
}

/**
 * Fetch candles for one timeframe interval and compute multi-TF signal summary.
 * interval: '15minute' | '60minute' | 'day'
 * Returns { interval, rsi, rsiDir, supertrendDir, vwapPos, bias }
 */
async function analyzeTimeframe(config, instrument, interval, from, to) {
  try {
    const candles = await fetchHistoricalCandles(config, instrument.instrumentToken, interval, from, to);
    if (!candles || candles.length < 15) return { interval, rsi: null, rsiDir: null, supertrendDir: null, vwapPos: null, bias: "Unknown" };
    const rsiRes = calculateRSI(candles, 14, 5);
    const stRes = calculateSupertrend(candles, 7, 3);
    const vwap = calculateVWAP(candles);
    const latest = candles[candles.length - 1];
    const rsi = rsiRes?.value ?? null;
    const rsiDir = rsi == null ? null : rsi > 60 ? "Bull" : rsi < 40 ? "Bear" : "Neutral";
    const supertrendDir = stRes?.trend === "up" ? "Bull" : stRes?.trend === "down" ? "Bear" : null;
    const vwapPos = vwap && latest?.close ? (latest.close > vwap ? "Above" : "Below") : null;
    const votes = [rsiDir, supertrendDir, vwapPos === "Above" ? "Bull" : vwapPos === "Below" ? "Bear" : null].filter(Boolean);
    const bullVotes = votes.filter((v) => v === "Bull").length;
    const bearVotes = votes.filter((v) => v === "Bear").length;
    const bias = bullVotes > bearVotes ? "Bull" : bearVotes > bullVotes ? "Bear" : "Mixed";
    return { interval, rsi: rsi != null ? Number(rsi.toFixed(1)) : null, rsiDir, supertrendDir, vwapPos, bias, stValue: stRes?.value ?? null };
  } catch {
    return { interval, rsi: null, rsiDir: null, supertrendDir: null, vwapPos: null, bias: "Unknown" };
  }
}

/**
 * Multi-timeframe analysis for 15min, 60min, and daily.
 * Returns array of { interval, rsi, rsiDir, supertrendDir, vwapPos, bias, stValue }
 */
export async function fetchMultiTimeframeSignals(config, instrument) {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const d3 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const [tf15, tf60, tfDay] = await Promise.all([
    analyzeTimeframe(config, instrument, "15minute", d3.toISOString(), now.toISOString()),
    analyzeTimeframe(config, instrument, "60minute", d30.toISOString(), now.toISOString()),
    analyzeTimeframe(config, instrument, "day", d30.toISOString(), now.toISOString()),
  ]);
  return [tf15, tf60, tfDay];
}

function analyzeWithDiscipline(candles, config) {
  const analyzed = analyzeSignal(candles, config);
  applyTradeDiscipline(analyzed, candles, config);
  return analyzed;
}

export async function generateSignalRun(candles, config, options) {
  const signal = await enrichSignal(config, analyzeWithDiscipline(candles, config), options);
  registerForwardSignal(config, signal);
  return { signal };
}

export async function generateTicketRun(candles, config, options) {
  const signal = await enrichSignal(config, analyzeWithDiscipline(candles, config), options);
  registerForwardSignal(config, signal);
  const riskCheck = buildRiskCheck(config, signal);
  const ticket = buildManualTicket(signal, riskCheck, config);
  return { signal, riskCheck, ticket };
}

export async function generateAutoTradeRun(candles, config, options) {
  const signal = await enrichSignal(config, analyzeWithDiscipline(candles, config), options);
  registerForwardSignal(config, signal);
  const riskCheck = buildRiskCheck(config, signal);
  const orderRequest = {
    variety: config.orderDefaults.variety,
    exchange: signal.option?.exchange ?? config.optionSelection.exchange,
    tradingsymbol: signal.option?.tradingsymbol ?? signal.symbol,
    transaction_type: "BUY",
    quantity: String(riskCheck.quantity),
    product: config.orderDefaults.product,
    order_type: config.orderDefaults.orderType,
    validity: config.orderDefaults.validity
  };

  if (config.orderDefaults.orderType === "LIMIT") {
    orderRequest.price = String(signal.entryZone[1]);
  }

  let brokerResponse = {
    ok: false,
    mode: config.botMode,
    message: "Risk checks failed. Order not submitted.",
    orderRequest
  };

  if (riskCheck.approved) {
    try {
      assertAutotradeEntryAllowed(config, {
        open: listOpenPositions(config),
        closed: listClosedPositions(config)
      });
    } catch (error) {
      brokerResponse = {
        ok: false,
        mode: config.botMode,
        message: error.message ?? "Entry blocked by desk policy.",
        orderRequest
      };
      return { signal, riskCheck, orderRequest, brokerResponse };
    }
    brokerResponse = await placeOrder(config, orderRequest);
    if (brokerResponse.ok) {
      const position = createPositionRecord(config, signal, riskCheck, brokerResponse);
      try {
        if (brokerResponse.mode === "paper") {
          debitPaperEntry(config, position, signal.optionLastPrice);
        }
      } catch (error) {
        removeOpenPosition(config, position.id);
        throw error;
      }
      recordTradePlacement(riskCheck);
      brokerResponse.position = position;
      brokerResponse.paperWallet = buildPaperWalletSnapshot(config, listOpenPositions(config));
    }
  }

  return { signal, riskCheck, orderRequest, brokerResponse };
}

export async function monitorPositionsRun(config, options = {}) {
  const { enableLiveBrokerData = true } = options;
  const positions = listOpenPositions(config);
  if (!positions.length) {
    return {
      status: "NO_OPEN_POSITIONS",
      evaluatedAt: new Date().toISOString(),
      positions: []
    };
  }

  if (config.monitorRequireTradeSession && !isTradeSessionOpen(new Date().toISOString(), config)) {
    const evaluatedAt = new Date().toISOString();
    return {
      status: "SKIPPED",
      evaluatedAt,
      reason:
        "Outside trade session (hours or holiday). Set MONITOR_REQUIRE_TRADE_SESSION=0 to monitor off-hours.",
      tradeSessionOpen: false,
      positions: positions.map((position) => ({
        id: position.id,
        action: "NO_OP_SESSION",
        position: buildPositionSummary(position, config)
      }))
    };
  }

  const canUseBroker = enableLiveBrokerData && config.zerodha.apiKey && config.zerodha.accessToken;
  if (!canUseBroker) {
    return {
      status: "SKIPPED",
      evaluatedAt: new Date().toISOString(),
      reason: "Live broker data unavailable for monitoring.",
      positions: positions.map((position) => buildPositionSummary(position, config))
    };
  }

  const quoteKeys = [
    `${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`,
    ...positions
      .filter((position) => position.option?.tradingsymbol)
      .map((position) => `${position.option.exchange}:${position.option.tradingsymbol}`)
  ];

  const quoteMap = await fetchQuote(config, quoteKeys);
  const spotKey = `${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`;
  const spotPrice = quoteMap[spotKey]?.last_price;

  if (!spotPrice) {
    throw new Error("Unable to fetch live NIFTY spot price for monitor run.");
  }

  const updates = [];
  for (const position of positions) {
    const optionKey = position.option?.tradingsymbol
      ? `${position.option.exchange}:${position.option.tradingsymbol}`
      : null;
    const optionPrice = optionKey ? quoteMap[optionKey]?.last_price ?? null : null;
    const evaluation = evaluateExit(position, spotPrice, optionPrice, config);

    if (evaluation.shouldExit) {
      const exitOrderRequest = {
        variety: config.orderDefaults.variety,
        exchange: position.option?.exchange ?? config.optionSelection.exchange,
        tradingsymbol: position.option?.tradingsymbol ?? position.symbol,
        transaction_type: "SELL",
        quantity: String(position.quantity),
        product: config.orderDefaults.product,
        order_type: config.orderDefaults.orderType,
        validity: config.orderDefaults.validity
      };

      const brokerResponse = await placeOrder(config, exitOrderRequest);
      if (!brokerResponse.ok) {
        updates.push({
          id: position.id,
          action: "EXIT_ORDER_FAILED",
          exitReason: evaluation.exitReason,
          spotPrice,
          optionPrice,
          brokerMessage: brokerResponse.message
        });
        continue;
      }

      let optionFillPrice = optionPrice;
      let fillConfirmed = false;

      if (
        config.botMode === "live" &&
        config.exitWaitForFill &&
        brokerResponse.brokerOrder?.order_id
      ) {
        const fill = await pollOrderFill(config, brokerResponse.brokerOrder.order_id, position.quantity);
        if (!fill.ok) {
          updates.push({
            id: position.id,
            action: "EXIT_FILL_PENDING",
            exitReason: evaluation.exitReason,
            spotPrice,
            optionPrice,
            orderId: brokerResponse.brokerOrder.order_id,
            fillError: fill.reason ?? "UNKNOWN",
            warning:
              "Exit order submitted; fill not confirmed — local position kept OPEN. Re-run monitor or check broker."
          });
          continue;
        }
        if (fill.averagePrice) {
          optionFillPrice = fill.averagePrice;
          fillConfirmed = true;
        }
      } else if (config.botMode === "live" && brokerResponse.brokerOrder?.order_id) {
        const fill = await pollOrderFill(config, brokerResponse.brokerOrder.order_id, position.quantity);
        if (fill.ok && fill.averagePrice) {
          optionFillPrice = fill.averagePrice;
          fillConfirmed = true;
        }
      }

      const closed = closePositionRecord(config, position.id, {
        reason: evaluation.exitReason,
        spotPrice,
        optionPrice,
        optionFillPrice: fillConfirmed ? optionFillPrice : null,
        brokerOrderId: brokerResponse.brokerOrder?.order_id ?? null,
        brokerMode: brokerResponse.mode,
        fillStatus:
          brokerResponse.mode === "paper"
            ? "SIMULATED"
            : fillConfirmed
              ? "FILLED"
              : "SUBMITTED"
      });
      const realizedPnL = closed ? recordTradeExit(config, closed) : null;
      if (closed && brokerResponse.mode === "paper") {
        creditPaperExit(config, closed, optionFillPrice);
      }

      updates.push({
        id: position.id,
        action: "EXITED",
        exitReason: evaluation.exitReason,
        spotPrice,
        optionPrice,
        optionFillPrice: fillConfirmed ? optionFillPrice : null,
        realizedPnL,
        brokerMessage: brokerResponse.message,
        closedPosition: closed ? buildPositionSummary(closed, config) : null
      });
      continue;
    }

    const updated = updateOpenPosition(config, position.id, (current) => ({
      ...evaluation.updatedPosition,
      lastObservedOptionPrice: optionPrice
    }));

    const trailActive =
      (config.trailingStopUnderlyingPoints > 0 || config.trailingStopOptionPoints > 0) &&
      updated?.target1Hit;
    updates.push({
      id: position.id,
      action: updated?.target1Hit && !position.target1Hit
        ? "TRAILING_STOP_ARMED"
        : trailActive
          ? "TRAIL_ACTIVE"
          : "HELD",
      spotPrice,
      optionPrice,
      position: updated ? buildPositionSummary(updated, config) : buildPositionSummary(position, config)
    });
  }

  return {
    status: "MONITORED",
    evaluatedAt: new Date().toISOString(),
    spotPrice,
    positions: updates
  };
}

export async function reviewForwardSignalsRun(config) {
  const tracker = readForwardTracker(config);
  if (!tracker.pending.length) {
    return {
      status: "NO_PENDING_SIGNALS",
      reviewedAt: new Date().toISOString(),
      pendingCount: 0,
      resolvedCount: tracker.resolved.length,
      resolvedNow: []
    };
  }

  const quoteMap = await fetchQuote(config, [`${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`]);
  const spotKey = `${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`;
  const spotPrice = quoteMap[spotKey]?.last_price;
  if (!spotPrice) {
    throw new Error("Unable to fetch live NIFTY spot price for forward review.");
  }

  const optionSymbol = tracker.pending.find((item) => item.option?.tradingsymbol)?.option?.tradingsymbol;
  let optionPrice = null;
  if (optionSymbol) {
    const optionKey = `${config.optionSelection.exchange}:${optionSymbol}`;
    const optionQuote = await fetchQuote(config, [optionKey]);
    optionPrice = optionQuote[optionKey]?.last_price ?? null;
  }

  const review = reviewForwardSignals(config, { spotPrice, optionPrice });
  return {
    status: "FORWARD_REVIEWED",
    ...review
  };
}

export async function createPaperTradeFromSuggestion(config, selected, intelligence) {
  assertPaperEntryAllowed(config, {
    open: listOpenPositions(config),
    closed: listClosedPositions(config)
  });

  const lots = Math.max(1, config.paperTrading.defaultLots);
  let quantity = lots * config.optionLotSize;
  const spotPrice = Number(intelligence.marketMove?.spot ?? selected.entryZone?.[0] ?? 0);
  const direction = selected.action === "CALL BUY" ? "CALL" : "PUT";
  const strikeOffsetSteps = Math.max(0, Number(selected.strikeOffsetSteps ?? 0));
  let option = buildPaperOption(config, { direction }, spotPrice, strikeOffsetSteps);
  let optionLastPrice = null;

  const hasLiveAuth = config.zerodha.apiKey && config.zerodha.accessToken;
  if (hasLiveAuth) {
    let instruments = loadOptionInstruments(config);
    if (!instruments.length) {
      await refreshInstruments(config, config.optionSelection.exchange);
      instruments = loadOptionInstruments(config);
    }

    const resolvedOption = selectOptionContract(
      config,
      instruments,
      { direction },
      spotPrice,
      new Date().toISOString(),
      { strikeOffsetSteps }
    );

    if (!resolvedOption?.tradingsymbol) {
      throw new Error("Unable to resolve a live NIFTY option contract for this paper trade.");
    }

    option = resolvedOption;
    const optionKey = `${resolvedOption.exchange}:${resolvedOption.tradingsymbol}`;
    const quoteMap = await fetchQuote(config, [optionKey]);
    optionLastPrice = quoteMap[optionKey]?.last_price ?? null;
  }

  if (!(optionLastPrice > 0)) {
    throw new Error("Live option premium is unavailable right now. Paper Buy needs a real market premium to enter.");
  }

  let tradeCost = Number((optionLastPrice * quantity).toFixed(2));
  const walletPreview = getPaperWallet(config);
  const lotSize = Math.max(1, config.optionLotSize);
  let maxNotional = Infinity;
  if (config.paperMaxTradeRupees > 0) {
    maxNotional = Math.min(maxNotional, config.paperMaxTradeRupees);
  }
  if (config.paperMaxTradePctWallet > 0) {
    const cap = (walletPreview.cashBalance * config.paperMaxTradePctWallet) / 100;
    maxNotional = Math.min(maxNotional, cap);
  }
  if (Number.isFinite(maxNotional)) {
    const maxQty = Math.floor(maxNotional / optionLastPrice / lotSize) * lotSize;
    if (maxQty < lotSize) {
      throw new Error(
        `Paper max trade cap (₹${maxNotional.toFixed(0)} from PAPER_MAX_TRADE_RUPEES / PAPER_MAX_TRADE_PCT_WALLET) allows less than one lot at this premium.`
      );
    }
    if (quantity > maxQty) {
      quantity = maxQty;
      tradeCost = Number((optionLastPrice * quantity).toFixed(2));
    }
  }

  if (walletPreview.cashBalance < tradeCost) {
    throw new Error(
      `Paper wallet cash is insufficient. Need ${tradeCost.toFixed(2)} (≈ premium ${optionLastPrice.toFixed(2)} × qty ${quantity}), available ${walletPreview.cashBalance.toFixed(2)}. Reset ledger or raise PAPER_INITIAL_CAPITAL.`
    );
  }

  const signal = {
    symbol: config.niftySymbol,
    direction,
    score: selected.confidence ?? 0,
    status: "TRADEABLE",
    timestamp: new Date().toISOString(),
    entryZone: selected.entryZone,
    stopLoss: selected.stopLoss,
    targets: selected.targets,
    invalidation: selected.invalidation,
    reasons: selected.thesis ?? [],
    spotPrice,
    optionLastPrice,
    option,
    paperSetupId: selected.id ?? null
  };
  const riskCheck = {
    quantity,
    perUnitRisk: Math.abs(selected.entryZone[0] - selected.stopLoss),
    notionalRisk: Number((quantity * optionLastPrice).toFixed(2)),
    checks: [],
    approved: true
  };
  const brokerResponse = {
    ok: true,
    mode: "paper",
    message: "Paper trade entered from dashboard suggestion."
  };
  const position = createPositionRecord(config, signal, riskCheck, brokerResponse);
  try {
    debitPaperEntry(config, position, optionLastPrice);
  } catch (error) {
    removeOpenPosition(config, position.id);
    throw error;
  }
  return {
    position,
    wallet: buildPaperWalletSnapshot(config, listOpenPositions(config)),
    estimatedOptionPrice: optionLastPrice
  };
}

export async function exitPaperPositionPartial(config, positionId, fractionPct) {
  const pct = Number(fractionPct);
  if (![25, 50, 100].includes(pct)) {
    throw new Error("Partial exit supports 25, 50, or 100 percent only.");
  }
  if (pct === 100) {
    return exitPaperPositionNow(config, positionId);
  }

  const positions = listOpenPositions(config);
  const position = positions.find((item) => item.id === positionId);
  if (!position) {
    throw new Error("Paper position not found.");
  }
  if (position.brokerMode && position.brokerMode !== "paper") {
    throw new Error("Partial exit is only supported for paper positions.");
  }

  const lotSize = Math.max(1, config.optionLotSize);
  const qty = Number(position.quantity ?? 0);
  const totalLots = Math.floor(qty / lotSize);
  if (totalLots < 2) {
    throw new Error("Partial exit needs at least 2 lots; use full exit or add size.");
  }

  const lotsToClose = Math.floor((totalLots * pct) / 100);
  if (lotsToClose < 1) {
    throw new Error("This fraction rounds to zero lots for the current size.");
  }

  if (lotsToClose >= totalLots) {
    return exitPaperPositionNow(config, positionId);
  }

  const qtyClose = lotsToClose * lotSize;

  let optionPrice = position.lastObservedOptionPrice ?? position.entryOptionPrice ?? null;
  let spotPrice = position.lastObservedSpot ?? position.entryUnderlying ?? null;

  const canUseBroker = config.zerodha.apiKey && config.zerodha.accessToken && position.option?.tradingsymbol;
  if (canUseBroker) {
    const quoteKeys = [`${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`];
    quoteKeys.push(`${position.option.exchange}:${position.option.tradingsymbol}`);
    const quoteMap = await fetchQuote(config, quoteKeys);
    spotPrice =
      quoteMap[`${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`]?.last_price ?? spotPrice;
    optionPrice =
      quoteMap[`${position.option.exchange}:${position.option.tradingsymbol}`]?.last_price ?? optionPrice;
  }

  if (!(optionPrice > 0)) {
    throw new Error("Live option premium is required for partial exit.");
  }

  const entryPrice = Number(position.entryOptionPrice ?? 0);
  creditPaperPartialExit(config, position, qtyClose, optionPrice);
  recordPaperPartialRealized(config, {
    positionId: position.id,
    quantityClosed: qtyClose,
    entryPrice,
    exitPrice: optionPrice,
    timestamp: new Date().toISOString()
  });

  const remainingQty = qty - qtyClose;
  updateOpenPosition(config, positionId, (cur) => ({
    ...cur,
    quantity: remainingQty,
    lots: Math.max(1, Math.round(remainingQty / lotSize)),
    lastObservedSpot: spotPrice,
    lastObservedOptionPrice: optionPrice
  }));

  appendDayJournal(config, {
    kind: "PAPER_PARTIAL_EXIT",
    positionId,
    fractionPct: pct,
    quantityClosed: qtyClose,
    option: position.option?.tradingsymbol ?? null
  });

  const nextOpen = listOpenPositions(config).find((p) => p.id === positionId);
  return {
    partial: true,
    quantityClosed: qtyClose,
    remainingQuantity: remainingQty,
    position: nextOpen ? buildPositionSummary(nextOpen, config) : null,
    wallet: buildPaperWalletSnapshot(config, listOpenPositions(config)),
    optionPrice,
    spotPrice
  };
}

export async function exitPaperPositionNow(config, positionId) {
  const positions = listOpenPositions(config);
  const position = positions.find((item) => item.id === positionId);
  if (!position) {
    throw new Error("Paper position not found.");
  }

  let optionPrice = position.lastObservedOptionPrice ?? position.entryOptionPrice ?? null;
  let spotPrice = position.lastObservedSpot ?? position.entryUnderlying ?? null;

  const canUseBroker = config.zerodha.apiKey && config.zerodha.accessToken && position.option?.tradingsymbol;
  if (canUseBroker) {
    const quoteKeys = [`${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`];
    if (position.option?.tradingsymbol) {
      quoteKeys.push(`${position.option.exchange}:${position.option.tradingsymbol}`);
    }
    const quoteMap = await fetchQuote(config, quoteKeys);
    spotPrice = quoteMap[`${config.niftyIndex.exchange}:${config.niftyIndex.tradingsymbol}`]?.last_price ?? spotPrice;
    if (position.option?.tradingsymbol) {
      optionPrice = quoteMap[`${position.option.exchange}:${position.option.tradingsymbol}`]?.last_price ?? optionPrice;
    }
  }

  const closed = closePositionRecord(config, position.id, {
    reason: "MANUAL_PAPER_EXIT",
    spotPrice,
    optionPrice,
    brokerOrderId: null,
    brokerMode: "paper"
  });
  if (!closed) {
    throw new Error("Unable to close paper position.");
  }

  recordTradeExit(config, closed);
  creditPaperExit(config, closed, optionPrice);

  return {
    closedPosition: buildPositionSummary(closed, config),
    wallet: buildPaperWalletSnapshot(config, listOpenPositions(config)),
    optionPrice,
    spotPrice
  };
}

export async function checkSessionRun(config) {
  const profile = await fetchProfile(config);
  return {
    status: "SESSION_OK",
    checkedAt: new Date().toISOString(),
    profile: {
      userId: profile.user_id,
      userName: profile.user_name,
      email: profile.email,
      broker: profile.broker,
      exchanges: profile.exchanges
    }
  };
}

export async function reconcileBrokerRun(config) {
  const [profile, orders, brokerPositions, trades] = await Promise.all([
    fetchProfile(config),
    fetchOrders(config),
    fetchPositions(config),
    fetchTrades(config).catch(() => [])
  ]);

  const localOpen = listOpenPositions(config);
  const localClosed = listClosedPositions(config);

  const reconciledOpen = await Promise.all(
    localOpen.map(async (position) => {
      const sym = position.option?.tradingsymbol;
      const brokerOrder = position.brokerOrderId
        ? orders.find((order) => String(order.order_id) === String(position.brokerOrderId))
        : orders.find((order) => order.tradingsymbol === sym);
      const brokerHistory =
        brokerOrder?.order_id ? await fetchOrderHistory(config, brokerOrder.order_id) : [];
      const brokerNetPosition = brokerPositions.net.find((item) => item.tradingsymbol === sym);
      const todayTrades = sym ? summarizeTradesForSymbol(trades, sym) : null;

      return {
        localId: position.id,
        localStatus: position.status,
        localOption: sym ?? position.symbol,
        brokerOrderId: brokerOrder?.order_id ?? position.brokerOrderId ?? null,
        brokerOrderStatus: brokerOrder?.status ?? "NOT_FOUND",
        brokerFilledQuantity: brokerOrder?.filled_quantity ?? 0,
        brokerAveragePrice: brokerOrder?.average_price ?? null,
        brokerNetQuantity: brokerNetPosition?.quantity ?? 0,
        historyStates: brokerHistory.map((item) => item.status),
        todayTrades
      };
    })
  );

  const recentClosed = localClosed.slice(-12).map((c) => {
    const sym = c.option?.tradingsymbol;
    const oid = c.exit?.brokerOrderId;
    const exitLegs = oid ? trades.filter((t) => String(t.order_id) === String(oid)) : [];
    let brokerPremiumPnLFromExitFills = null;
    if (exitLegs.length && c.entryOptionPrice != null) {
      const sellQty = exitLegs.reduce((s, t) => s + Number(t.quantity ?? 0), 0);
      const sellVal = exitLegs.reduce(
        (s, t) => s + Number(t.quantity ?? 0) * Number(t.average_price ?? 0),
        0
      );
      const avgSell = sellQty > 0 ? sellVal / sellQty : null;
      if (avgSell != null) {
        brokerPremiumPnLFromExitFills = Number(
          ((avgSell - Number(c.entryOptionPrice)) * Number(c.quantity ?? 0)).toFixed(2)
        );
      }
    }
    return {
      localId: c.id,
      option: sym,
      exitOrderId: oid ?? null,
      exitTradeLegs: exitLegs.length,
      brokerPremiumPnLFromExitFills,
      localExitOptionMark: c.exit?.optionFillPrice ?? c.exit?.optionPrice ?? null
    };
  });

  return {
    status: "RECONCILED",
    checkedAt: new Date().toISOString(),
    profile: {
      userId: profile.user_id,
      userName: profile.user_name
    },
    totals: {
      localOpen: localOpen.length,
      localClosed: localClosed.length,
      brokerOrdersToday: orders.length,
      brokerTradesToday: trades.length,
      brokerNetPositions: brokerPositions.net.length
    },
    openPositions: reconciledOpen,
    closedFillHints: recentClosed
  };
}
