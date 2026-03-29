import {
  fetchOrderHistory,
  fetchOrders,
  fetchPositions,
  fetchProfile,
  fetchQuote,
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
import { buildPaperWalletSnapshot, creditPaperExit, debitPaperEntry } from "./paperWallet.js";
import { readForwardTracker, registerForwardSignal, reviewForwardSignals } from "./forwardTracker.js";
import { analyzeSignal } from "./signalEngine.js";
import { applyTradeDiscipline } from "./signalDiscipline.js";
import { buildRiskCheck, recordTradeExit, recordTradePlacement } from "./riskManager.js";
import { buildManualTicket, buildPositionSummary } from "./reporters.js";
import { placeOrder } from "./zerodhaClient.js";

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

function buildPaperOption(config, signal, spotPrice) {
  const strike = Math.round(spotPrice / config.optionSelection.strikeStep) * config.optionSelection.strikeStep;
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
  const callOption = selectOptionContract(config, instruments, pseudoCall, spotPrice, ts);
  const putOption = selectOptionContract(config, instruments, pseudoPut, spotPrice, ts);
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
    const evaluation = evaluateExit(position, spotPrice, optionPrice);

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
      const closed = closePositionRecord(config, position.id, {
        reason: evaluation.exitReason,
        spotPrice,
        optionPrice,
        brokerOrderId: brokerResponse.brokerOrder?.order_id ?? null,
        brokerMode: brokerResponse.mode
      });
      const realizedPnL = closed ? recordTradeExit(config, closed) : null;
      if (closed && brokerResponse.mode === "paper") {
        creditPaperExit(config, closed, optionPrice);
      }

      updates.push({
        id: position.id,
        action: "EXITED",
        exitReason: evaluation.exitReason,
        spotPrice,
        optionPrice,
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

    updates.push({
      id: position.id,
      action: updated?.target1Hit && !position.target1Hit ? "TRAILING_STOP_ARMED" : "HELD",
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
  const lots = Math.max(1, config.paperTrading.defaultLots);
  const quantity = lots * config.optionLotSize;
  const spotPrice = Number(intelligence.marketMove?.spot ?? selected.entryZone?.[0] ?? 0);
  const direction = selected.action === "CALL BUY" ? "CALL" : "PUT";
  let option = buildPaperOption(config, { direction }, spotPrice);
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
      new Date().toISOString()
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
    option
  };
  const riskCheck = {
    quantity,
    perUnitRisk: Math.abs(selected.entryZone[0] - selected.stopLoss),
    notionalRisk: quantity * optionLastPrice,
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
  const [profile, orders, brokerPositions] = await Promise.all([
    fetchProfile(config),
    fetchOrders(config),
    fetchPositions(config)
  ]);

  const localOpen = listOpenPositions(config);
  const localClosed = listClosedPositions(config);

  const reconciledOpen = await Promise.all(
    localOpen.map(async (position) => {
      const brokerOrder = position.brokerOrderId
        ? orders.find((order) => String(order.order_id) === String(position.brokerOrderId))
        : orders.find((order) => order.tradingsymbol === position.option?.tradingsymbol);
      const brokerHistory =
        brokerOrder?.order_id ? await fetchOrderHistory(config, brokerOrder.order_id) : [];
      const brokerNetPosition = brokerPositions.net.find(
        (item) => item.tradingsymbol === position.option?.tradingsymbol
      );

      return {
        localId: position.id,
        localStatus: position.status,
        localOption: position.option?.tradingsymbol ?? position.symbol,
        brokerOrderId: brokerOrder?.order_id ?? position.brokerOrderId ?? null,
        brokerOrderStatus: brokerOrder?.status ?? "NOT_FOUND",
        brokerFilledQuantity: brokerOrder?.filled_quantity ?? 0,
        brokerAveragePrice: brokerOrder?.average_price ?? null,
        brokerNetQuantity: brokerNetPosition?.quantity ?? 0,
        historyStates: brokerHistory.map((item) => item.status)
      };
    })
  );

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
      brokerNetPositions: brokerPositions.net.length
    },
    openPositions: reconciledOpen
  };
}
