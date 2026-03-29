import fs from "node:fs";
import path from "node:path";

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);
}

export function formatTimestamp(timestamp, timezone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: timezone
  }).format(new Date(timestamp));
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function isMarketOpen(timestamp, config) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.marketTimezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(timestamp));

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = values.weekday;
  const hour = Number(values.hour);
  const minute = Number(values.minute);
  const currentMinutes = hour * 60 + minute;
  const openMinutes = config.marketHours.openHour * 60 + config.marketHours.openMinute;
  const closeMinutes = config.marketHours.closeHour * 60 + config.marketHours.closeMinute;

  return !["Sat", "Sun"].includes(weekday) && currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}
