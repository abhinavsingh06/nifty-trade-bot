import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./utils.js";

export class KiteSessionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "KiteSessionError";
    this.details = details;
  }
}

function buildHeaders(config, includeAuth = true, extraHeaders = {}) {
  const headers = {
    "X-Kite-Version": "3",
    ...extraHeaders
  };

  if (includeAuth) {
    headers.Authorization = `token ${config.zerodha.apiKey}:${config.zerodha.accessToken}`;
  }

  return headers;
}

async function parseResponse(response, expectJson = true) {
  const rawBody = await response.text();
  const body = expectJson ? (rawBody ? JSON.parse(rawBody) : {}) : rawBody;

  if (!response.ok) {
    const message = expectJson ? body.message || response.statusText : response.statusText;
    const errorType = expectJson ? body.error_type : undefined;
    const fullMessage = `Kite API ${response.status}: ${message}`;
    if (response.status === 403 || errorType === "TokenException") {
      throw new KiteSessionError(fullMessage, {
        status: response.status,
        errorType,
        body
      });
    }
    throw new Error(fullMessage);
  }

  return body;
}

export function isSessionExpiredError(error) {
  return error instanceof KiteSessionError;
}

export function getLoginUrl(config, redirectParams = "") {
  if (!config.zerodha.apiKey) {
    throw new Error("ZERODHA_API_KEY is required to build the login URL.");
  }

  const url = new URL("https://kite.zerodha.com/connect/login");
  url.searchParams.set("v", "3");
  url.searchParams.set("api_key", config.zerodha.apiKey);

  if (redirectParams) {
    url.searchParams.set("redirect_params", redirectParams);
  }

  return url.toString();
}

export async function exchangeRequestToken(config, requestToken) {
  if (!config.zerodha.apiKey || !config.zerodha.apiSecret) {
    throw new Error("ZERODHA_API_KEY and ZERODHA_API_SECRET are required for session exchange.");
  }

  const checksum = crypto
    .createHash("sha256")
    .update(`${config.zerodha.apiKey}${requestToken}${config.zerodha.apiSecret}`)
    .digest("hex");

  const response = await fetch(`${config.zerodha.baseUrl}/session/token`, {
    method: "POST",
    headers: buildHeaders(config, false, {
      "Content-Type": "application/x-www-form-urlencoded"
    }),
    body: new URLSearchParams({
      api_key: config.zerodha.apiKey,
      request_token: requestToken,
      checksum
    })
  });

  return parseResponse(response);
}

export async function fetchHistoricalCandles(config, instrumentToken, interval, from, to) {
  const url = new URL(`${config.zerodha.baseUrl}/instruments/historical/${instrumentToken}/${interval}`);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const response = await fetch(url, {
    headers: buildHeaders(config)
  });

  const body = await parseResponse(response);
  return body.data?.candles ?? [];
}

export async function fetchQuote(config, instruments) {
  const url = new URL(`${config.zerodha.baseUrl}/quote`);
  for (const instrument of instruments) {
    url.searchParams.append("i", instrument);
  }

  const response = await fetch(url, {
    headers: buildHeaders(config)
  });

  const body = await parseResponse(response);
  return body.data ?? {};
}

export async function refreshInstruments(config, exchange = "NFO") {
  const response = await fetch(`${config.zerodha.baseUrl}/instruments/${exchange}`, {
    headers: buildHeaders(config)
  });

  const csv = await parseResponse(response, false);
  ensureDir(path.dirname(config.instrumentsCachePath));
  fs.writeFileSync(config.instrumentsCachePath, csv, "utf8");
  return config.instrumentsCachePath;
}

export async function placeKiteOrder(config, orderParams) {
  const response = await fetch(`${config.zerodha.baseUrl}/orders/${orderParams.variety}`, {
    method: "POST",
    headers: buildHeaders(config, true, {
      "Content-Type": "application/x-www-form-urlencoded"
    }),
    body: new URLSearchParams(orderParams)
  });

  return parseResponse(response);
}

export async function fetchProfile(config) {
  const response = await fetch(`${config.zerodha.baseUrl}/user/profile`, {
    headers: buildHeaders(config)
  });

  const body = await parseResponse(response);
  return body.data ?? null;
}

export async function fetchOrders(config) {
  const response = await fetch(`${config.zerodha.baseUrl}/orders`, {
    headers: buildHeaders(config)
  });

  const body = await parseResponse(response);
  return body.data ?? [];
}

export async function fetchOrderHistory(config, orderId) {
  const response = await fetch(`${config.zerodha.baseUrl}/orders/${orderId}`, {
    headers: buildHeaders(config)
  });

  const body = await parseResponse(response);
  return body.data ?? [];
}

export async function fetchPositions(config) {
  const response = await fetch(`${config.zerodha.baseUrl}/portfolio/positions`, {
    headers: buildHeaders(config)
  });

  const body = await parseResponse(response);
  return body.data ?? { net: [], day: [] };
}
