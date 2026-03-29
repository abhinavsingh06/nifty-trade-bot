import { placeKiteOrder } from "./kiteApi.js";

export function hasBrokerCredentials(config) {
  return Boolean(
    config.zerodha.apiKey &&
      config.zerodha.accessToken &&
      config.zerodha.userId
  );
}

export async function placeOrder(config, orderRequest) {
  if (!hasBrokerCredentials(config)) {
    return {
      ok: false,
      mode: config.botMode,
      message: "Broker credentials missing. Returning paper trade response.",
      orderRequest
    };
  }

  if (config.botMode !== "live") {
    return {
      ok: true,
      mode: config.botMode,
      message: "Credentials present, but BOT_MODE is not live. Skipping real broker call.",
      orderRequest
    };
  }

  const response = await placeKiteOrder(config, orderRequest);
  return {
    ok: true,
    mode: config.botMode,
    message: "Live Zerodha order submitted.",
    orderRequest,
    brokerOrder: response.data ?? null
  };
}
