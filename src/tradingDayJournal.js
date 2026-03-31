import path from "node:path";
import { ensureDir, readJson, writeJson } from "./utils.js";

export function tradingDateKeyIST(config) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.marketTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function dayJournalPath(config, dateKey) {
  return path.join(config.runtimeDir, "journals", `day-${dateKey}.json`);
}

/** One file per IST calendar day; entries accumulate until the next day (new file). */
export function loadDayJournal(config, dateKey = tradingDateKeyIST(config)) {
  const p = dayJournalPath(config, dateKey);
  const data = readJson(p, null);
  if (!data || data.tradingDate !== dateKey) {
    return { tradingDate: dateKey, entries: [] };
  }
  return { tradingDate: data.tradingDate, entries: Array.isArray(data.entries) ? data.entries : [] };
}

export function appendDayJournal(config, entry) {
  const dateKey = tradingDateKeyIST(config);
  ensureDir(path.join(config.runtimeDir, "journals"));
  const p = dayJournalPath(config, dateKey);
  const data = loadDayJournal(config, dateKey);
  data.entries.push({
    at: new Date().toISOString(),
    ...entry
  });
  writeJson(p, data);
  return data;
}

export function countPaperBuysToday(config) {
  const journal = loadDayJournal(config);
  return journal.entries.filter((e) => e.kind === "PAPER_BUY").length;
}

export function buildTradingDayExport(config, positions) {
  const dateKey = tradingDateKeyIST(config);
  const journal = loadDayJournal(config, dateKey);
  const fmt = (iso) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: config.marketTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(iso));
  const closedToday = (positions?.closed || []).filter(
    (c) => c.closedAt && fmt(c.closedAt) === dateKey
  );
  return {
    generatedAt: new Date().toISOString(),
    tradingDate: dateKey,
    timezone: config.marketTimezone,
    journal,
    closedTradesToday: closedToday
  };
}

export function buildTradingDayContext(config, positions) {
  const dateKey = tradingDateKeyIST(config);
  const journal = loadDayJournal(config, dateKey);
  const fmt = (iso) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: config.marketTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(iso));

  const closedToday = (positions?.closed || []).filter((c) => c.closedAt && fmt(c.closedAt) === dateKey);
  const openedToday = (positions?.open || []).filter((p) => p.createdAt && fmt(p.createdAt) === dateKey);
  const paperBuysToday = journal.entries.filter((e) => e.kind === "PAPER_BUY").length;

  return {
    tradingDate: dateKey,
    timezone: config.marketTimezone,
    journal,
    dailyTradeSlotLimit: config.dailyTradeSlotLimit,
    stats: {
      paperBuysToday,
      openNow: positions?.open?.length ?? 0,
      openedTodayCount: openedToday.length,
      closedTodayCount: closedToday.length,
      journalEntryCount: journal.entries.length,
      atPaperBuyLimit:
        config.dailyTradeSlotLimit > 0 && paperBuysToday >= config.dailyTradeSlotLimit
    }
  };
}
