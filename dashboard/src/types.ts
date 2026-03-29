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
};

export type PositionRecord = {
  id?: string;
  option?: { tradingsymbol?: string };
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
  lastObservedOptionPrice?: number | null;
  exit?: { reason?: string; spotPrice?: number; brokerMode?: string };
  brokerMode?: string;
};

export type ArtifactStatus = {
  status?: string;
  reason?: string;
  command?: string;
  timestamp?: string;
  signal?: SignalPayload;
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

export type DashboardState = {
  config: {
    botMode: string;
    zerodhaRedirectUrl?: string;
    tradeDiscipline?: string;
    autoSignals?: {
      enabled?: boolean;
      intervalMinutes?: number;
      /** When positive, scheduler may run between interval ticks when spot moves this % vs last run */
      spotMovePct?: number;
    };
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
