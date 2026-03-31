import { useEffect, useState, startTransition } from "react";
import { NoticeStack } from "./components/NoticeStack";
import { RouteTabs } from "./components/RouteTabs";
import { OpenTradeCard } from "./components/OpenTradeCard";
import { PaperAnalyticsBoard } from "./components/PaperAnalyticsBoard";
import SignalDeskView from "./components/SignalDeskView";
import { SuggestionsAnalyticsView } from "./components/SuggestionsAnalyticsView";
import { TradeSuggestionsHub } from "./components/TradeSuggestionsHub";
import { SetupPlanCard } from "./components/SetupPlanCard";
import { StatCard } from "./components/StatCard";
import { CandleChart, LineChart } from "./components/Charts";
import type {
  CryptoDashboardState,
  DashboardState,
  Notice,
  NoticeTone,
  WsState,
} from "./types";
import { COMMANDS } from "./types";
import {
  escapeText,
  inr,
  outcomeClasses,
  sentimentClasses,
  wsClasses,
  wsLabel,
} from "./ui";

export default function App() {
  const pathPrefix =
    typeof window !== "undefined" ? window.location.pathname : "";
  const isCryptoRoute = pathPrefix.startsWith("/crypto");
  const isAnalyticsRoute = pathPrefix.startsWith("/analytics");
  const [data, setData] = useState<DashboardState | null>(null);
  const [cryptoData, setCryptoData] = useState<CryptoDashboardState | null>(
    null,
  );
  const [output, setOutput] = useState("Dashboard readying...");
  const [loading, setLoading] = useState(false);
  const [pageTab, setPageTab] = useState<"signals" | "trade" | "book" | "stats">("signals");
  const [socketState, setSocketState] = useState<WsState>("connecting");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenSaving, setTokenSaving] = useState(false);

  function pushNotice(tone: NoticeTone, title: string, message: string) {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotices((current) => [...current, { id, tone, title, message }]);
    window.setTimeout(() => {
      setNotices((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }

  async function fetchDashboard() {
    const response = await fetch("/api/dashboard");
    if (!response.ok) {
      throw new Error("Failed to load dashboard data.");
    }
    return (await response.json()) as DashboardState;
  }

  async function fetchCryptoDashboard() {
    const response = await fetch("/api/crypto-dashboard");
    if (!response.ok) {
      throw new Error("Failed to load crypto study dashboard.");
    }
    return (await response.json()) as CryptoDashboardState;
  }

  function startZerodhaLogin() {
    window.location.assign("/auth/zerodha/start");
  }

  async function refresh() {
    if (isCryptoRoute) {
      const next = await fetchCryptoDashboard();
      startTransition(() => {
        setCryptoData(next);
      });
      return;
    }

    const next = await fetchDashboard();
    startTransition(() => {
      setData(next);
    });
  }

  async function handleCommand(command: string) {
    if (loading) return;
    setLoading(true);
    setOutput(`Running ${command}...`);

    try {
      const response = await fetch(`/api/run/${command}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Command failed.");
      }

      startTransition(() => {
        setData(payload.dashboardState as DashboardState);
      });
      setOutput(
        [payload.stdout, payload.stderr].filter(Boolean).join("\n\n") ||
          `${command} completed.`,
      );
      const dashboardState = payload.dashboardState as DashboardState;
      const commandLabel =
        COMMANDS.find((item) => item.command === command)?.label || command;
      if (command === "signals") {
        const signalRuntime = dashboardState.runtime.signals;
        if (signalRuntime?.status === "SKIPPED") {
          pushNotice(
            "warning",
            "Signals skipped",
            signalRuntime.reason ||
              "Market conditions prevented signal generation.",
          );
        } else if (signalRuntime?.signal) {
          pushNotice(
            "success",
            "Signals ready",
            `${signalRuntime.signal.direction || "Trade"} setup generated with score ${signalRuntime.signal.score ?? "-"}/10.`,
          );
        } else {
          pushNotice("info", commandLabel, `${commandLabel} completed.`);
        }
      } else {
        pushNotice(
          "success",
          commandLabel,
          `${commandLabel} completed successfully.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Command failed.";
      setOutput(message);
      pushNotice("error", "Command failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function applySuggestion(id: string) {
    if (loading) return;
    setLoading(true);
    setOutput(`Applying ${id} suggestion...`);
    try {
      const response = await fetch("/api/apply-suggestion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to apply suggestion.");
      }
      startTransition(() => {
        setData(payload.dashboardState as DashboardState);
      });
      setOutput(
        `Applied ${payload.applied?.suggestion?.action || id} suggestion to runtime.`,
      );
      pushNotice(
        "success",
        "Suggestion applied",
        `${payload.applied?.suggestion?.action || id} was saved to runtime.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to apply suggestion.";
      setOutput(message);
      pushNotice("error", "Apply failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function enterPaperTrade(id: string) {
    if (loading) return;
    setLoading(true);
    setOutput(`Entering paper trade for ${id}...`);
    try {
      const response = await fetch("/api/paper-enter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to enter paper trade.");
      }
      startTransition(() => {
        setData(payload.dashboardState as DashboardState);
      });
      const prem = payload.result?.estimatedOptionPrice;
      setOutput(
        `Paper trade entered at premium ${
          prem != null && Number.isFinite(Number(prem)) ? inr(prem) : "-"
        }.`,
      );
      pushNotice(
        "success",
        "Paper trade entered",
        "Fake INR was allocated and the paper position is now being tracked.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to enter paper trade.";
      setOutput(message);
      pushNotice("error", "Paper trade failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function resetPaperWallet() {
    if (loading) return;
    if (
      !window.confirm(
        "Reset paper wallet to PAPER_INITIAL_CAPITAL from .env? This clears cash and all paper transaction history (open positions should be closed first).",
      )
    ) {
      return;
    }
    setLoading(true);
    setOutput("Resetting paper ledger...");
    try {
      const response = await fetch("/api/reset-paper-wallet", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Reset failed.");
      }
      startTransition(() => {
        setData(payload.dashboardState as DashboardState);
      });
      setOutput("Paper wallet reset to configured initial capital.");
      pushNotice("success", "Paper ledger reset", "Cash and history cleared; positions unchanged on disk.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Reset failed.";
      setOutput(message);
      pushNotice("error", "Reset failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function exitPaperTrade(positionId: string) {
    if (loading) return;
    setLoading(true);
    setOutput(`Exiting paper trade ${positionId}...`);
    try {
      const response = await fetch("/api/paper-exit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ positionId }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to exit paper trade.");
      }
      startTransition(() => {
        setData(payload.dashboardState as DashboardState);
      });
      const xp = payload.result?.optionPrice;
      setOutput(
        `Paper trade exited at premium ${
          xp != null && Number.isFinite(Number(xp)) ? inr(xp) : "-"
        }.`,
      );
      pushNotice(
        "success",
        "Paper trade exited",
        "The fake INR wallet and transaction ledger were updated.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to exit paper trade.";
      setOutput(message);
      pushNotice("error", "Paper exit failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function exitPaperTradePartial(positionId: string, pct: 25 | 50) {
    if (loading) return;
    setLoading(true);
    setOutput(`Partial exit ${pct}% for ${positionId}...`);
    try {
      const response = await fetch("/api/paper-exit-partial", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ positionId, pct }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Partial exit failed.");
      }
      startTransition(() => {
        setData(payload.dashboardState as DashboardState);
      });
      setOutput(`Partial exit ${pct}% completed.`);
      pushNotice(
        "success",
        "Partial exit",
        "Wallet credited for closed lots; position size reduced.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Partial exit failed.";
      setOutput(message);
      pushNotice("error", "Partial exit failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function setDeskNoNewEntries(enabled: boolean) {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch("/api/desk-no-new-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not update kill-switch.");
      }
      startTransition(() => {
        setData(payload.dashboardState as DashboardState);
      });
      pushNotice(
        "info",
        enabled ? "New entries blocked" : "New entries allowed",
        enabled
          ? "Runtime kill-switch on (clear with toggle or delete runtime file)."
          : "Runtime kill-switch cleared.",
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kill-switch update failed.";
      pushNotice("error", "Desk policy", message);
    } finally {
      setLoading(false);
    }
  }

  async function saveAccessToken() {
    const token = tokenInput.trim();
    if (!token || tokenSaving) return;
    setTokenSaving(true);
    try {
      const response = await fetch("/api/set-access-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save token.");
      }
      setShowTokenModal(false);
      setTokenInput("");
      if (payload.ok) {
        pushNotice("success", "Token saved", "Access token verified and saved. Session is now active.");
        void refresh();
      } else {
        pushNotice("warning", "Token saved", `Saved to .env but live check failed: ${payload.message || "verify in terminal."}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save token.";
      pushNotice("error", "Token save failed", message);
    } finally {
      setTokenSaving(false);
    }
  }

  async function runAiAnalysis() {
    if (loading) return;
    setLoading(true);
    setOutput("Running OpenAI analysis...");
    try {
      const response = await fetch("/api/ai-analysis", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "AI analysis failed.");
      }
      startTransition(() => {
        setData(payload.dashboardState as DashboardState);
      });
      if (payload.ai?.status === "READY") {
        setOutput(
          `AI analysis completed with ${payload.ai?.model || "configured model"}.`,
        );
        pushNotice(
          "success",
          "AI analysis ready",
          `Completed with ${payload.ai?.model || "configured model"}.`,
        );
      } else {
        const reason =
          payload.ai?.reason || "AI analysis is unavailable right now.";
        setOutput(reason);
        pushNotice("warning", "AI analysis unavailable", reason);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI analysis failed.";
      setOutput(message);
      pushNotice("error", "AI analysis failed", message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyCryptoPrediction(id: string, outcome: string) {
    if (loading) return;
    setLoading(true);
    setOutput(`Marking ${id} as ${outcome}...`);
    try {
      const response = await fetch("/api/crypto-verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, outcome }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save crypto review.");
      }
      startTransition(() => {
        setCryptoData(payload.dashboardState as CryptoDashboardState);
      });
      setOutput(`Marked ${id} as ${outcome}.`);
      pushNotice(
        "success",
        "Study review saved",
        `Marked setup as ${outcome}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save crypto review.";
      setOutput(message);
      pushNotice("error", "Study review failed", message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh()
      .then(() => {
        setOutput("Dashboard ready.");
        pushNotice(
          "success",
          "Dashboard connected",
          "Live dashboard data loaded successfully.",
        );
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Failed to load dashboard.";
        setOutput(message);
        pushNotice("error", "Load failed", message);
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zerodhaStatus = params.get("zerodha");
    if (!zerodhaStatus) {
      return;
    }

    const message = params.get("message");
    const expected = params.get("expected");
    const configured = params.get("configured");

    if (zerodhaStatus === "connected") {
      pushNotice(
        "success",
        "Zerodha connected",
        "Access token was saved locally. You should not need to paste it for this session cycle.",
      );
      void refresh();
    } else if (zerodhaStatus === "redirect-mismatch") {
      pushNotice(
        "warning",
        "Update redirect URL",
        `Set Zerodha redirect URL to ${expected}. Current value is ${configured || "not set"}.`,
      );
    } else {
      pushNotice(
        "error",
        "Zerodha login failed",
        message || "The Zerodha login flow could not complete.",
      );
    }

    const cleanUrl = `${window.location.pathname}${window.location.hash || ""}`;
    window.history.replaceState({}, "", cleanUrl);
  }, []);

  useEffect(() => {
    if (!isCryptoRoute) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      fetchCryptoDashboard()
        .then((next) => {
          startTransition(() => {
            setCryptoData(next);
          });
        })
        .catch((error) => {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to refresh crypto study.";
          setOutput(message);
        });
    }, 20000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isCryptoRoute]);

  useEffect(() => {
    let closedByApp = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    if (isCryptoRoute) {
      setSocketState("offline");
      return undefined;
    }

    const connect = () => {
      setSocketState("connecting");
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocol}://${window.location.host}/ws`);

      socket.addEventListener("open", () => {
        setSocketState("live");
      });

      socket.addEventListener("message", (event) => {
        try {
          const payload = JSON.parse(event.data) as
            | {
                type: "dashboard:update";
                data: DashboardState;
                cryptoData?: CryptoDashboardState;
              }
            | { type: "dashboard:hello"; message: string }
            | { type: "dashboard:error"; error: string };

          if (payload.type === "dashboard:update") {
            startTransition(() => {
              if (isCryptoRoute) {
                setCryptoData(payload.cryptoData ?? null);
              } else {
                setData(payload.data);
              }
            });
          }

          if (payload.type === "dashboard:error") {
            setOutput(payload.error);
            pushNotice("error", "Live update error", payload.error);
          }
        } catch {
          setOutput("Received malformed WebSocket payload.");
          pushNotice(
            "error",
            "Live update error",
            "Received malformed WebSocket payload.",
          );
        }
      });

      socket.addEventListener("close", () => {
        if (closedByApp) {
          return;
        }
        setSocketState("offline");
        reconnectTimer = window.setTimeout(connect, 4000);
      });

      socket.addEventListener("error", () => {
        setSocketState("offline");
      });
    };

    connect();

    return () => {
      closedByApp = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [isCryptoRoute]);

  const signal = data?.runtime.signals?.signal;
  const signalArtifact = data?.runtime.signals;
  const session = data?.runtime.session;
  const sessionHealth = data?.sessionHealth;
  const deskPolicy = data?.runtime.deskPolicy;
  const paperBuyHint =
    deskPolicy?.reasons?.length ? deskPolicy.reasons.join(" ") : null;
  const kiteLiveOk = sessionHealth?.mode === "kite" && sessionHealth?.ok === true;
  const kiteLiveBad = sessionHealth?.mode === "kite" && sessionHealth?.ok === false;
  const zerodhaSessionLabel =
    sessionHealth?.profile?.userName?.trim() ||
    sessionHealth?.profile?.userId?.trim() ||
    session?.profile?.userName?.trim() ||
    session?.profile?.userId?.trim() ||
    null;
  const positions = data?.runtime.positions;
  const charts = data?.charts;
  const paperWallet = data?.runtime.paperWallet;
  const cryptoCandles =
    cryptoData?.charts?.candles?.map((candle) => ({
      time: candle.time || candle.timestamp || "",
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
    })) || [];
  const cryptoLine =
    cryptoData?.charts?.line?.map((point) => ({
      label: new Date(point.time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      value: point.value,
    })) || [];

  if (false && isCryptoRoute) {
    return (
      <>
        <NoticeStack
          notices={notices}
          onClose={(id) =>
            setNotices((current) => current.filter((item) => item.id !== id))
          }
        />
        <header className="sticky top-0 z-40 border-b border-amber-200/70 bg-[#f5efe5]/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6 lg:px-8">
            <RouteTabs active="crypto" />
          </div>
        </header>
        <main className="relative mx-auto max-w-[1480px] px-4 py-6 md:px-6 lg:px-8">
        <section className="glass overflow-hidden rounded-[32px] border border-white/60 bg-white/70 p-6 shadow-glow md:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.35fr_0.95fr]">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-orange-700">
                  Crypto Study Lab
                </p>
                <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Study Only
                </span>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${sentimentClasses(cryptoData?.news?.summary?.bias)}`}>
                  News {escapeText(cryptoData?.news?.summary?.bias)}
                </span>
              </div>
              <h1 className="mt-3 font-display text-5xl leading-none text-slate-900 md:text-7xl">
                Crypto pattern lab
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600 md:text-lg">
                Practice chart reading without investing. Study how crypto long
                and short setups map conceptually to CALL BUY and PUT BUY logic
                in Indian markets, then mark outcomes to review your read.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-600">
                <span className="rounded-full bg-slate-900 px-4 py-2 text-white">
                  Prediction verification
                </span>
                <span className="rounded-full bg-orange-50 px-4 py-2 text-orange-700">
                  Crypto-to-options analogies
                </span>
                <span className="rounded-full bg-emerald-50 px-4 py-2 text-emerald-700">
                  Entry and invalidation focus
                </span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="rounded-2xl bg-slate-900 px-4 py-4 text-left text-white transition hover:-translate-y-0.5 disabled:opacity-60"
                disabled={loading}
                onClick={() =>
                  refresh()
                    .then(() => {
                      setOutput("Crypto study dashboard refreshed.");
                      pushNotice(
                        "success",
                        "Crypto refreshed",
                        "Crypto study view refreshed.",
                      );
                    })
                    .catch((error) => {
                      const message =
                        error instanceof Error
                          ? error.message
                          : "Refresh failed.";
                      setOutput(message);
                      pushNotice("error", "Refresh failed", message);
                    })
                }>
                Refresh Crypto Study
              </button>
              <a
                href="/"
                className="rounded-2xl bg-white px-4 py-4 text-left text-slate-900 ring-1 ring-slate-200 transition hover:-translate-y-0.5">
                Open Indian Market Dashboard
              </a>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Mode"
            value={escapeText(cryptoData?.mode).toUpperCase()}
          />
          <StatCard label="Asset" value={cryptoData?.market?.asset || "-"} />
          <StatCard label="Status" value={cryptoData?.status ?? "-"} />
          <StatCard label="Bias" value={cryptoData?.market?.bias ?? "-"} />
          <StatCard label="Latest Close" value={String(cryptoData?.market?.latestClose ?? "-")} />
          <StatCard label="Move %" value={cryptoData?.market?.changePct != null ? String(Number(cryptoData?.market?.changePct).toFixed(2)) : "-"} />
        </section>

        {cryptoData?.status !== "READY" ? (
          <section className="mt-6">
            <article className="glass rounded-[28px] border border-rose-200 bg-rose-50/90 p-6 shadow-glow">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-700">
                Live Crypto Feed
              </p>
              <h2 className="mt-1 font-display text-3xl text-rose-950">
                Live data unavailable
              </h2>
              <p className="mt-4 max-w-4xl text-base leading-7 text-rose-900">
                {escapeText(
                  cryptoData?.charts?.note ||
                    "The live crypto provider is currently unavailable. No sample fallback is being shown.",
                )}
              </p>
            </article>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Live Spot
                </p>
                <h2 className="mt-1 font-display text-3xl text-slate-900">
                  Crypto pulse
                </h2>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Auto refresh 20s
              </span>
            </div>
            <div className="rounded-[24px] bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white">
              <p className="text-sm uppercase tracking-[0.22em] text-slate-300">
                {escapeText(cryptoData?.market?.asset)}
              </p>
              <h3 className="mt-2 text-5xl font-semibold">
                {escapeText(cryptoData?.market?.latestClose)}
              </h3>
              <p
                className={`mt-3 text-lg ${(cryptoData?.market?.changePct || 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {escapeText(cryptoData?.market?.change)} (
                {cryptoData?.market?.changePct != null ? Number(cryptoData?.market?.changePct).toFixed(2) : "-"}
                %)
              </p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <span className="text-sm text-slate-500">Data source</span>
                <strong className="mt-2 block text-lg text-slate-900">
                  {escapeText(cryptoData?.charts?.source)} only
                </strong>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <span className="text-sm text-slate-500">
                  Last dashboard update
                </span>
                <strong className="mt-2 block text-lg text-slate-900">
                  {escapeText(cryptoData?.generatedAt)}
                </strong>
              </div>
            </div>
          </article>

          <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Live Behavior
              </p>
              <h2 className="mt-1 font-display text-3xl text-slate-900">
                How to read the refresh
              </h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <strong className="text-slate-900">Spot price</strong>
                <p className="mt-2 text-sm text-slate-700">
                  Updates from the live crypto backend feed and refreshes
                  automatically every 20 seconds.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <strong className="text-slate-900">Candles</strong>
                <p className="mt-2 text-sm text-slate-700">
                  Candles refresh with the same cycle, so structure and setups
                  stay aligned with the current feed.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <strong className="text-slate-900">Study mode</strong>
                <p className="mt-2 text-sm text-slate-700">
                  This remains learning-only: no crypto trading, only chart
                  study and prediction review.
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Chart Study
              </p>
              <h2 className="mt-1 font-display text-3xl text-slate-900">
                Crypto candle structure
              </h2>
            </div>
            <div className="space-y-4">
              <CandleChart candles={cryptoCandles} />
              <LineChart
                points={cryptoLine}
                positive={(cryptoData?.market?.changePct || 0) >= 0}
              />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                {escapeText(cryptoData?.charts?.note)}
              </div>
            </div>
          </article>

          <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Learning Map
              </p>
              <h2 className="mt-1 font-display text-3xl text-slate-900">
                Crypto to CALL/PUT translation
              </h2>
            </div>
            <div className="space-y-4">
              <div className="rounded-[24px] bg-gradient-to-br from-slate-900 to-slate-700 p-5 text-white">
                <p className="text-sm uppercase tracking-[0.22em] text-slate-300">
                  Objective
                </p>
                <p className="mt-3 text-lg leading-7">
                  {escapeText(cryptoData?.learning?.objective)}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <strong className="text-emerald-900">Bullish mapping</strong>
                  <p className="mt-2 text-sm leading-6 text-emerald-900">
                    Crypto long after breakout confirmation is the same mindset
                    as CALL BUY on NIFTY: strength first, then entry, then stop.
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <strong className="text-rose-900">Bearish mapping</strong>
                  <p className="mt-2 text-sm leading-6 text-rose-900">
                    Crypto short after breakdown confirmation matches PUT BUY
                    logic: support break, follow-through, and invalidation
                    discipline.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Chart reading steps
                </p>
                <div className="mt-3 space-y-2 text-slate-700">
                  {(cryptoData?.learning?.chartReadingSteps || []).map(
                    (step) => (
                      <p key={step}>• {step}</p>
                    ),
                  )}
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Study Predictions
              </p>
              <h2 className="mt-1 font-display text-3xl text-slate-900">
                Entry, stop, targets, and review
              </h2>
            </div>
            <div className="grid gap-4">
              {(cryptoData?.predictions || []).map((prediction) => (
                <div
                  key={prediction.id}
                  className="rounded-[24px] border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                        {prediction.side}
                      </p>
                      <h3 className="mt-1 text-2xl font-semibold text-slate-900">
                        {prediction.analog}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                        Conf {prediction.confidence}/10
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-medium ${outcomeClasses(prediction.verification?.outcome)}`}>
                        {escapeText(
                          prediction.verification?.outcome || "PENDING",
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Entry zone
                      </span>
                      <strong className="mt-2 block text-lg text-slate-900">
                        {prediction.entryZone.join(" - ")}
                      </strong>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Stop loss
                      </span>
                      <strong className="mt-2 block text-lg text-slate-900">
                        {prediction.stopLoss}
                      </strong>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                        Targets
                      </span>
                      <strong className="mt-2 block text-lg text-slate-900">
                        {prediction.targets.join(", ")}
                      </strong>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      {(prediction.thesis || []).map((line) => (
                        <p key={line} className="mb-2 last:mb-0">
                          • {line}
                        </p>
                      ))}
                    </div>
                    <div className="space-y-3">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                        <strong className="block text-slate-900">Lesson</strong>
                        <p className="mt-2">{prediction.lesson}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                        <strong className="block text-slate-900">
                          Invalidation
                        </strong>
                        <p className="mt-2">{prediction.invalidation}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {["WIN", "LOSS", "PENDING"].map((outcome) => (
                      <button
                        key={`${prediction.id}-${outcome}`}
                        className={`rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${outcome === "WIN" ? "bg-emerald-600 text-white" : outcome === "LOSS" ? "bg-rose-600 text-white" : "bg-slate-200 text-slate-800"}`}
                        disabled={loading}
                        onClick={() =>
                          verifyCryptoPrediction(prediction.id, outcome)
                        }>
                        Mark {outcome}
                      </button>
                    ))}
                    <span className="text-sm text-slate-500">
                      {escapeText(prediction.verification?.notes)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Study Context
              </p>
              <h2 className="mt-1 font-display text-3xl text-slate-900">
                Indicators and news
              </h2>
            </div>
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">SMA 9 / SMA 20</span>
                  <strong className="mt-2 block text-xl text-slate-900">
                    {escapeText(cryptoData?.indicators?.sma9)} /{" "}
                    {escapeText(cryptoData?.indicators?.sma20)}
                  </strong>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">Recent range</span>
                  <strong className="mt-2 block text-xl text-slate-900">
                    {escapeText(cryptoData?.indicators?.recentLow)} -{" "}
                    {escapeText(cryptoData?.indicators?.recentHigh)}
                  </strong>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Guide
                </p>
                <div className="mt-3 space-y-2 text-slate-700">
                  {(cryptoData?.learning?.guide || []).map((line) => (
                    <p key={line}>• {line}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                News bias {escapeText(cryptoData?.news?.summary?.bias)} •
                Weighted score {escapeText(cryptoData?.news?.summary?.score)}
              </div>
              <div className="space-y-3">
                {(cryptoData?.news?.headlines || [])
                  .slice(0, 5)
                  .map((headline) => (
                    <a
                      key={headline.link}
                      href={headline.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300">
                      <div className="flex items-start justify-between gap-3">
                        <strong className="text-slate-900">
                          {headline.title}
                        </strong>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${sentimentClasses(headline.sentiment)}`}>
                          {headline.sentiment}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-slate-500">
                        {headline.source} • Score{" "}
                        {escapeText(headline.sentimentScore)} • Weight{" "}
                        {escapeText(headline.sourceWeight)}
                      </div>
                    </a>
                  ))}
              </div>
            </div>
          </article>
        </section>

        <section className="mt-6">
          <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Study Log
                </p>
                <h2 className="mt-1 font-display text-3xl text-slate-900">
                  Review output
                </h2>
              </div>
              <button
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                disabled={loading}
                onClick={() =>
                  refresh()
                    .then(() => {
                      setOutput("Crypto study dashboard refreshed.");
                      pushNotice(
                        "success",
                        "Refreshed",
                        "Crypto study state refreshed.",
                      );
                    })
                    .catch((error) => {
                      const message =
                        error instanceof Error
                          ? error.message
                          : "Refresh failed.";
                      setOutput(message);
                      pushNotice("error", "Refresh failed", message);
                    })
                }>
                Refresh
              </button>
            </div>
            <pre className="terminal">{output}</pre>
          </article>
        </section>
        </main>
      </>
    );
  }

  if (isAnalyticsRoute || isCryptoRoute) {
    if (typeof window !== "undefined") window.location.replace("/");
    return null;
  }

  if (false && isAnalyticsRoute) {
    return (
      <>
        <NoticeStack
          notices={notices}
          onClose={(id) =>
            setNotices((current) => current.filter((item) => item.id !== id))
          }
        />
        {showTokenModal ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowTokenModal(false); }}>
            <div className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Token refresh</p>
                <h2 className="mt-1 text-xl font-bold text-white">Paste Zerodha access token</h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  Run <code className="text-teal-300">npm run session:exchange</code> in the terminal then paste the <code className="text-teal-300">access_token</code> here.
                </p>
              </div>
              <textarea
                className="w-full resize-none rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-sm text-white placeholder-slate-500 focus:border-teal-500/60 focus:outline-none"
                rows={3}
                placeholder="Paste access_token value here…"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="rounded-full border border-white/20 px-4 py-2 text-sm text-slate-300" onClick={() => { setShowTokenModal(false); setTokenInput(""); }}>Cancel</button>
                <button type="button" disabled={tokenSaving || tokenInput.trim().length < 8} className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void saveAccessToken()}>{tokenSaving ? "Saving…" : "Save & verify"}</button>
              </div>
            </div>
          </div>
        ) : null}
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0f172a]/95 shadow-[0_8px_32px_rgba(2,6,23,0.35)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6 lg:px-8">
            <RouteTabs active="analytics" />
            {kiteLiveOk || zerodhaSessionLabel || kiteLiveBad ? (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <div
                  className="flex max-w-[min(100%,16rem)] items-center gap-2 truncate rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white"
                  title={escapeText(zerodhaSessionLabel || "Zerodha")}>
                  {zerodhaSessionLabel ? (
                    <span className="truncate font-semibold text-white">
                      {escapeText(zerodhaSessionLabel)}
                    </span>
                  ) : null}
                  {kiteLiveOk ? (
                    <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
                      SESSION OK
                    </span>
                  ) : kiteLiveBad ? (
                    <span className="shrink-0 rounded-full bg-rose-500/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-200">
                      KITE ERROR
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      NOT VERIFIED
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:text-white"
                  onClick={startZerodhaLogin}>
                  Reconnect
                </button>
                <button
                  type="button"
                  className="rounded-full bg-teal-700/70 px-3 py-2 text-xs font-semibold text-teal-100 transition hover:bg-teal-600/80"
                  onClick={() => setShowTokenModal(true)}>
                  Paste token
                </button>
              </div>
            ) : (
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
                  onClick={startZerodhaLogin}>
                  Login to Zerodha
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40"
                  onClick={() => setShowTokenModal(true)}>
                  Paste token
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="relative mx-auto max-w-[1200px] px-4 pb-12 pt-6 md:px-6 lg:px-8">
          {kiteLiveBad ? (
            <div
              className="mb-6 rounded-xl border border-amber-500/45 bg-amber-950/35 px-4 py-3 text-sm text-amber-50 shadow-lg shadow-amber-950/20"
              role="status">
              <strong className="font-semibold text-amber-200">Zerodha session</strong>
              <p className="mt-1 text-xs leading-relaxed text-amber-100/90">
                {escapeText(
                  sessionHealth?.message ||
                    "Live API check failed — reconnect or exchange a fresh token.",
                )}
              </p>
            </div>
          ) : null}
          <SuggestionsAnalyticsView
            data={data}
            loading={loading}
            onRefresh={refresh}
          />
        </main>
      </>
    );
  }

  const openCount = positions?.open?.length ?? 0;
  const analytics = data?.runtime.paperAnalytics;

  return (
    <>
      <NoticeStack
        notices={notices}
        onClose={(id) =>
          setNotices((current) => current.filter((item) => item.id !== id))
        }
      />
      {showTokenModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowTokenModal(false); }}>
          <div className="w-full max-w-md rounded-2xl border border-white/20 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                Token refresh
              </p>
              <h2 className="mt-1 text-xl font-bold text-white">
                Paste Zerodha access token
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Run <code className="text-teal-300">npm run session:exchange</code> in the terminal, or complete the Zerodha web login, then paste the <code className="text-teal-300">access_token</code> here.
              </p>
            </div>
            <textarea
              className="w-full resize-none rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-sm text-white placeholder-slate-500 focus:border-teal-500/60 focus:outline-none focus:ring-1 focus:ring-teal-500/30"
              rows={3}
              placeholder="Paste access_token value here…"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void saveAccessToken(); }}
            />
            <p className="mt-1.5 text-[10px] text-slate-500">Ctrl+Enter to save · token is written to your .env file</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-white/20 px-4 py-2 text-sm text-slate-300 hover:border-white/40"
                onClick={() => { setShowTokenModal(false); setTokenInput(""); }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={tokenSaving || tokenInput.trim().length < 8}
                className="rounded-full bg-teal-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-500 disabled:opacity-50"
                onClick={() => void saveAccessToken()}>
                {tokenSaving ? "Saving…" : "Save & verify"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0f172a]/95 shadow-[0_8px_32px_rgba(2,6,23,0.35)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <RouteTabs active="indian" />
            {loading && <span className="text-[10px] text-slate-500 animate-pulse">Updating…</span>}
          </div>
          {kiteLiveOk || zerodhaSessionLabel || kiteLiveBad ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-sm">
                <span className={`h-2 w-2 rounded-full shrink-0 ${kiteLiveOk ? "bg-emerald-400" : "bg-rose-400"}`} />
                <span className="text-white font-medium truncate max-w-[120px]">{escapeText(zerodhaSessionLabel || "Zerodha")}</span>
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${kiteLiveOk ? "text-emerald-300" : "text-rose-300"}`}>
                  {kiteLiveOk ? "Live" : "Error"}
                </span>
              </div>
              <button type="button" className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-white/40" onClick={startZerodhaLogin}>Reconnect</button>
              <button type="button" className="rounded-full bg-teal-700/70 px-3 py-1.5 text-xs font-semibold text-teal-100 hover:bg-teal-600/80" onClick={() => setShowTokenModal(true)}>Paste token</button>
            </div>
          ) : (
            <div className="flex shrink-0 gap-2">
              <button type="button" className="rounded-full bg-teal-500 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-400" onClick={startZerodhaLogin}>Connect Zerodha</button>
              <button type="button" className="rounded-full border border-white/25 px-4 py-2 text-sm font-semibold text-white hover:border-white/40" onClick={() => setShowTokenModal(true)}>Paste token</button>
            </div>
          )}
        </div>

        {/* ── 4-tab navigation ─────────────────────────────────────────── */}
        <div className="mx-auto max-w-[1480px] px-4 md:px-6">
          <div className="flex gap-0 overflow-x-auto">
            {([
              { id: "signals" as const, label: "📡 Signals", badge: undefined as string | undefined },
              { id: "trade"   as const, label: "💼 Trade",   badge: data?.intelligence?.status === "READY" ? "READY" : undefined as string | undefined },
              { id: "book"    as const, label: "📋 Book",    badge: openCount > 0 ? String(openCount) : undefined as string | undefined },
              { id: "stats"   as const, label: "📈 Stats",   badge: undefined as string | undefined },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPageTab(tab.id)}
                className={`relative flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                  pageTab === tab.id
                    ? "border-teal-400 text-white"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}>
                {tab.label}
                {tab.badge && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${tab.badge === "READY" ? "bg-teal-500/30 text-teal-300" : "bg-white/15 text-slate-300"}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Banners (always visible) ─────────────────────────────────────── */}
      {(kiteLiveBad || (() => { const e = data?.runtime.autoSignalScheduler?.lastError; return e?.type === "session_expired" && e.at && (Date.now() - new Date(e.at).getTime()) < 86400000; })()) && (
        <div className="mx-auto max-w-[1480px] px-4 pt-3 md:px-6">
          {kiteLiveBad && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/35 px-4 py-3 text-sm text-amber-50">
              <div>
                <strong className="text-amber-200">Session expired</strong>
                <p className="mt-0.5 text-xs text-amber-100/80">{escapeText(sessionHealth.message || "Reconnect or paste a fresh token.")}</p>
              </div>
              <button type="button" className="rounded-full bg-amber-500/30 px-4 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/50" onClick={() => setShowTokenModal(true)}>Fix now</button>
            </div>
          )}
          {(() => {
            const sigErr = data?.runtime.autoSignalScheduler?.lastError;
            if (!sigErr?.at || sigErr.type !== "session_expired") return null;
            const ageMs = Date.now() - new Date(sigErr.at).getTime();
            if (ageMs > 86400000) return null;
            return (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm">
                <div>
                  <strong className="text-rose-300">Auto-signal failed</strong>
                  <p className="mt-0.5 text-xs text-rose-200/70">{escapeText(sigErr.message)}</p>
                </div>
                <button type="button" className="rounded-full bg-rose-600/40 px-4 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-600/60" onClick={() => setShowTokenModal(true)}>Fix session</button>
              </div>
            );
          })()}
        </div>
      )}

      <main className="relative mx-auto max-w-[1480px] px-4 pb-16 pt-4 md:px-6">

        {/* ══════════════════════════════════════════════════════════════════
            TAB 1 · SIGNALS — Full signal desk with indicators & charts
        ══════════════════════════════════════════════════════════════════ */}
        {pageTab === "signals" && (
          <SignalDeskView
            data={data}
            loading={loading}
            onRunSignals={() => void handleCommand("signals")}
            onRefresh={() =>
              refresh()
                .then(() => pushNotice("success", "Refreshed", "Dashboard state refreshed."))
                .catch((e) => pushNotice("error", "Refresh failed", e instanceof Error ? e.message : "Refresh failed."))
            }
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 2 · TRADE — What to buy, entry/SL/target, Paper Buy buttons
        ══════════════════════════════════════════════════════════════════ */}
        {pageTab === "trade" && (
          <div className="flex flex-col gap-5">

            {/* ── How to use (beginner guide) ──────────────────────────── */}
            <div className="rounded-xl border border-white/8 bg-slate-800/40 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">How to use this tab</div>
              <ol className="grid gap-1.5 sm:grid-cols-3 text-xs text-slate-400">
                <li className="flex gap-2"><span className="shrink-0 h-5 w-5 rounded-full bg-teal-600/40 text-teal-300 text-[10px] font-bold flex items-center justify-center">1</span><span>Go to <strong className="text-slate-300">Signals tab</strong> → click <strong className="text-teal-400">Run Signals</strong> to generate today's analysis.</span></li>
                <li className="flex gap-2"><span className="shrink-0 h-5 w-5 rounded-full bg-teal-600/40 text-teal-300 text-[10px] font-bold flex items-center justify-center">2</span><span>Come back here. Review the <strong className="text-slate-300">pre-trade checks</strong> and <strong className="text-slate-300">setup cards</strong> below.</span></li>
                <li className="flex gap-2"><span className="shrink-0 h-5 w-5 rounded-full bg-teal-600/40 text-teal-300 text-[10px] font-bold flex items-center justify-center">3</span><span>Click <strong className="text-slate-300">Paper Buy</strong> to simulate, or place the same trade manually in Zerodha Kite.</span></li>
              </ol>
            </div>

            {/* ── Pre-trade checklist ──────────────────────────────────── */}
            {(() => {
              const intel = data?.intelligence;
              const vix = intel?.indiaVix;
              const stTrend = data?.runtime.signals?.signal?.technicals?.supertrend?.trend;
              const sigDir = data?.runtime.signals?.signal?.direction;
              const tfRows = intel?.multiTimeframe ?? [];
              const tfBull = tfRows.filter(t => t.bias === "Bull").length;
              const tfBear = tfRows.filter(t => t.bias === "Bear").length;
              const tfAligned = tfBull >= 2 || tfBear >= 2;
              const vixOk = vix == null || vix < 20;
              const stOk = stTrend != null;
              const checks = [
                { label: "Zerodha session", ok: kiteLiveOk, hint: "Connect Zerodha first — click the header button", fix: () => startZerodhaLogin() },
                { label: "Signals generated", ok: intel?.status === "READY", hint: "Go to Signals tab and click Run Signals", fix: () => { setPageTab("signals"); } },
                { label: "India VIX below 20", ok: vixOk, hint: vix != null ? `VIX is ${vix.toFixed(1)} — high VIX means expensive premiums, wider losses` : "VIX data not available yet", fix: null },
                { label: "Supertrend has direction", ok: stOk, hint: "Supertrend direction isn't determined yet — run signals first", fix: null },
                { label: "Multi-TF alignment", ok: tfAligned, hint: "At least 2/3 timeframes should agree — wait for better setup", fix: null },
              ];
              const passCount = checks.filter(c => c.ok).length;
              return (
                <div className="rounded-xl border border-white/8 bg-slate-800/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">Pre-trade checklist</div>
                    <div className={`text-sm font-bold ${passCount >= 4 ? "text-emerald-400" : passCount >= 3 ? "text-amber-400" : "text-rose-400"}`}>
                      {passCount}/5 passed {passCount >= 4 ? "✓" : passCount >= 3 ? "⚠" : "✗"}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {checks.map((c, i) => (
                      <div key={i} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 ${c.ok ? "bg-emerald-950/40 border border-emerald-700/30" : "bg-slate-900/60 border border-white/6"}`}>
                        <span className={`shrink-0 mt-0.5 h-4 w-4 rounded-full text-[10px] font-bold flex items-center justify-center ${c.ok ? "bg-emerald-500 text-white" : "bg-slate-700 text-slate-400"}`}>{c.ok ? "✓" : "—"}</span>
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold ${c.ok ? "text-emerald-300" : "text-slate-400"}`}>{c.label}</div>
                          {!c.ok && <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{c.hint}</div>}
                          {!c.ok && c.fix && <button type="button" onClick={() => c.fix?.()} className="mt-1.5 text-[10px] text-teal-400 hover:text-teal-300 font-semibold">Fix →</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                  {passCount < 4 && (
                    <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-950/30 px-3 py-2 text-xs text-amber-200/80">
                      ⚠ Wait until at least 4/5 checks pass before entering a trade. This protects you from bad setups.
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Kill-switch ──────────────────────────────────────────── */}
            {deskPolicy?.noNewEntries?.active && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-rose-300">🚫 Kill-switch active — no new entries allowed</div>
                  <div className="text-xs text-rose-200/70 mt-0.5">Paper buys and live autotrade entries are blocked.</div>
                </div>
                {deskPolicy.noNewEntries.source !== "env" && (
                  <button type="button" disabled={loading} className="rounded-full border border-rose-500/40 px-4 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50" onClick={() => void setDeskNoNewEntries(false)}>Allow entries</button>
                )}
              </div>
            )}
            {!deskPolicy?.noNewEntries?.active && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-slate-900/40 px-4 py-2.5">
                <div className="text-xs text-slate-500">Kill-switch: <span className="text-emerald-400 font-semibold">OFF</span> — entries allowed</div>
                <button type="button" disabled={loading} className="rounded-full bg-rose-600/30 px-3 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-600/50 disabled:opacity-50" onClick={() => void setDeskNoNewEntries(true)}>Block entries</button>
              </div>
            )}

            {/* ── Trade setup cards (ATR/SL/Target/RR) ────────────────── */}
            {data?.intelligence?.status === "READY" && (data?.intelligence?.tradeSetups?.length ?? 0) > 0 ? (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-white/8" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Trade setup cards — entry · stop loss · target</span>
                  <div className="h-px flex-1 bg-white/8" />
                </div>
                <div className="mb-3 rounded-lg border border-blue-500/20 bg-blue-950/30 px-4 py-2.5 text-xs text-blue-200/80 leading-relaxed">
                  💡 <strong className="text-blue-200">How to read:</strong> "Entry premium" = what you pay per share in ₹. Multiply by lot size for total cost. "SL underlying" = if Nifty hits this price, exit immediately. "Target 1" = book 50–60% of your position here.
                </div>
              </div>
            ) : null}

            {/* ── Paper buy cards (SetupPlanCards) ─────────────────────── */}
            <TradeSuggestionsHub
              data={data}
              loading={loading}
              paperBuyDisabled={Boolean(deskPolicy?.blocked)}
              paperBuyHint={paperBuyHint}
              onRunCommand={handleCommand}
              onRefreshDashboard={() => refresh().then(() => pushNotice("success", "Refreshed", "Refreshed.")).catch(() => {})}
              onApplySuggestion={applySuggestion}
              onPaperBuy={enterPaperTrade}
              onAiAnalysis={runAiAnalysis}
            />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 3 · BOOK — Open positions + recent closed trades
        ══════════════════════════════════════════════════════════════════ */}
        {pageTab === "book" && (
          <div className="flex flex-col gap-5">

            {/* Wallet summary bar */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/8 bg-slate-800/50 px-4 py-3">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Cash balance</div>
                <div className="text-lg font-bold text-teal-300 tabular-nums mt-0.5">{paperWallet?.cashBalance != null ? inr(paperWallet.cashBalance) : "—"}</div>
              </div>
              <div className="rounded-xl border border-white/8 bg-slate-800/50 px-4 py-3">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Unrealized P&L</div>
                <div className={`text-lg font-bold tabular-nums mt-0.5 ${(paperWallet?.unrealizedPnL ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {paperWallet?.unrealizedPnL != null ? ((paperWallet.unrealizedPnL >= 0 ? "+" : "") + inr(paperWallet.unrealizedPnL)) : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-slate-800/50 px-4 py-3">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Realized P&L</div>
                <div className={`text-lg font-bold tabular-nums mt-0.5 ${(paperWallet?.realizedPnL ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {paperWallet?.realizedPnL != null ? ((paperWallet.realizedPnL >= 0 ? "+" : "") + inr(paperWallet.realizedPnL)) : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-slate-800/50 px-4 py-3">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Open positions</div>
                <div className="text-lg font-bold text-slate-100 tabular-nums mt-0.5">{openCount}</div>
              </div>
            </div>

            {/* Open trades */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold text-slate-200">Open trades</div>
                <span className="text-xs text-slate-500">Exit or partial exit below</span>
              </div>
              {openCount ? (
                <ul className="flex flex-col gap-2">
                  {positions?.open?.map((position, index) => (
                    <li key={position.id ?? `${position.symbol}-${index}`}>
                      <OpenTradeCard
                        position={position}
                        loading={loading}
                        orderProduct={data?.config?.orderProduct}
                        optionLotSize={data?.config?.optionLotSize}
                        quoteStaleAfterMs={data?.config?.quoteStaleAfterMs}
                        onExit={exitPaperTrade}
                        onPartialExit={(id, pct) => void exitPaperTradePartial(id, pct)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-10 text-center">
                  <div className="text-2xl mb-2">📋</div>
                  <div className="text-sm text-slate-400 font-medium">No open trades</div>
                  <div className="text-xs text-slate-600 mt-1">Go to the <button type="button" className="text-teal-400 hover:text-teal-300 font-semibold" onClick={() => setPageTab("trade")}>Trade tab</button> to paper buy a setup.</div>
                </div>
              )}
            </section>

            {/* Recent closed */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-bold text-slate-200">Recent closed trades</div>
                <span className="text-xs text-slate-500">{positions?.closed?.length ?? 0} total</span>
              </div>
              {(positions?.closed?.length ?? 0) > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(positions?.closed || []).slice(-6).reverse().map((pos, i) => (
                    <div key={`closed-${i}`} className="rounded-xl border border-white/8 bg-slate-900/60 p-3">
                      <div className="text-xs font-semibold text-slate-200 truncate">{escapeText(pos.option?.tradingsymbol || pos.symbol)}</div>
                      <div className="mt-1 text-[11px] text-slate-500">{escapeText(pos.exit?.reason || "—")}</div>
                      <div className="mt-1 text-[11px] text-slate-600">Spot {escapeText(pos.exit?.spotPrice)} · {pos.closedAt ? new Date(pos.closedAt).toLocaleDateString() : ""}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/8 bg-slate-900/30 px-4 py-8 text-center text-xs text-slate-600">No closed trades yet.</div>
              )}
            </section>

            {/* Paper trail */}
            <section>
              <div className="mb-3 text-sm font-bold text-slate-200">Transaction log</div>
              <div className="flex flex-col gap-1.5">
                {(paperWallet?.transactions || []).slice(-8).reverse().map((item, i) => (
                  <div key={item.id ?? i} className="flex items-center justify-between gap-3 rounded-lg border border-white/6 bg-slate-900/50 px-3 py-2 text-xs">
                    <span className={`font-semibold ${item.type === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>{escapeText(item.type)}</span>
                    <span className="flex-1 truncate text-slate-400">{escapeText(item.option)}</span>
                    <span className="tabular-nums text-slate-300 shrink-0">@{item.optionPrice != null ? inr(item.optionPrice) : "—"}</span>
                    <span className={`tabular-nums shrink-0 font-semibold ${(item.amount ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{item.amount != null ? ((item.amount >= 0 ? "+" : "") + inr(item.amount)) : "—"}</span>
                  </div>
                ))}
                {!paperWallet?.transactions?.length && <div className="text-xs text-slate-600 py-4 text-center">No transactions yet.</div>}
              </div>
            </section>

            {/* Reset + advanced */}
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/6 bg-slate-900/30 px-4 py-3">
              <button type="button" disabled={loading} onClick={() => void resetPaperWallet()} className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20 disabled:opacity-50">Reset paper wallet</button>
              <span className="text-[10px] text-slate-600">{paperWallet?.cashBalance != null ? `Cash: ${inr(paperWallet.cashBalance)}` : ""}{data?.config?.paperInitialCapital != null ? ` · Cap: ${inr(data.config.paperInitialCapital, 0)}` : ""}</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 4 · STATS — Performance analytics + wallet summary
        ══════════════════════════════════════════════════════════════════ */}
        {pageTab === "stats" && (
          <div className="flex flex-col gap-5">

            {/* Quick summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/8 bg-slate-800/50 px-4 py-3 text-center">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">Win rate</div>
                <div className="text-2xl font-black text-emerald-400">{analytics?.winRatePct != null ? `${analytics.winRatePct}%` : "—"}</div>
              </div>
              <div className="rounded-xl border border-white/8 bg-slate-800/50 px-4 py-3 text-center">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">W / L</div>
                <div className="text-xl font-bold">
                  <span className="text-emerald-400">{analytics?.wins ?? 0}W</span>
                  <span className="text-slate-600 mx-1">/</span>
                  <span className="text-rose-400">{analytics?.losses ?? 0}L</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-slate-800/50 px-4 py-3 text-center">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">Total P&L</div>
                <div className={`text-xl font-bold tabular-nums ${(analytics?.totalRealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {analytics?.totalRealizedPnl != null ? ((analytics.totalRealizedPnl >= 0 ? "+" : "") + inr(analytics.totalRealizedPnl)) : "—"}
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-slate-800/50 px-4 py-3 text-center">
                <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">Closed trades</div>
                <div className="text-2xl font-black text-slate-100">{analytics?.closedCount ?? 0}</div>
              </div>
            </div>

            <PaperAnalyticsBoard analytics={analytics} />

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/6">
              <a href="/api/export/trading-day?format=csv" target="_blank" rel="noreferrer" className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-slate-300 hover:border-white/40">Export today's journal (CSV)</a>
            </div>

            {/* Advanced tools */}
            <details className="group rounded-xl border border-white/8 bg-slate-900/40">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-semibold text-slate-500 hover:text-slate-300 [&::-webkit-details-marker]:hidden">
                <span>Advanced tools</span>
                <span className="text-slate-600 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="border-t border-white/6 px-4 pb-4 pt-3 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {COMMANDS.map((item) => (
                    <button key={item.command} type="button" className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition hover:brightness-110 disabled:opacity-60 ${item.className}`} disabled={loading} onClick={() => handleCommand(item.command)}>{item.label}</button>
                  ))}
                </div>
                {output && output !== "Dashboard readying..." && (
                  <pre className="terminal terminal-compact max-h-36 text-[10px]">{output}</pre>
                )}
              </div>
            </details>
          </div>
        )}

      </main>
    </>
  );
}
