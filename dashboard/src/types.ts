export type DualSideSetup = {
  score?: number;
  status?: string;
  confirmationCount?: number;
  confirmations?: {
    trendAligned?: boolean;
    breakoutConfirmed?: boolean;
    momentumConfirmed?: boolean;
    structureHeld?: boolean;
    candleBodyConfirmed?: boolean;
    minimumRequired?: number;
  };
  entryZone?: number[];
  stopLoss?: number;
  targets?: number[];
  reasons?: string[];
  invalidation?: string;
};

export type SignalPayload = {
  direction?: string;
  status?: string;
  score?: number;
  entryZone?: number[];
  stopLoss?: number;
  targets?: number[];
  reasons?: string[];
  /** Patient-discipline filter notes (also appended to `reasons`) */
  disciplineNotes?: string[];
  spotPrice?: number;
  option?: { tradingsymbol?: string };
  dualSide?: { call?: DualSideSetup; put?: DualSideSetup };
  confirmations?: {
    trendAligned?: boolean;
    breakoutConfirmed?: boolean;
    momentumConfirmed?: boolean;
    structureHeld?: boolean;
    candleBodyConfirmed?: boolean;
    count?: number;
    minimumRequired?: number;
  };
  indicators?: {
    latestClose?: number;
    sma9?: number;
    sma20?: number;
    vwap?: number;
    recentHigh?: number;
    recentLow?: number;
    candleBody?: number;
    averageRecentMove?: number;
  };
  technicals?: TechnicalsPayload | null;
};

export type PositionRecord = {
  id?: string;
  paperSetupId?: string | null;
  createdAt?: string;
  closedAt?: string;
  option?: {
    tradingsymbol?: string;
    exchange?: string;
    strike?: number | string;
    instrument_type?: string;
    expiry?: string;
  };
  symbol?: string;
  quantity?: number;
  lots?: number;
  direction?: string;
  entryUnderlying?: number;
  entryOptionPrice?: number | null;
  activeStopLoss?: number;
  activeOptionStopLoss?: number | null;
  target1?: number;
  target2?: number;
  optionTarget1?: number | null;
  optionTarget2?: number | null;
  lastObservedSpot?: number | null;
  lastObservedOptionPrice?: number | null;
  /** ISO time when this row was last included in a successful quote batch */
  lastQuoteAt?: string | null;
  exit?: {
    reason?: string;
    spotPrice?: number;
    optionPrice?: number;
    optionFillPrice?: number;
    brokerMode?: string;
    brokerOrderId?: string | null;
    fillStatus?: string;
  };
  brokerMode?: string;
};

export type ArtifactStatus = {
  status?: string;
  reason?: string;
  command?: string;
  timestamp?: string;
  signal?: SignalPayload;
};

export type PaperAnalyticsTradeRow = {
  id?: string;
  option?: string;
  direction?: string;
  closedAt?: string;
  setupId?: string | null;
  entryPremium?: number;
  exitPremium?: number;
  quantity?: number;
  pnl?: number | null;
  outcome?: string;
  exitReason?: string | null;
};

export type PaperSetupBreakdownRow = {
  setupId?: string;
  count?: number;
  wins?: number;
  losses?: number;
  breakeven?: number;
  totalPnl?: number;
  winRatePct?: number | null;
};

export type PaperAnalyticsSummary = {
  closedCount?: number;
  withPnlCount?: number;
  wins?: number;
  losses?: number;
  breakeven?: number;
  winRatePct?: number | null;
  totalRealizedPnl?: number;
  trades?: PaperAnalyticsTradeRow[];
  bySetupRows?: PaperSetupBreakdownRow[];
};

export type NoticeTone = "success" | "warning" | "error" | "info";

export type Notice = {
  id: number;
  tone: NoticeTone;
  title: string;
  message: string;
};

export type CryptoPrediction = {
  id: string;
  side: string;
  analog: string;
  confidence: number;
  entryZone: number[];
  stopLoss: number;
  targets: number[];
  thesis: string[];
  lesson: string;
  invalidation: string;
  verification?: {
    outcome?: string;
    notes?: string;
    updatedAt?: string | null;
  };
};

