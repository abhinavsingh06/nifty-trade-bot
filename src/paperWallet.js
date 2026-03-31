import path from "node:path";
import { readJson, writeJson } from "./utils.js";

function getWalletPath(config) {
  return path.join(config.runtimeDir, "paper-wallet.json");
}

function defaultWallet(config) {
  return {
    initialCapital: config.paperTrading.initialCapital,
    cashBalance: config.paperTrading.initialCapital,
    realizedPnL: 0,
    transactions: []
  };
}

function loadWallet(config) {
  return readJson(getWalletPath(config), defaultWallet(config));
}

function saveWallet(config, wallet) {
  writeJson(getWalletPath(config), wallet);
}

export function getPaperWallet(config) {
  const wallet = loadWallet(config);
  if (typeof wallet.cashBalance !== "number") {
    return defaultWallet(config);
  }
  return wallet;
}

/** Clears ledger and cash to current `PAPER_INITIAL_CAPITAL` (and wipes txn history). */
export function resetPaperWalletToConfig(config) {
  const next = defaultWallet(config);
  saveWallet(config, next);
  return next;
}

export function debitPaperEntry(config, position, optionPrice) {
  const wallet = getPaperWallet(config);
  const entryPrice = Number(optionPrice ?? position.entryOptionPrice ?? 0);
  if (!(entryPrice > 0)) {
    throw new Error("Paper entry needs a valid option premium.");
  }

  const tradeCost = Number((entryPrice * Number(position.quantity ?? 0)).toFixed(2));
  if (wallet.cashBalance < tradeCost) {
    throw new Error(`Paper wallet cash is insufficient. Need ${tradeCost.toFixed(2)}, available ${wallet.cashBalance.toFixed(2)}.`);
  }

  wallet.cashBalance = Number((wallet.cashBalance - tradeCost).toFixed(2));
  wallet.transactions.push({
    id: `paper-buy-${position.id}`,
    type: "BUY",
    timestamp: new Date().toISOString(),
    positionId: position.id,
    option: position.option?.tradingsymbol ?? position.symbol,
    quantity: position.quantity,
    optionPrice: entryPrice,
    amount: tradeCost,
    cashBalanceAfter: wallet.cashBalance
  });
  saveWallet(config, wallet);
  return {
    wallet,
    tradeCost,
    entryPrice
  };
}

export function creditPaperPartialExit(config, position, qtyClosed, exitPrice) {
  const wallet = getPaperWallet(config);
  const exit = Number(exitPrice ?? 0);
  const entryPrice = Number(position.entryOptionPrice ?? 0);
  const q = Number(qtyClosed ?? 0);
  if (!(exit > 0) || !(q > 0)) {
    throw new Error("Partial exit needs positive exit price and quantity.");
  }
  const credit = Number((exit * q).toFixed(2));
  const realizedPnL = Number(((exit - entryPrice) * q).toFixed(2));

  wallet.cashBalance = Number((wallet.cashBalance + credit).toFixed(2));
  wallet.realizedPnL = Number((wallet.realizedPnL + realizedPnL).toFixed(2));
  wallet.transactions.push({
    id: `paper-partial-${position.id}-${Date.now()}`,
    type: "PARTIAL_SELL",
    timestamp: new Date().toISOString(),
    positionId: position.id,
    option: position.option?.tradingsymbol ?? position.symbol,
    quantity: q,
    optionPrice: exit,
    amount: credit,
    realizedPnL,
    cashBalanceAfter: wallet.cashBalance
  });
  saveWallet(config, wallet);
  return { wallet, exitPrice: exit, realizedPnL, credit };
}

export function creditPaperExit(config, closedPosition, optionPrice) {
  const wallet = getPaperWallet(config);
  const exitPrice = Number(optionPrice ?? closedPosition.exit?.optionPrice ?? closedPosition.entryOptionPrice ?? 0);
  const entryPrice = Number(closedPosition.entryOptionPrice ?? 0);
  const quantity = Number(closedPosition.quantity ?? 0);
  const credit = Number((exitPrice * quantity).toFixed(2));
  const realizedPnL = Number(((exitPrice - entryPrice) * quantity).toFixed(2));

  wallet.cashBalance = Number((wallet.cashBalance + credit).toFixed(2));
  wallet.realizedPnL = Number((wallet.realizedPnL + realizedPnL).toFixed(2));
  wallet.transactions.push({
    id: `paper-sell-${closedPosition.id}`,
    type: "SELL",
    timestamp: new Date().toISOString(),
    positionId: closedPosition.id,
    option: closedPosition.option?.tradingsymbol ?? closedPosition.symbol,
    quantity,
    optionPrice: exitPrice,
    amount: credit,
    realizedPnL,
    cashBalanceAfter: wallet.cashBalance
  });
  saveWallet(config, wallet);
  return {
    wallet,
    exitPrice,
    realizedPnL
  };
}

export function buildPaperWalletSnapshot(config, positions = []) {
  const wallet = getPaperWallet(config);
  const openValue = positions.reduce((sum, position) => {
    const price = Number(position.lastObservedOptionPrice ?? position.entryOptionPrice ?? 0);
    return sum + price * Number(position.quantity ?? 0);
  }, 0);
  const unrealizedPnL = positions.reduce((sum, position) => {
    const current = Number(position.lastObservedOptionPrice ?? position.entryOptionPrice ?? 0);
    const entry = Number(position.entryOptionPrice ?? 0);
    return sum + (current - entry) * Number(position.quantity ?? 0);
  }, 0);

  return {
    ...wallet,
    openPositionsValue: Number(openValue.toFixed(2)),
    unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
    equity: Number((wallet.cashBalance + openValue).toFixed(2))
  };
}
