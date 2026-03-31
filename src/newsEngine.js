const DEFAULT_FEED_URL =
  "https://news.google.com/rss/search?q=NIFTY%20OR%20%22NSE%22%20OR%20%22Indian%20stock%20market%22%20OR%20RBI%20OR%20Federal%20Reserve%20when%3A1d&hl=en-IN&gl=IN&ceid=IN:en";

const POSITIVE_HINTS = [
  "surge",
  "rally",
  "gain",
  "upbeat",
  "cooling inflation",
  "rate cut",
  "strong earnings",
  "record high",
  "bullish",
  "supportive",
  "liquidity",
  "gdp growth",
  "fdi",
  "reform",
  "expansion",
  "upgrade",
  "inflows",
  "deal",
  "buyback",
  "dividend hike"
];

const NEGATIVE_HINTS = [
  "fall",
  "slump",
  "crash",
  "selloff",
  "hot inflation",
  "rate hike",
  "war",
  "tension",
  "tariff",
  "weakness",
  "profit booking",
  "bearish",
  "curb",
  "probe",
  "default",
  "outflow",
  "volatility spike",
  "halt",
  "lockdown",
  "guidance cut"
];

const STRONG_POSITIVE_HINTS = [
  "beats estimates",
  "cools more than expected",
  "stimulus",
  "all-time high",
  "eases concern"
];

const STRONG_NEGATIVE_HINTS = [
  "misses estimates",
  "sticky inflation",
  "recession",
  "escalation",
  "crackdown",
  "downgrade"
];

const SOURCE_WEIGHTS = {
  Reuters: 1.6,
  Bloomberg: 1.55,
  "The Economic Times": 1.35,
  CNBC: 1.3,
  Moneycontrol: 1.2,
  "The Indian Express": 1.1,
  "Business Standard": 1.15,
  "The Guardian": 1,
  "News feed": 0.85
};

function decodeXml(text) {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function extractTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function parseRssItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const block = match[1];
    return {
      title: extractTag(block, "title"),
      link: extractTag(block, "link"),
      pubDate: extractTag(block, "pubDate"),
      source: extractTag(block, "source") || "News feed"
    };
  });
}

function matchedThemeTags(textLower) {
  const tags = [];
  for (const hint of POSITIVE_HINTS) {
    if (textLower.includes(hint)) tags.push(`+${hint}`);
  }
  for (const hint of NEGATIVE_HINTS) {
    if (textLower.includes(hint)) tags.push(`-${hint}`);
  }
  for (const hint of STRONG_POSITIVE_HINTS) {
    if (textLower.includes(hint)) tags.push(`++${hint}`);
  }
  for (const hint of STRONG_NEGATIVE_HINTS) {
    if (textLower.includes(hint)) tags.push(`--${hint}`);
  }
  return tags;
}

function scoreHeadline(title) {
  const text = title.toLowerCase();
  let score = 0;

  for (const hint of POSITIVE_HINTS) {
    if (text.includes(hint)) score += 1;
  }

  for (const hint of NEGATIVE_HINTS) {
    if (text.includes(hint)) score -= 1;
  }

  for (const hint of STRONG_POSITIVE_HINTS) {
    if (text.includes(hint)) score += 2;
  }

  for (const hint of STRONG_NEGATIVE_HINTS) {
    if (text.includes(hint)) score -= 2;
  }

  return score;
}

function classifyHeadline(score) {
  if (score >= 2) return "bullish";
  if (score <= -2) return "bearish";
  return "neutral";
}