export type CryptoDashboardState = {
  generatedAt?: string;
  status?: string;
  mode?: string;
  market?: {
    asset?: string;
    venue?: string;
    bias?: string;
    latestClose?: number | null;
    previousClose?: number | null;
    change?: number | null;
    changePct?: number | null;
  };
  charts?: {
    source?: string;
    note?: string;
    candles?: Array<{ time?: string; timestamp?: string; open: number; high: number; low: number; close: number; volume: number }>;
    line?: Array<{ time: string; value: number }>;
  };
  indicators?: {
    sma9?: number | null;
    sma20?: number | null;
    recentHigh?: number | null;
    recentLow?: number | null;
    momentumPct?: number | null;
    bias?: string;
  };
  learning?: {
    objective?: string;
    guide?: string[];
    chartReadingSteps?: string[];
  };
  predictions?: CryptoPrediction[];
  news?: {
    summary?: { bias?: string; bullish?: number; bearish?: number; neutral?: number; score?: number };
    headlines?: Array<{
      title: string;
      link: string;
      pubDate?: string;
      source?: string;
      sentiment?: string;
      sentimentScore?: number;
      sourceWeight?: number;
    }>;
    error?: string | null;
  };
};

export type TechnicalsPayload = {
  rsi?: {
    value?: number | null;
    history?: number[];
  } | null;
  macd?: {
    macd?: number | null;
    signal?: number | null;
    histogram?: number | null;
    history?: Array<{ macd: number; signal: number; histogram: number }>;
  } | null;
  bollingerBands?: {
    upper?: number;
    middle?: number;
    lower?: number;
    position?: number;
    zone?: string;
    bandLabel?: string;
  } | null;
  atr?: {
    value?: number | null;
    history?: number[];
  } | null;
  supertrend?: {
    value?: number | null;
    trend?: "up" | "down" | null;
    upperBand?: number | null;
    lowerBand?: number | null;
    history?: Array<{ value: number; trend: string; upper: number; lower: number; close: number }>;
  } | null;
};

export type MultiTimeframeRow = {
  interval?: string;
  rsi?: number | null;
  rsiDir?: "Bull" | "Bear" | "Neutral" | null;
  supertrendDir?: "Bull" | "Bear" | null;
  vwapPos?: "Above" | "Below" | null;
  bias?: string;
  stValue?: number | null;
};

export type TradeSetupCard = {
  id?: string;
  action?: string;
  direction?: string;
  strikeType?: string;
  tradeLegLabel?: string;
  confidence?: number;
  estimatedPremium?: number | null;
  currentPremium?: number | null;
  slPremium?: number | null;
  slUnderlying?: number | null;
  target1Underlying?: number | null;
  target2Underlying?: number | null;
  target1Premium?: number | null;
  target2Premium?: number | null;
  riskPerLot?: number | null;
  rewardPerLot?: number | null;
  rrRatio?: number | null;
  lotSize?: number;
  atrValue?: number | null;
  supertrendDir?: "up" | "down" | null;
  supertrendValue?: number | null;
  thesis?: string[];
  aiSummary?: string;
  entryZone?: number[];
  stopLoss?: number;
  targets?: number[];
};

export type OptionChainRow = {
  strike?: number;
  ceOi?: number;
  ceChg?: number;
  cePremium?: number | null;
  ceIv?: number | null;
  ceSymbol?: string;
  peOi?: number;
  peChg?: number;
  pePremium?: number | null;
  peIv?: number | null;
  peSymbol?: string;
  pcr?: number | null;
  bias?: string;
};

export type OptionChainPayload = {
  rows?: OptionChainRow[];
  totalCeOi?: number;
  totalPeOi?: number;
  pcr?: number | null;
  callVolumePct?: number | null;
  putVolumePct?: number | null;
  atmStrike?: number;
  indexLabel?: string;
};

