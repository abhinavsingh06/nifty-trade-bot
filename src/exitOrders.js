import { fetchOrders } from "./kiteApi.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll today's orders until the given order is filled or terminal / timeout.
 */
export async function pollOrderFill(config, orderId, expectedQuantity) {
  const maxMs = Number(config.exitPollMaxMs ?? 90_000);
  const intervalMs = Number(config.exitPollIntervalMs ?? 2000);
  const deadline = Date.now() + maxMs;
  let lastOrder = null;

  while (Date.now() < deadline) {
    const orders = await fetchOrders(config);
    lastOrder = orders.find((o) => String(o.order_id) === String(orderId));
    if (!lastOrder) {
      await sleep(intervalMs);
      continue;
    }

    const status = lastOrder.status;
    const filled = Number(lastOrder.filled_quantity ?? 0);
    const qty = Number(lastOrder.quantity ?? expectedQuantity);

    if (status === "REJECTED" || status === "CANCELLED") {
      return { ok: false, order: lastOrder, reason: status };
    }

    if (status === "COMPLETE" || filled >= qty) {
      return {
        ok: true,
        order: lastOrder,
        averagePrice: Number(lastOrder.average_price ?? 0) || null,
        filledQuantity: filled
      };
    }

    await sleep(intervalMs);
  }

  return { ok: false, timeout: true, order: lastOrder, reason: "FILL_TIMEOUT" };
}
