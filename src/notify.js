import { getEnv } from "./config.js";

/**
 * POST JSON to NOTIFY_WEBHOOK_URL — point this at n8n, Zapier, or your own
 * bridge that forwards to WhatsApp (Twilio, Meta Cloud API, CallMeBot, etc.).
 */
export async function notifyTradeableSignal(config, signal) {
  const url = getEnv("NOTIFY_WEBHOOK_URL", "").trim();
  if (!url || signal.status !== "TRADEABLE") {
    return;
  }

  const lines = [
    `NIFTY bot: ${signal.direction} TRADEABLE`,
    `Score ${signal.score}/10 • Spot ${signal.spotPrice ?? signal.indicators?.latestClose ?? "-"}`,
    signal.option?.tradingsymbol ? `Option ${signal.option.tradingsymbol}` : null,
    signal.reasons?.length ? `Notes: ${signal.reasons.slice(0, 2).join(" | ")}` : null
  ].filter(Boolean);

  const body = {
    event: "tradeable_signal",
    text: lines.join("\n"),
    signal: {
      direction: signal.direction,
      score: signal.score,
      status: signal.status,
      spotPrice: signal.spotPrice,
      option: signal.option?.tradingsymbol ?? null,
      timestamp: signal.timestamp,
      reasons: signal.reasons?.slice(0, 5) ?? []
    }
  };

  const secret = getEnv("NOTIFY_WEBHOOK_SECRET", "").trim();
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-Notify-Secret": secret } : {})
      },
      body: JSON.stringify(body)
    });
  } catch {
    /* non-fatal */
  }
}
