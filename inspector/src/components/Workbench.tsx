"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminOverview, ChaosSnapshot, ProbeResult, TrafficEvent } from "../types";
import { clearTraffic, fetchOverview, fetchTraffic, probeEndpoint } from "../lib/api";
import ChaosPanel from "./ChaosPanel";
import WebhooksPanel from "./WebhooksPanel";
import TrafficPanel from "./TrafficPanel";
import InspectorPane from "./InspectorPane";
import { CopyIcon, CheckIcon } from "./Icons";

export default function Workbench() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [connected, setConnected] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [activeTab, setActiveTab] = useState<"chaos" | "webhooks">("chaos");

  // Traffic & Inspector state
  const [events, setEvents] = useState<TrafficEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TrafficEvent | null>(null);
  const [probeCache, setProbeCache] = useState<Record<string, ProbeResult>>({});
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [probingPath, setProbingPath] = useState<string | null>(null);
  const [probingSuite, setProbingSuite] = useState(false);

  // Poll overview (KPIs, anchor info, chaos state)
  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchOverview();
      setOverview(data);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  // Poll traffic events
  const loadTraffic = useCallback(async () => {
    try {
      const data = await fetchTraffic("", 50);
      setEvents(data.events || []);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadTraffic();

    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadOverview();
      loadTraffic();
    }, 2500);
    return () => clearInterval(interval);
  }, [loadOverview, loadTraffic, autoRefresh]);

  // Global keyboard shortcuts (P to pause/resume, Esc to deselect)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.key === "p" || e.key === "P") {
        e.preventDefault();
        setAutoRefresh((prev) => !prev);
      } else if (e.key === "Escape") {
        setSelectedEvent(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const chaosArmed = Boolean(overview?.chaos?.enabled);
  const signingKey = overview?.anchor?.signing_public_key || "";
  const displayKey = signingKey
    ? `${signingKey.slice(0, 6)}...${signingKey.slice(-6)}`
    : "—";

  const handleCopyKey = () => {
    if (!signingKey) return;
    navigator.clipboard.writeText(signingKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleChaosUpdated = (newChaos: ChaosSnapshot) => {
    setOverview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        chaos: newChaos,
      };
    });
  };

  // Fire a single probe
  const handleFireProbe = async (path: string) => {
    setProbingPath(path);
    try {
      const res = await probeEndpoint(path);
      setProbeCache((prev) => ({ ...prev, [path]: res }));
      const synthEvent: TrafficEvent = {
        id: `probe-${Date.now()}`,
        timestamp: res.timestamp,
        method: res.method,
        path,
        query: "",
        status_code: res.status,
        duration_ms: res.durationMs,
        content_type: res.contentType,
        chaos_injected: Boolean(res.chaosInjected),
      };
      setSelectedEvent(synthEvent);
      setTimeout(loadTraffic, 300);
    } finally {
      setProbingPath(null);
    }
  };

  // Execute standard 4-probe suite
  const handleRunProbeSuite = async () => {
    setProbingSuite(true);
    const suite = [
      "/.well-known/stellar.toml",
      "/health",
      "/sep24/info",
      "/sep38/info",
    ];
    try {
      let lastRes: ProbeResult | null = null;
      for (const path of suite) {
        const res = await probeEndpoint(path);
        setProbeCache((prev) => ({ ...prev, [path]: res }));
        lastRes = res;
      }
      await loadTraffic();
      if (lastRes) {
        setSelectedEvent({
          id: `probe-${Date.now()}`,
          timestamp: lastRes.timestamp,
          method: "GET",
          path: "/.well-known/stellar.toml",
          query: "",
          status_code: lastRes.status,
          duration_ms: lastRes.durationMs,
          content_type: lastRes.contentType,
          chaos_injected: Boolean(lastRes.chaosInjected),
        });
      }
    } finally {
      setProbingSuite(false);
    }
  };

  const handleClearTraffic = async () => {
    try {
      await clearTraffic();
      setEvents([]);
      setSelectedEvent(null);
    } catch {
      // ignore
    }
  };

  const counts = overview?.counts;
  const bufferCount = counts?.buffered_requests ?? 0;

  // Selected probe result from cache (if any)
  const currentProbeResult = selectedEvent
    ? probeCache[selectedEvent.path] || null
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#09090B] text-[#F2F2EE] font-sans antialiased select-none">
      {/* 1. Top Command Bar (48px / h-12) with 2px Signal Amber accent ONLY when chaos is armed */}
      <header
        className={`h-12 border-b border-[#1E1E24] bg-[#09090B] px-4 flex items-center justify-between gap-4 sticky top-0 z-30 transition-colors ${
          chaosArmed ? "border-t-2 border-t-[#F59E0B]" : "border-t-2 border-t-transparent"
        }`}
      >
        {/* Left: Geometric SVG Mark + SEPBox / Inspector + Status + Network */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-[4px] bg-[#18181E] border border-[#292932] flex items-center justify-center text-[#F2F2EE] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <span className="font-mono font-bold text-[10px] text-[#34D399]">✦</span>
            </div>
            <span className="font-sans font-semibold tracking-tight text-[#F2F2EE] text-sm">
              SEPBox
            </span>
            <span className="text-[#646472]">/</span>
            <span className="text-xs font-sans text-[#A0A0AD]">
              Inspector
            </span>
          </div>

          <div className="h-3 w-px bg-[#1E1E24]" />

          {/* Connection status pill */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#141418] border border-[#1E1E24]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  connected ? "bg-[#34D399]" : "bg-[#F87171]"
                }`}
              />
              <span
                className={`text-[10px] font-sans font-medium uppercase tracking-wider ${
                  connected ? "text-[#34D399]" : "text-[#F87171]"
                }`}
              >
                {connected ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[3px] bg-[#18181E] border border-[#292932] text-[#A0A0AD] hidden sm:inline">
              Testnet
            </span>
          </div>
        </div>

        {/* Right: Signing Key + Chaos State Badge */}
        <div className="flex items-center gap-3 text-xs">
          {signingKey && (
            <div className="flex items-center gap-1.5 bg-[#141418] border border-[#1E1E24] px-2.5 py-1 rounded-md text-[11px]">
              <span className="text-[#646472] font-sans">SIGNER:</span>
              <span className="text-[#F2F2EE] font-mono font-medium" title={signingKey}>
                {displayKey}
              </span>
              <button
                type="button"
                onClick={handleCopyKey}
                className="ml-1 text-[#A0A0AD] hover:text-[#F2F2EE] transition-colors"
                title="Copy full Ed25519 public key"
              >
                {copiedKey ? <CheckIcon className="w-3 h-3 text-[#34D399]" /> : <CopyIcon className="w-3 h-3" />}
              </button>
            </div>
          )}

          {/* Global Chaos Indicator Pill */}
          <div
            className={`text-[10px] font-sans font-semibold px-2 py-0.5 rounded-[3px] border uppercase tracking-wider ${
              chaosArmed
                ? "bg-[#F59E0B]/10 border-[#F59E0B]/40 text-[#F59E0B]"
                : "bg-[#18181E] border-[#1E1E24] text-[#646472]"
            }`}
          >
            {chaosArmed ? "Chaos Armed" : "Chaos Standby"}
          </div>
        </div>
      </header>

      {/* 2. Full-Width Telemetry Ribbon (100% width, 6 hairline-divided equal columns) */}
      <section className="border-b border-[#1E1E24] bg-[#0B0B0E] shrink-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full divide-y sm:divide-y-0 sm:divide-x divide-[#1E1E24] text-xs">
          {/* Cell 1: SEP-12 */}
          <div className="p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
              SEP-12 KYC
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
                {counts?.sep12_customers ?? 0}
              </span>
              <span className="text-[10px] font-sans text-[#646472]">registered</span>
            </div>
          </div>

          {/* Cell 2: SEP-38 */}
          <div className="p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
              SEP-38 QUOTES
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
                {counts?.sep38_quotes ?? 0}
              </span>
              <span className="text-[10px] font-sans text-[#646472]">firm</span>
            </div>
          </div>

          {/* Cell 3: SEP-24 */}
          <div className="p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
              SEP-24 TXS
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
                {counts?.sep24_transactions ?? 0}
              </span>
              <span className="text-[10px] font-sans text-[#646472]">tracked</span>
            </div>
          </div>

          {/* Cell 4: Subscriptions */}
          <div className="p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
              SUBSCRIPTIONS
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
                {counts?.webhook_subscriptions ?? 0}
              </span>
              <span className="text-[10px] font-sans text-[#646472]">active</span>
            </div>
          </div>

          {/* Cell 5: Deliveries */}
          <div className="p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
              DELIVERIES
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
                {counts?.webhook_deliveries ?? 0}
              </span>
              <span className="text-[10px] font-sans text-[#646472]">dispatched</span>
            </div>
          </div>

          {/* Cell 6: Buffer with progress bar */}
          <div className="p-3 flex flex-col justify-between">
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
              BUFFER
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
                {bufferCount}
                <span className="text-xs text-[#646472] font-normal font-sans ml-0.5">/200</span>
              </span>
              <span className="text-[10px] font-sans text-[#646472]">window</span>
            </div>
            <div className="w-full bg-[#18181E] h-0.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-[#34D399] h-full transition-all duration-300"
                style={{ width: `${Math.min(100, (bufferCount / 200) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 3. Main 3-Pane Master-Detail Workspace */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[336px_minmax(0,1fr)_360px] xl:grid-cols-[344px_minmax(0,1fr)_400px] min-h-[calc(100vh-104px)] divide-y lg:divide-y-0 lg:divide-x divide-[#1E1E24] overflow-hidden">
        {/* Pane 1 — Left Control Bay (#0D0D10, Secondary Weight) */}
        <section className="flex flex-col bg-[#0D0D10] overflow-y-auto">
          {/* Recessed Control Bay Tabs */}
          <div className="p-2.5 pb-0 bg-[#09090B] border-b border-[#1E1E24] shrink-0">
            <div className="bg-[#08080A] p-1 rounded-md border border-[#1E1E24] grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("chaos")}
                className={`py-1.5 text-center text-xs font-sans font-medium rounded-sm transition-all ${
                  activeTab === "chaos"
                    ? "bg-[#1E1E26] border border-[#32323E] text-[#F2F2EE] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "text-[#A0A0AD] hover:text-[#F2F2EE]"
                }`}
              >
                Chaos {chaosArmed && "•"}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("webhooks")}
                className={`py-1.5 text-center text-xs font-sans font-medium rounded-sm transition-all ${
                  activeTab === "webhooks"
                    ? "bg-[#1E1E26] border border-[#32323E] text-[#F2F2EE] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                    : "text-[#A0A0AD] hover:text-[#F2F2EE]"
                }`}
              >
                Webhooks
              </button>
            </div>
          </div>

          {/* Active Tab Component */}
          {activeTab === "chaos" ? (
            <ChaosPanel
              initialChaos={overview?.chaos ?? null}
              onChaosUpdated={handleChaosUpdated}
            />
          ) : (
            <WebhooksPanel onRefreshOverview={loadOverview} />
          )}
        </section>

        {/* Pane 2 — Center Live Traffic Stream (#111115, Primary Focus Stage) */}
        <section className="flex flex-col min-w-0 bg-[#111115] overflow-hidden">
          <TrafficPanel
            events={events}
            selectedEventId={selectedEvent?.id ?? null}
            onSelectEvent={(evt) => setSelectedEvent(evt)}
            onFireProbe={handleFireProbe}
            onRunProbeSuite={handleRunProbeSuite}
            onClearTraffic={handleClearTraffic}
            autoRefresh={autoRefresh}
            onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
            probingSuite={probingSuite}
            probingPath={probingPath}
          />
        </section>

        {/* Pane 3 — Right Docked Inspector Pane (#0D0D10, Always Populated) */}
        <section className="flex flex-col bg-[#0D0D10] overflow-hidden">
          <InspectorPane
            event={selectedEvent}
            probeResult={currentProbeResult}
            anchor={overview?.anchor ?? null}
            onClose={() => setSelectedEvent(null)}
            onFireProbe={handleFireProbe}
          />
        </section>
      </main>
    </div>
  );
}