export async function fetchMarketNews(feedUrl = DEFAULT_FEED_URL, limit = 8) {
  const response = await fetch(feedUrl, {
    headers: {
      "User-Agent": "nifty-zerodha-bot-dashboard/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`News feed request failed with ${response.status}`);
  }

  const xml = await response.text();
  const items = parseRssItems(xml).slice(0, limit);

  return items.map((item) => {
    const sourceWeight = SOURCE_WEIGHTS[item.source] ?? 0.95;
    const recencyWeight = getRecencyWeight(item.pubDate);
    const rawScore = scoreHeadline(item.title);
    const sentimentScore = Number((rawScore * sourceWeight * recencyWeight).toFixed(2));
    const themes = matchedThemeTags(item.title.toLowerCase());
    return {
      ...item,
      sourceWeight,
      recencyWeight,
      rawScore,
      sentimentScore,
      sentiment: classifyHeadline(sentimentScore),
      themes: [...new Set(themes)].slice(0, 6)
    };
  });
}

export function summarizeNews(headlines) {
  const summary = headlines.reduce(
    (acc, headline) => {
      if (headline.sentiment === "bullish") acc.bullish += 1;
      if (headline.sentiment === "bearish") acc.bearish += 1;
      if (headline.sentiment === "neutral") acc.neutral += 1;
      acc.score += headline.sentimentScore;
      return acc;
    },
    { bullish: 0, bearish: 0, neutral: 0, score: 0 }
  );

  let bias = "neutral";
  if (summary.score >= 2.5) bias = "bullish";
  if (summary.score <= -2.5) bias = "bearish";

  const themeFreq = new Map();
  for (const headline of headlines) {
    for (const tag of headline.themes ?? []) {
      const key = tag.replace(/^[+-]{1,2}/, "");
      themeFreq.set(key, (themeFreq.get(key) ?? 0) + 1);
    }
  }
  const dominantThemes = [...themeFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  return {
    ...summary,
    bias,
    dominantThemes
  };
}

function getRecencyWeight(pubDate) {
  if (!pubDate) return 1;
  const published = new Date(pubDate).getTime();
  if (Number.isNaN(published)) return 1;
  const ageHours = Math.max(0, (Date.now() - published) / (1000 * 60 * 60));
  if (ageHours <= 2) return 1.35;
  if (ageHours <= 6) return 1.2;
  if (ageHours <= 12) return 1.08;
  return 0.95;
}

export function buildTradeSuggestions({ signal, marketMove, news }) {
  const newsSupport = news.bias === "bullish" ? 2 : news.bias === "bearish" ? -2 : 0;
  const marketSupport =
    marketMove.changePct >= 0.5 ? 2 : marketMove.changePct <= -0.5 ? -2 : marketMove.changePct >= 0 ? 1 : -1;

  let technicalSkew;
  if (signal.dualSide?.call && signal.dualSide?.put) {
    technicalSkew = (signal.dualSide.call.score - signal.dualSide.put.score) / 2;
  } else {
    technicalSkew = signal.direction === "CALL" ? signal.score / 2 : -(signal.score / 2);
  }

  const combinedBias = newsSupport + marketSupport + technicalSkew;

  const callConfidence = Math.max(0, Math.min(10, 5 + combinedBias));
  const putConfidence = Math.max(0, Math.min(10, 5 - combinedBias));
  const preferredSide = callConfidence >= putConfidence ? "CALL BUY" : "PUT BUY";
  const preferredConfidence = Math.max(callConfidence, putConfidence);

  const callReasons = [];
  const putReasons = [];

  if (marketMove.changePct > 0) callReasons.push(`spot up ${marketMove.changePct.toFixed(2)}% from prior close`);
  if (marketMove.changePct < 0) putReasons.push(`spot down ${Math.abs(marketMove.changePct).toFixed(2)}% from prior close`);
  if (news.bias === "bullish") callReasons.push("headline flow leaning bullish");
  if (news.bias === "bearish") putReasons.push("headline flow leaning bearish");
  if (signal.dualSide?.call && signal.dualSide?.put) {
    callReasons.push(
      `call-side chart score ${signal.dualSide.call.score}/10 (${signal.dualSide.call.confirmationCount}c, ${signal.dualSide.call.status})`
    );
    putReasons.push(
      `put-side chart score ${signal.dualSide.put.score}/10 (${signal.dualSide.put.confirmationCount}c, ${signal.dualSide.put.status})`
    );
  } else {
    if (signal.direction === "CALL") callReasons.push(`technical signal favors call with score ${signal.score}/10`);
    if (signal.direction === "PUT") putReasons.push(`technical signal favors put with score ${signal.score}/10`);
  }
  if ((news.dominantThemes?.length ?? 0) > 0) {
    const themesNote = `recurring headline cues: ${news.dominantThemes.slice(0, 4).join(", ")}`;
    callReasons.push(themesNote);
    putReasons.push(themesNote);
  }

  return {
    preferredSide,
    preferredConfidence: Number(preferredConfidence.toFixed(1)),
    caution:
      news.bias === "neutral" && Math.abs(marketMove.changePct) < 0.25
        ? "News and price move are both muted. Prefer waiting for breakout confirmation."
        : "Use only with your existing risk limits, stop, and market-hours checks.",
    call: {
      action: "CALL BUY",
      confidence: Number(callConfidence.toFixed(1)),
      reasons: callReasons.length ? callReasons : ["Need stronger bullish alignment from price or news."]
    },
    put: {
      action: "PUT BUY",
      confidence: Number(putConfidence.toFixed(1)),
      reasons: putReasons.length ? putReasons : ["Need stronger bearish alignment from price or news."]
    }
  };
}

/** Premium rupee plan: entry band, SL, T1–T3 (matches typical intraday option card layout). */
function buildPremiumSlice3T(premiumRaw) {
  const premium = Number(premiumRaw);
  if (!(premium > 0)) {
    return { premiumEntryZone: null, premiumStopLoss: null, premiumTargets: [], premium: null };
  }
  const R = Math.max(premium * 0.38, 15);
  return {
    premium,
    premiumEntryZone: [Number((premium * 0.985).toFixed(2)), Number((premium * 1.015).toFixed(2))],
    premiumStopLoss: Number(Math.max(premium - R, 0.5).toFixed(2)),
    premiumTargets: [
      Number((premium + R * 0.27).toFixed(2)),
      Number((premium + R * 0.64).toFixed(2)),
      Number((premium + R * 1.14).toFixed(2))
    ]
  };
}

function mergeSuggestionsFromLadder(callSuggestion, putSuggestion, strikeLadder, spot) {
  const fallbackAtm = Number.isFinite(Number(spot)) ? Math.round(Number(spot) / 50) * 50 : 0;
  const indexLabel = strikeLadder?.indexLabel ?? "NIFTY";
  const atmStrike = strikeLadder?.atmStrike ?? fallbackAtm;
  const rows = strikeLadder?.rows;

  if (!rows?.length) {
    return [
      {
        ...callSuggestion,
        strikeOffsetSteps: 0,
        tradeLegLabel: `${indexLabel} ${atmStrike} CE`
      },
      {
        ...putSuggestion,
        strikeOffsetSteps: 0,
        tradeLegLabel: `${indexLabel} ${atmStrike} PE`
      }
    ];
  }

  const byAction = { "CALL BUY": callSuggestion, "PUT BUY": putSuggestion };
  return rows.map((row) => {
    const base = byAction[row.action];
    const plan = buildPremiumSlice3T(row.premium);
    return {
      ...base,
      id: row.id,
      strikeOffsetSteps: row.strikeOffsetSteps,
      tradeLegLabel: row.tradeLegLabel,
      status: row.strikeOffsetSteps === 0 ? base.status : "SECONDARY",
      premiumEntryZone: plan.premiumEntryZone,
      premiumStopLoss: plan.premiumStopLoss,
      premiumTargets: plan.premiumTargets,
      currentPremium: plan.premium,
      thesis: [
        `${row.tradeLegLabel} · ${row.moneynessLabel} — LTP ≈ ₹${plan.premium != null ? plan.premium.toFixed(2) : "—"}.`,
        ...base.thesis.slice(1)
      ]
    };
  });
}

function mergeChartContext(base, openingContext, legStructure) {
  const gapPct = base.gapPct;
  let structure = legStructure;
  if (openingContext?.regime && openingContext.regime !== "regular") {
    structure = `${openingContext.hint} ${legStructure}`;
  }
  return {
    ...base,
    gapFromOpenPct: openingContext?.gapFromOpenPct ?? null,
    sessionOpen: openingContext?.openPrice ?? null,
    openVsPrevCloseGapPct: openingContext?.openVsPrevCloseGapPct ?? null,
    sessionRegime: openingContext?.regime ?? null,
    openingHint: openingContext?.hint ?? null,
    structure
  };
}

export function buildActionableSuggestions({
  signal,
  marketMove,
  news,
  suggestions,
  optionPremiums = null,
  openingContext = null,
  strikeLadder = null
}) {
  const spot = marketMove.spot ?? signal.spotPrice ?? signal.indicators?.latestClose ?? signal.entryZone?.[1] ?? 0;
  const fallbackPremium = Number(signal.optionLastPrice ?? 0);
  const callPremiumLive =
    optionPremiums?.call != null && optionPremiums.call > 0
      ? optionPremiums.call
      : signal.direction === "CALL"
        ? fallbackPremium
        : null;
  const putPremiumLive =
    optionPremiums?.put != null && optionPremiums.put > 0
      ? optionPremiums.put
      : signal.direction === "PUT"
        ? fallbackPremium
        : null;

  const callPremiumPlan = buildPremiumSlice3T(callPremiumLive);
  const putPremiumPlan = buildPremiumSlice3T(putPremiumLive);

  const callBiasBoost = suggestions.call.confidence >= suggestions.put.confidence ? 1 : 0;
  const putBiasBoost = suggestions.put.confidence > suggestions.call.confidence ? 1 : 0;
  const callEntry = Number((spot + Math.max(6, Math.abs(marketMove.change ?? 0) * 0.04)).toFixed(2));
  const putEntry = Number((spot - Math.max(6, Math.abs(marketMove.change ?? 0) * 0.04)).toFixed(2));

  const callStopModel = Number(
    Math.min(callEntry - 22, callEntry - (18 + callBiasBoost * 4)).toFixed(2)
  );
  const putStopModel = Number(
    Math.max(putEntry + 22, putEntry + (18 + putBiasBoost * 4)).toFixed(2)
  );
  const callStop = signal.dualSide?.call?.stopLoss ?? (signal.direction === "CALL" ? signal.stopLoss : callStopModel);
  const putStop = signal.dualSide?.put?.stopLoss ?? (signal.direction === "PUT" ? signal.stopLoss : putStopModel);

  const callRisk = Math.max(1, callEntry - callStop);
  const putRisk = Math.max(1, putStop - putEntry);

  const callTargetsModel = [
    Number((callEntry + callRisk * 1.5).toFixed(2)),
    Number((callEntry + callRisk * 2.4).toFixed(2))
  ];
  const putTargetsModel = [
    Number((putEntry - putRisk * 1.5).toFixed(2)),
    Number((putEntry - putRisk * 2.4).toFixed(2))
  ];
  const callTargets = signal.dualSide?.call?.targets ?? callTargetsModel;
  const putTargets = signal.dualSide?.put?.targets ?? putTargetsModel;

  const resistance = signal.indicators?.recentHigh ?? null;
  const support = signal.indicators?.recentLow ?? null;
  const gapPct =
    marketMove.previousClose && spot
      ? Number((((spot - marketMove.previousClose) / marketMove.previousClose) * 100).toFixed(2))
      : 0;

  const chartBase = { support, resistance, gapPct };

  const callChartCtx = mergeChartContext(
    chartBase,
    openingContext,
    resistance != null ? `Needs breakout acceptance above ${resistance}.` : "Needs breakout acceptance."
  );
  const putChartCtx = mergeChartContext(
    chartBase,
    openingContext,
    support != null ? `Needs breakdown acceptance below ${support}.` : "Needs breakdown acceptance."
  );

  const callTechScore = signal.dualSide?.call?.score ?? (signal.direction === "CALL" ? signal.score : 0);
  const putTechScore = signal.dualSide?.put?.score ?? (signal.direction === "PUT" ? signal.score : 0);

  const callSuggestion = {
      id: "call-buy",
      action: "CALL BUY",
      confidence: suggestions.call.confidence,
      status: suggestions.preferredSide === "CALL BUY" ? "PRIMARY" : "SECONDARY",
      entryZone: [Number((callEntry - 5).toFixed(2)), Number((callEntry + 4).toFixed(2))],
      stopLoss: callStop,
      targets: callTargets,
      premiumEntryZone: callPremiumPlan.premiumEntryZone,
      premiumStopLoss: callPremiumPlan.premiumStopLoss,
      premiumTargets: callPremiumPlan.premiumTargets,
      currentPremium: callPremiumPlan.premium,
      chartContext: callChartCtx,
      invalidation:
        signal.dualSide?.call?.invalidation ??
        "Abort if price loses intraday strength and slips below the proposed stop.",
      thesis: [
        signal.dualSide?.call
          ? `Call-side engine: score ${signal.dualSide.call.score}/10, status ${signal.dualSide.call.status}, ${signal.dualSide.call.confirmationCount} confirmations.`
          : `Dominant technical bias: ${signal.direction} (${signal.score}/10).`,
        news.bias === "bullish" ? "Headline flow is supporting upside continuation." : "News is not strongly bullish, so confirmation matters.",
        marketMove.changePct >= 0
          ? `Spot is ${marketMove.changePct.toFixed(2)}% vs prior close.`
          : "Spot is below prior close — prefer reclaim before aggressive call buys.",
        callPremiumPlan.premium != null
          ? `CE premium (ref) ≈ ₹${callPremiumPlan.premium} — SL / T1–T3 on premium row below.`
          : "Call premium unavailable — run signals with live auth or refresh dashboard."
      ],
      aiSummary:
        news.bias === "bullish" || callTechScore >= putTechScore
          ? "Momentum-style call if buyers hold the open/gap structure and CE premium participates."
          : "Treat as counter-trend call only unless breadth reclaims key intraday highs.",
      reasoningScore: Number(
        (callTechScore + suggestions.call.confidence + Math.max(0, news.score ?? 0)) / 3
      ).toFixed(1)
    };
  const putSuggestion = {
      id: "put-buy",
      action: "PUT BUY",
      confidence: suggestions.put.confidence,
      status: suggestions.preferredSide === "PUT BUY" ? "PRIMARY" : "SECONDARY",
      entryZone: [Number((putEntry - 4).toFixed(2)), Number((putEntry + 5).toFixed(2))],
      stopLoss: putStop,
      targets: putTargets,
      premiumEntryZone: putPremiumPlan.premiumEntryZone,
      premiumStopLoss: putPremiumPlan.premiumStopLoss,
      premiumTargets: putPremiumPlan.premiumTargets,
      currentPremium: putPremiumPlan.premium,
      chartContext: putChartCtx,
      invalidation:
        signal.dualSide?.put?.invalidation ??
        "Abort if price reclaims the breakdown zone and trades above the stop.",
      thesis: [
        signal.dualSide?.put
          ? `Put-side engine: score ${signal.dualSide.put.score}/10, status ${signal.dualSide.put.status}, ${signal.dualSide.put.confirmationCount} confirmations.`
          : `Dominant technical bias: ${signal.direction} (${signal.score}/10).`,
        news.bias === "bearish" ? "Headline flow is supporting downside continuation." : "News is not strongly bearish, so breakdown confirmation matters.",
        marketMove.changePct < 0
          ? `Spot is ${Math.abs(marketMove.changePct).toFixed(2)}% under prior close.`
          : "Spot is above prior close — prefer failed rallies before aggressive put buys.",
        putPremiumPlan.premium != null
          ? `PE premium (ref) ≈ ₹${putPremiumPlan.premium} — SL / T1–T3 on premium row below.`
          : "Put premium unavailable — run signals with live auth or refresh dashboard."
      ],
      aiSummary:
        news.bias === "bearish" || putTechScore > callTechScore
          ? "Momentum-style put if sellers press below the open/gap structure and PE premium participates."
          : "Treat as hedge/fade put unless price loses nearby support with follow-through.",
      reasoningScore: Number(
        (putTechScore + suggestions.put.confidence + Math.max(0, -(news.score ?? 0))) / 3
      ).toFixed(1)
    };

  return mergeSuggestionsFromLadder(callSuggestion, putSuggestion, strikeLadder, spot);
}