export type DashboardState = {
  config: {
    botMode: string;
    optionLotSize?: number;
    niftySymbol?: string;
    marketTimezone?: string;
    minSignalScore?: number;
    marketHours?: {
      openHour?: number;
      openMinute?: number;
      closeHour?: number;
      closeMinute?: number;
    };
    zerodhaRedirectUrl?: string;
    tradeDiscipline?: string;
    marketSessionStrict?: boolean;
    trailingStopUnderlyingPoints?: number;
    monitorRequireTradeSession?: boolean;
    autoSignals?: {
      enabled?: boolean;
      intervalMinutes?: number;
      /** When positive, scheduler may run between interval ticks when spot moves this % vs last run */
      spotMovePct?: number;
    };
    /** Max paper BUY entries per IST day (0 = unlimited). */
    dailyTradeSlotLimit?: number;
    /** Ledger starts here after a reset; does not change existing `paper-wallet.json` by itself. */
    paperInitialCapital?: number;
    paperDefaultLots?: number;
    paperMaxTradeRupees?: number;
    paperMaxTradePctWallet?: number;
    paperCooldownLossCountToday?: number;
    paperCooldownMaxDailyLossRupees?: number;
    dashboardBroadcastMsIdle?: number;
    dashboardBroadcastMsOpen?: number;
    quoteStaleAfterMs?: number;
    /** Zerodha product e.g. MIS */
    orderProduct?: string;
  };
  sessionHealth?: {
    ok?: boolean;
    mode?: string;
    message?: string;
    checkedAt?: string;
    profile?: {
      userId?: string;
      userName?: string;
      email?: string;
      broker?: string;
    } | null;
  };
  runtime: {
    signals?: ArtifactStatus;
    session?: {
      status?: string;
      profile?: {
        userName?: string;
        userId?: string;
        email?: string;
        exchanges?: string[];
      };
    };
    positions?: {
      open?: PositionRecord[];
      closed?: PositionRecord[];
    };
    monitor?: { status?: string; spotPrice?: number };
    reconcile?: { status?: string; totals?: { localOpen?: number } };
    backtest?: {
      generatedAt?: string;
      stats?: {
        totalSignals?: number;
        closedSignals?: number;
        wins?: number;
        losses?: number;
        winRate?: number;
        avgWinR?: number;
        avgLossR?: number;
        expectancyR?: number;
        totalRewardRisk?: number;
        maxDrawdownR?: number;
      };
    };
    forwardReview?: {
      status?: string;
      reviewedAt?: string;
      pendingCount?: number;
      resolvedCount?: number;
      resolvedNow?: Array<{ id?: string; outcome?: string }>;
    };
    forwardTracker?: {
      pending?: Array<{ id?: string; direction?: string; score?: number }>;
      resolved?: Array<{ id?: string; outcome?: string }>;
    };
    /** Last successful bulk quote time for open-book marks (ISO) */
    quoteBulkLastAt?: string | null;
    paperWallet?: {
      initialCapital?: number;
      cashBalance?: number;
      realizedPnL?: number;
      openPositionsValue?: number;
      unrealizedPnL?: number;
      equity?: number;
      transactions?: Array<{
        id?: string;
        type?: string;
        timestamp?: string;
        option?: string;
        quantity?: number;
        optionPrice?: number;
        amount?: number;
        realizedPnL?: number;
        cashBalanceAfter?: number;
      }>;
    };
    validationSummary?: {
      generatedAt?: string;
      stats?: {
        totalSignals?: number;
        closedSignals?: number;
        wins?: number;
        losses?: number;
        winRate?: number;
        avgWinR?: number;
        avgLossR?: number;
        expectancyR?: number;
        totalRewardRisk?: number;
        maxDrawdownR?: number;
      };
      lastFiveTrades?: Array<{
        timestamp?: string;
        direction?: string;
        outcome?: string;
        rewardRisk?: number;
      }>;
    };
    autotrade?: { brokerResponse?: { message?: string } };
    tickets?: { ticket?: { estimatedRisk?: string } };
    autoSignalScheduler?: {
      lastRunAt?: string | null;
      lastSpotAtRun?: number | null;
      lastError?: {
        at?: string;
        message?: string;
        type?: string;
      } | null;
      history?: Array<{
        at?: string;
        reason?: string;
        direction?: string;
        status?: string;
        score?: number;
        spot?: number;
        option?: string;
        source?: string;
      }>;
    };
      tradingDay?: {
        tradingDate?: string;
        timezone?: string;
        dailyTradeSlotLimit?: number;
        journal?: {
          tradingDate?: string;
          entries?: Array<{
            at?: string;
            kind?: string;
            setupId?: string;
            action?: string;
            positionId?: string | null;
            option?: string | null;
            reason?: string | null;
          }>;
        };
        stats?: {
          paperBuysToday?: number;
          openNow?: number;
          openedTodayCount?: number;
          closedTodayCount?: number;
          journalEntryCount?: number;
          atPaperBuyLimit?: boolean;
        };
      };
      paperAnalytics?: PaperAnalyticsSummary;
    deskPolicy?: {
      blocked?: boolean;
      reasons?: string[];
      noNewEntries?: { active?: boolean; source?: string | null; updatedAt?: string | null };
      cooldown?: {
        blocked?: boolean;
        reason?: string | null;
        stats?: { lossCountToday?: number; realizedPnlToday?: number };
      };
    };
    appliedSuggestion?: {
      appliedAt?: string;
      suggestion?: {
        id?: string;
        action?: string;
        confidence?: number;
        entryZone?: number[];
        stopLoss?: number;
        targets?: number[];
      };
      newsBias?: string;
    };
    aiAnalysis?: {
      status?: string;
      reason?: string;
      generatedAt?: string;
      model?: string;
      analysis?: {
        market_regime?: string;
        headline_bias?: string;
        preferred_setup_id?: string;
        confidence?: number;
        summary?: string;
        risk_note?: string;
        call_buy?: {
          verdict?: string;
          entry_zone?: number[];
          stop_loss?: number;
          targets?: number[];
          reasoning?: string[];
        };
        put_buy?: {
          verdict?: string;
          entry_zone?: number[];
          stop_loss?: number;
          targets?: number[];
          reasoning?: string[];
        };
      };
    };
  };
  intelligence?: {
    status?: string;
    reason?: string;
    technicals?: TechnicalsPayload | null;
    pcr?: number | null;
    callVolumePct?: number | null;
    putVolumePct?: number | null;
    indiaVix?: number | null;
    maxPain?: number | null;
    ivAtm?: number | null;
    multiTimeframe?: MultiTimeframeRow[] | null;
    tradeSetups?: TradeSetupCard[] | null;
    optionChain?: OptionChainPayload | null;
    marketMove?: {
      spot?: number;
      previousClose?: number;
      change?: number;
      changePct?: number;
    };
    openingContext?: {
      openPrice?: number | null;
      gapFromOpenPct?: number | null;
      gapFromPrevClosePct?: number | null;
      openVsPrevCloseGapPct?: number | null;
      regime?: string;
      hint?: string;
    };
    strikeLadder?: {
      atmStrike?: number;
      indexLabel?: string;
      rows?: Array<{
        id?: string;
        action?: string;
        strike?: number;
        premium?: number;
        tradeLegLabel?: string;
        moneynessLabel?: string;
        strikeOffsetSteps?: number;
      }>;
    };
    atmOptions?: {
      callSymbol?: string | null;
      putSymbol?: string | null;
      callPremium?: number | null;
      putPremium?: number | null;
      fetchError?: string | null;
    };
    news?: {
      summary?: {
        bias?: string;
        bullish?: number;
        bearish?: number;
        neutral?: number;
        score?: number;
        dominantThemes?: string[];
      };
      headlines?: Array<{
        title: string;
        link: string;
        pubDate?: string;
        source?: string;
        sentiment?: string;
        sentimentScore?: number;
        sourceWeight?: number;
      }>;
      error?: string | null;
    };
    suggestions?: {
      preferredSide?: string;
      preferredConfidence?: number;
      caution?: string;
      call?: { confidence?: number; reasons?: string[] };
      put?: { confidence?: number; reasons?: string[] };
    };
    actionableSuggestions?: Array<{
      id: string;
      tradeLegLabel?: string;
      strikeOffsetSteps?: number;
      action: string;
      confidence: number;
      status: string;
      entryZone: number[];
      stopLoss: number;
      targets: number[];
      premiumEntryZone?: number[] | null;
      premiumStopLoss?: number | null;
      premiumTargets?: number[];
      currentPremium?: number | null;
      chartContext?: {
        support?: number | null;
        resistance?: number | null;
        gapPct?: number;
        gapFromOpenPct?: number | null;
        sessionOpen?: number | null;
        openVsPrevCloseGapPct?: number | null;
        sessionRegime?: string | null;
        openingHint?: string | null;
        structure?: string;
      };
      invalidation: string;
      thesis: string[];
      aiSummary: string;
      reasoningScore: string;
    }>;
  };
  charts?: {
    source?: string;
    note?: string;
    marketOpenNow?: boolean;
    candles?: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }>;
    line?: Array<{ time: string; value: number }>;
    pnlHistory?: Array<{ date: string; realizedPnL: number; tradesPlaced: number }>;
  };
};

export type WsState = "connecting" | "live" | "offline";

export const COMMANDS = [
  { label: "Check Session", command: "check-session", className: "bg-slate-900 text-white" },
  { label: "Run Signals", command: "signals", className: "bg-teal-700 text-white" },
  { label: "Run Auto Trade", command: "autotrade", className: "bg-amber-600 text-white" },
  { label: "Monitor Positions", command: "monitor", className: "bg-sky-700 text-white" },
  { label: "Run Backtest", command: "backtest", className: "bg-indigo-700 text-white" },
  { label: "Review Forward", command: "review-forward", className: "bg-violet-700 text-white" },
  { label: "Reconcile Broker", command: "reconcile", className: "bg-white text-slate-900 ring-1 ring-slate-200" },
  { label: "Smoke Test", command: "smoke", className: "bg-white text-slate-900 ring-1 ring-slate-200" }
] as const;
