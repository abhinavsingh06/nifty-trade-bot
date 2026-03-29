import { useEffect, useState, startTransition } from "react";
import { NoticeStack } from "./components/NoticeStack";
import { RouteTabs } from "./components/RouteTabs";
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
  outcomeClasses,
  sentimentClasses,
  wsClasses,
  wsLabel,
} from "./ui";

export default function App() {
  const isCryptoRoute =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/crypto");
  const [data, setData] = useState<DashboardState | null>(null);
  const [cryptoData, setCryptoData] = useState<CryptoDashboardState | null>(
    null,
  );
  const [output, setOutput] = useState("Dashboard readying...");
  const [loading, setLoading] = useState(false);
  const [socketState, setSocketState] = useState<WsState>("connecting");
  const [notices, setNotices] = useState<Notice[]>([]);

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
      setOutput(
        `Paper trade entered at premium ${payload.result?.estimatedOptionPrice ?? "-"}.`,
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
      setOutput(
        `Paper trade exited at premium ${payload.result?.optionPrice ?? "-"}.`,
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
  const zerodhaSessionLabel =
    session?.profile?.userName?.trim() ||
    session?.profile?.userId?.trim() ||
    null;
  const positions = data?.runtime.positions;
  const intelligence = data?.intelligence;
  const charts = data?.charts;
  const priceLine =
    charts?.line?.map((point) => ({
      label: new Date(point.time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      value: point.value,
    })) || [];
  const pnlLine =
    charts?.pnlHistory?.map((point) => ({
      label: point.date,
      value: point.realizedPnL,
    })) || [];
  const totalRealizedPnl =
    charts?.pnlHistory?.reduce((sum, entry) => sum + entry.realizedPnL, 0) ?? 0;
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

  if (isCryptoRoute) {
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
            <RouteTabs crypto />
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
          <StatCard label="Status" value={cryptoData?.status || "-"} />
          <StatCard label="Bias" value={cryptoData?.market?.bias || "-"} />
          <StatCard
            label="Latest Close"
            value={cryptoData?.market?.latestClose || "-"}
          />
          <StatCard
            label="Move %"
            value={
              typeof cryptoData?.market?.changePct === "number"
                ? cryptoData.market.changePct.toFixed(2)
                : "-"
            }
          />
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
                {typeof cryptoData?.market?.changePct === "number"
                  ? cryptoData.market.changePct.toFixed(2)
                  : "-"}
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

  return (
    <>
      <NoticeStack
        notices={notices}
        onClose={(id) =>
          setNotices((current) => current.filter((item) => item.id !== id))
        }
      />
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0f172a]/95 shadow-[0_8px_32px_rgba(2,6,23,0.35)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6 lg:px-8">
          <RouteTabs crypto={false} />
          {zerodhaSessionLabel ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <div
                className="flex max-w-[min(100%,16rem)] items-center gap-2 truncate rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white"
                title={escapeText(zerodhaSessionLabel)}>
                <span className="truncate font-semibold text-white">
                  {escapeText(zerodhaSessionLabel)}
                </span>
                {session?.status ? (
                  <span className="shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
                    {escapeText(session.status)}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-white/40 hover:text-white"
                onClick={startZerodhaLogin}>
                Reconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-100"
              onClick={startZerodhaLogin}>
              Login to Zerodha
            </button>
          )}
        </div>
      </header>
      <main className="relative mx-auto max-w-[1600px] px-4 pb-12 pt-4 md:px-6 lg:px-8">
        <TradeSuggestionsHub
          data={data}
          loading={loading}
          onRunCommand={handleCommand}
          onRefreshDashboard={() =>
            refresh()
              .then(() => {
                setOutput("Dashboard refreshed.");
                pushNotice(
                  "success",
                  "Refreshed",
                  "Dashboard state refreshed.",
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
          }
          onApplySuggestion={applySuggestion}
          onPaperBuy={enterPaperTrade}
          onAiAnalysis={runAiAnalysis}
        />

        <section className="mb-8 flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-4 backdrop-blur-md md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${wsClasses(socketState)}`}>
              {wsLabel(socketState)}
            </span>
            <span
              className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${charts?.marketOpenNow ? "bg-emerald-500/15 text-emerald-200" : "bg-white/5 text-slate-400"}`}>
              {charts?.marketOpenNow ? "Market open" : "Market closed"}
            </span>
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs font-medium text-slate-400">
              Mode <span className="text-slate-200">{data?.config.botMode?.toUpperCase() || "—"}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {COMMANDS.map((item) => (
              <button
                key={item.command}
                type="button"
                className={`rounded-full px-3 py-2 text-left text-xs font-semibold transition hover:-translate-y-0.5 disabled:opacity-60 sm:text-sm ${item.className}`}
                disabled={loading}
                onClick={() => handleCommand(item.command)}>
                {item.label}
              </button>
            ))}
          </div>
        </section>

      <section className="mt-2 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Bot Mode"
          value={data?.config.botMode?.toUpperCase() || "-"}
        />
        <StatCard label="Session" value={session?.status || "-"} />
        <StatCard label="Open Positions" value={positions?.open?.length || 0} />
        <StatCard
          label="Closed Positions"
          value={positions?.closed?.length || 0}
        />
        <StatCard label="Realized P&L" value={totalRealizedPnl.toFixed(2)} />
      </section>

      <section className="mt-6">
        <article className="rounded-[28px] border border-white/8 bg-[#111827]/88 p-6 shadow-[0_18px_60px_rgba(2,6,23,0.35)] backdrop-blur">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Paper Wallet
            </p>
            <h2 className="mt-1 text-3xl font-semibold text-white">
              Fake INR paper trading
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <span className="text-sm text-slate-400">Initial capital</span>
              <strong className="mt-2 block text-2xl text-white">
                {escapeText(paperWallet?.initialCapital)}
              </strong>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <span className="text-sm text-slate-400">Cash balance</span>
              <strong className="mt-2 block text-2xl text-white">
                {escapeText(paperWallet?.cashBalance)}
              </strong>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <span className="text-sm text-slate-400">Open value</span>
              <strong className="mt-2 block text-2xl text-white">
                {escapeText(paperWallet?.openPositionsValue)}
              </strong>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <span className="text-sm text-slate-400">Unrealized P&amp;L</span>
              <strong className="mt-2 block text-2xl text-white">
                {escapeText(paperWallet?.unrealizedPnL)}
              </strong>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <span className="text-sm text-slate-400">Equity</span>
              <strong className="mt-2 block text-2xl text-white">
                {escapeText(paperWallet?.equity)}
              </strong>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Use <span className="font-semibold">Paper Buy</span> on a setup to
            open a fake-money CALL or PUT position, then monitor live results
            without risking real capital.
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Validation
              </p>
              <h2 className="mt-1 font-display text-3xl text-slate-900">
                Backtest scorecard
              </h2>
            </div>
            <button
              className="rounded-full bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={loading}
              onClick={() => handleCommand("backtest")}>
              Run Backtest
            </button>
          </div>
          {data?.runtime.validationSummary?.stats ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">Win rate</span>
                  <strong className="mt-2 block text-2xl text-slate-900">
                    {escapeText(data.runtime.validationSummary.stats.winRate)}%
                  </strong>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">Expectancy</span>
                  <strong className="mt-2 block text-2xl text-slate-900">
                    {escapeText(
                      data.runtime.validationSummary.stats.expectancyR,
                    )}{" "}
                    R
                  </strong>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">Max drawdown</span>
                  <strong className="mt-2 block text-2xl text-slate-900">
                    {escapeText(
                      data.runtime.validationSummary.stats.maxDrawdownR,
                    )}{" "}
                    R
                  </strong>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <span className="text-sm text-slate-500">Signals</span>
                  <strong className="mt-2 block text-xl text-slate-900">
                    {escapeText(
                      data.runtime.validationSummary.stats.totalSignals,
                    )}
                  </strong>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <span className="text-sm text-slate-500">Closed</span>
                  <strong className="mt-2 block text-xl text-slate-900">
                    {escapeText(
                      data.runtime.validationSummary.stats.closedSignals,
                    )}
                  </strong>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4">
                  <span className="text-sm text-emerald-700">Avg win</span>
                  <strong className="mt-2 block text-xl text-emerald-900">
                    {escapeText(data.runtime.validationSummary.stats.avgWinR)} R
                  </strong>
                </div>
                <div className="rounded-2xl bg-rose-50 p-4">
                  <span className="text-sm text-rose-700">Avg loss</span>
                  <strong className="mt-2 block text-xl text-rose-900">
                    {escapeText(data.runtime.validationSummary.stats.avgLossR)}{" "}
                    R
                  </strong>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
              Run the backtest first so we can measure whether these setups have
              positive expectancy before trusting them with money.
            </div>
          )}
        </article>

        <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Confirmation Gate
            </p>
            <h2 className="mt-1 font-display text-3xl text-slate-900">
              Current setup quality
            </h2>
          </div>
          {signal?.confirmations ? (
            <div className="space-y-4">
              <div className="rounded-[24px] bg-slate-900 p-5 text-white">
                <p className="text-sm uppercase tracking-[0.22em] text-slate-300">
                  Confirmations passed
                </p>
                <h3 className="mt-2 text-4xl font-semibold">
                  {signal.confirmations.count}/
                  {signal.confirmations.minimumRequired}
                </h3>
                <p className="mt-3 text-slate-200">
                  The bot now requires a confirmation stack, not just a raw
                  direction score.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["Trend aligned", signal.confirmations.trendAligned],
                  [
                    "Breakout/Breakdown",
                    signal.confirmations.breakoutConfirmed,
                  ],
                  ["Momentum", signal.confirmations.momentumConfirmed],
                  ["Structure hold", signal.confirmations.structureHeld],
                  ["Candle body", signal.confirmations.candleBodyConfirmed],
                ].map(([label, passed]) => (
                  <div
                    key={String(label)}
                    className={`rounded-2xl border p-4 ${passed ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                    <span className="text-sm text-slate-500">{label}</span>
                    <strong
                      className={`mt-2 block text-lg ${passed ? "text-emerald-900" : "text-slate-900"}`}>
                      {passed ? "PASS" : "WAIT"}
                    </strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
              Run signals during market hours to see the live confirmation
              stack.
            </div>
          )}
        </article>
      </section>

      <section className="mt-6">
        <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Forward Validation
              </p>
              <h2 className="mt-1 font-display text-3xl text-slate-900">
                Live session outcome tracking
              </h2>
            </div>
            <button
              className="rounded-full bg-violet-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={loading}
              onClick={() => handleCommand("review-forward")}>
              Review Forward
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-sm text-slate-500">Pending signals</span>
              <strong className="mt-2 block text-2xl text-slate-900">
                {data?.runtime.forwardTracker?.pending?.length ?? 0}
              </strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-sm text-slate-500">Resolved signals</span>
              <strong className="mt-2 block text-2xl text-slate-900">
                {data?.runtime.forwardTracker?.resolved?.length ?? 0}
              </strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-sm text-slate-500">Last review status</span>
              <strong className="mt-2 block text-2xl text-slate-900">
                {escapeText(data?.runtime.forwardReview?.status)}
              </strong>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-sm text-slate-500">Resolved now</span>
              <strong className="mt-2 block text-2xl text-slate-900">
                {data?.runtime.forwardReview?.resolvedNow?.length ?? 0}
              </strong>
            </div>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Pending queue
              </p>
              <div className="mt-3 space-y-2 text-slate-700">
                {(data?.runtime.forwardTracker?.pending || [])
                  .slice(-5)
                  .map((item) => (
                    <p key={item.id}>
                      • {item.id} • {item.direction} • score {item.score}
                    </p>
                  ))}
                {!data?.runtime.forwardTracker?.pending?.length ? (
                  <p>No pending forward-review signals.</p>
                ) : null}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Recently resolved
              </p>
              <div className="mt-3 space-y-2 text-slate-700">
                {(data?.runtime.forwardReview?.resolvedNow || []).map(
                  (item) => (
                    <p key={item.id}>
                      • {item.id} • {item.outcome}
                    </p>
                  ),
                )}
                {!data?.runtime.forwardReview?.resolvedNow?.length ? (
                  <p>No new signal outcomes in the latest review.</p>
                ) : null}
              </div>
            </div>
          </div>
        </article>
      </section>


      <section className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Market Structure
              </p>
              <h2 className="mt-1 font-display text-3xl text-slate-900">
                Candlestick and trend line
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
              {escapeText(charts?.source)} data
            </span>
          </div>
          <div className="space-y-4">
            <CandleChart candles={charts?.candles || []} />
            <LineChart points={priceLine} />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              {escapeText(charts?.note)}
            </div>
          </div>
        </article>

        <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              P&amp;L Curve
            </p>
            <h2 className="mt-1 font-display text-3xl text-slate-900">
              Realized history view
            </h2>
          </div>
          <div className="space-y-4">
            <LineChart
              points={
                pnlLine.length ? pnlLine : [{ label: "No Data", value: 0 }]
              }
              positive={totalRealizedPnl >= 0}
            />
            <div className="grid gap-3 md:grid-cols-3">
              {(charts?.pnlHistory || []).map((point) => (
                <div
                  key={point.date}
                  className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">{point.date}</span>
                  <strong
                    className={`mt-2 block text-2xl ${point.realizedPnL >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {point.realizedPnL.toFixed(2)}
                  </strong>
                  <div className="mt-1 text-sm text-slate-600">
                    Trades {point.tradesPlaced}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr] xl:grid-cols-[0.95fr_0.65fr_0.75fr]">
        <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Technical State
            </p>
            <h2 className="mt-1 font-display text-3xl text-slate-900">
              Latest signal
            </h2>
          </div>
          {signal ? (
            <div className="space-y-4">
              <div className="rounded-[24px] bg-slate-900 p-5 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm uppercase tracking-[0.22em] text-slate-300">
                      Directional signal
                    </p>
                    <h3 className="mt-2 text-3xl font-semibold">
                      {escapeText(signal.direction)} {escapeText(signal.status)}
                    </h3>
                  </div>
                  <div className="rounded-full bg-white/10 px-4 py-2 text-sm">
                    Score {escapeText(signal.score)}/10
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-white/10 p-4">
                    Option
                    <br />
                    <strong className="text-lg">
                      {escapeText(
                        signal.option?.tradingsymbol || "Not resolved",
                      )}
                    </strong>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-4">
                    Spot
                    <br />
                    <strong className="text-lg">
                      {escapeText(signal.spotPrice)}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">Entry</span>
                  <strong className="mt-2 block text-2xl">
                    {escapeText(signal.entryZone?.join(" - "))}
                  </strong>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">Stop</span>
                  <strong className="mt-2 block text-2xl">
                    {escapeText(signal.stopLoss)}
                  </strong>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">Targets</span>
                  <strong className="mt-2 block text-xl">
                    {escapeText(signal.targets?.join(", "))}
                  </strong>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Setup reasons
                </p>
                <p className="mt-2 text-slate-700">
                  {escapeText(signal.reasons?.join("; "))}
                </p>
              </div>
            </div>
          ) : signalArtifact?.status === "SKIPPED" ? (
            <div className="space-y-4">
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-5">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Signals skipped
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-amber-950">
                  Market closed or live analysis unavailable
                </h3>
                <p className="mt-3 text-amber-900">
                  {escapeText(signalArtifact.reason)}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">Last attempt</span>
                  <strong className="mt-2 block text-lg text-slate-900">
                    {escapeText(signalArtifact.timestamp)}
                  </strong>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-sm text-slate-500">What to do</span>
                  <strong className="mt-2 block text-lg text-slate-900">
                    Run during market hours or use Smoke Test
                  </strong>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
                NIFTY live signals are available on weekdays during Indian
                market hours, 9:15 AM to 3:30 PM IST.
              </div>
            </div>
          ) : signalArtifact?.status && signalArtifact.status !== "SKIPPED" ? (
            <div className="rounded-[24px] border border-rose-200 bg-rose-50 p-5 text-rose-900">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-rose-700">
                Signal runtime status
              </p>
              <h3 className="mt-2 text-2xl font-semibold">
                {escapeText(signalArtifact.status)}
              </h3>
              <p className="mt-3">
                {escapeText(
                  signalArtifact.reason || "No signal payload was produced.",
                )}
              </p>
            </div>
          ) : (
            <div className="flex min-h-[260px] items-center text-slate-500">
              No signal data yet.
            </div>
          )}
        </article>

        <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Operations
            </p>
            <h2 className="mt-1 font-display text-3xl text-slate-900">
              Monitor & reconcile
            </h2>
          </div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <strong className="block text-lg text-slate-900">Monitor</strong>
              <span className="mt-2 block text-slate-600">
                {escapeText(data?.runtime.monitor?.status || "No data")}
                {data?.runtime.monitor?.spotPrice
                  ? ` • Spot ${data.runtime.monitor.spotPrice}`
                  : ""}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <strong className="block text-lg text-slate-900">
                Reconcile
              </strong>
              <span className="mt-2 block text-slate-600">
                {escapeText(data?.runtime.reconcile?.status || "No data")} •
                Local open{" "}
                {escapeText(data?.runtime.reconcile?.totals?.localOpen ?? "-")}
              </span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <strong className="block text-lg text-slate-900">
                Auto trade note
              </strong>
              <span className="mt-2 block text-slate-600">
                {escapeText(
                  data?.runtime.autotrade?.brokerResponse?.message || "No data",
                )}
              </span>
            </div>
          </div>
        </article>

        <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Command Log
              </p>
              <h2 className="mt-1 font-display text-3xl text-slate-900">
                Run output
              </h2>
            </div>
            <button
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
              disabled={loading}
              onClick={() =>
                refresh()
                  .then(() => {
                    setOutput("Dashboard refreshed.");
                    pushNotice(
                      "success",
                      "Refreshed",
                      "Dashboard state refreshed.",
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

      <section className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Position Ledger
            </p>
            <h2 className="mt-1 font-display text-3xl text-slate-900">
              Open and recent positions
            </h2>
          </div>
          <div className="space-y-6">
            <div>
              <div className="mb-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Open
              </div>
              <div className="grid gap-3">
                {(positions?.open || []).length ? (
                  positions?.open?.map((position, index) => (
                    <div
                      key={`${position.symbol}-${index}`}
                      className="rounded-2xl border border-slate-200 bg-white p-4">
                      <strong className="block text-lg text-slate-900">
                        {escapeText(
                          position.option?.tradingsymbol || position.symbol,
                        )}
                      </strong>
                      <div className="mt-1 text-sm text-slate-500">
                        Qty {escapeText(position.quantity)} •{" "}
                        {escapeText(position.direction)} • Premium{" "}
                        {escapeText(position.entryOptionPrice)}
                      </div>
                      <div className="mt-3 text-slate-700">
                        Entry {escapeText(position.entryUnderlying)} • Stop{" "}
                        {escapeText(position.activeStopLoss)}
                      </div>
                      <div className="mt-1 text-slate-700">
                        Option stop {escapeText(position.activeOptionStopLoss)} •
                        Option now {escapeText(position.lastObservedOptionPrice)}
                      </div>
                      <div className="mt-1 text-slate-700">
                        Target1 {escapeText(position.target1)} • Target2{" "}
                        {escapeText(position.target2)}
                      </div>
                      <div className="mt-1 text-slate-700">
                        Unrealized{" "}
                        {typeof position.lastObservedOptionPrice === "number" &&
                        typeof position.entryOptionPrice === "number" &&
                        typeof position.quantity === "number"
                          ? (
                              (position.lastObservedOptionPrice -
                                position.entryOptionPrice) *
                              position.quantity
                            ).toFixed(2)
                          : "-"}
                      </div>
                      <div className="mt-4">
                        <button
                          className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                          disabled={loading}
                          onClick={() => exitPaperTrade(String(position.id))}>
                          Exit Now
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500">No open positions.</div>
                )}
              </div>
            </div>
            <div>
              <div className="mb-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                Recent Closed
              </div>
              <div className="grid gap-3">
                {(positions?.closed || [])
                  .slice(-3)
                  .reverse()
                  .map((position, index) => (
                    <div
                      key={`${position.symbol}-closed-${index}`}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <strong className="block text-lg text-slate-900">
                        {escapeText(
                          position.option?.tradingsymbol || position.symbol,
                        )}
                      </strong>
                      <div className="mt-1 text-sm text-slate-500">
                        Closed {escapeText(position.exit?.reason || "UNKNOWN")}
                      </div>
                      <div className="mt-3 text-slate-700">
                        Spot {escapeText(position.exit?.spotPrice)} • Mode{" "}
                        {escapeText(
                          position.exit?.brokerMode || position.brokerMode,
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </article>

        <article className="glass rounded-[28px] border border-white/70 bg-white/75 p-6 shadow-glow">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Paper Ledger
            </p>
            <h2 className="mt-1 font-display text-3xl text-slate-900">
              Wallet transactions
            </h2>
          </div>
          <div className="grid gap-3">
            {(paperWallet?.transactions || [])
              .slice(-8)
              .reverse()
              .map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4">
                  <strong className="block text-slate-900">
                    {escapeText(item.type)} • {escapeText(item.option)}
                  </strong>
                  <div className="mt-2 text-sm text-slate-500">
                    Qty {escapeText(item.quantity)} • Premium{" "}
                    {escapeText(item.optionPrice)} • Amount{" "}
                    {escapeText(item.amount)}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Cash after {escapeText(item.cashBalanceAfter)}
                    {item.realizedPnL != null
                      ? ` • Realized ${item.realizedPnL}`
                      : ""}
                  </div>
                </div>
              ))}
            {!paperWallet?.transactions?.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-500">
                No paper wallet transactions yet. Use Paper Buy on a setup to
                start practicing with fake INR.
              </div>
            ) : null}
          </div>
        </article>
      </section>
      </main>
    </>
  );
}
