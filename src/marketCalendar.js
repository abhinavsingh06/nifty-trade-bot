import fs from "node:fs";
import path from "node:path";
import { isMarketOpen } from "./utils.js";

/**
 * Load holiday set from optional override path, else bundled `data/nse-holidays.json`.
 * @param {string} overridePath env-relative or absolute
 * @param {string} projectRoot
 * @returns {Set<string>}
 */
export function loadNseHolidaySet(overridePath, projectRoot) {
  const candidates = [];
  if (overridePath?.trim()) {
    const p = path.isAbsolute(overridePath)
      ? overridePath
      : path.join(projectRoot, overridePath);
    candidates.push(p);
  }
  candidates.push(path.join(projectRoot, "data", "nse-holidays.json"));

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const dates = Array.isArray(raw) ? raw : raw.dates ?? [];
        return new Set(dates.filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)));
      }
    } catch {
      /* try next */
    }
  }
  return new Set();
}

export function calendarDateKey(timestamp, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

/**
 * Clock-hours session (Mon–Fri window in config.marketTimezone). Weekends excluded.
 * Does not apply holiday list.
 */
export function isWithinMarketClock(timestamp, config) {
  return isMarketOpen(timestamp, config);
}

/**
 * When `config.marketSessionStrict` is true, also blocks NSE dates in `config.nseHolidaySet`.
 * When false, only clock + weekend logic applies (same as `isMarketOpen`).
 */
export function isTradeSessionOpen(timestamp, config) {
  if (!isMarketOpen(timestamp, config)) {
    return false;
  }
  if (!config.marketSessionStrict) {
    return true;
  }
  const key = calendarDateKey(timestamp, config.marketTimezone);
  return !config.nseHolidaySet.has(key);
}
