"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminOverview, ChaosSnapshot, ProbeResult } from "../types";
import { fetchOverview } from "../lib/api";
import Header from "../components/Header";
import KpiStrip from "../components/KpiStrip";
import ChaosPanel from "../components/ChaosPanel";
import TrafficPanel from "../components/TrafficPanel";
import WebhooksPanel from "../components/WebhooksPanel";
import ProbeModal from "../components/ProbeModal";

export default function Home() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchOverview();
      setOverview(data);
      setConnected(true);
      setLastUpdated(new Date());
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    const interval = setInterval(() => {
      loadOverview();
    }, 2500);
    return () => clearInterval(interval);
  }, [loadOverview]);

  const handleChaosUpdated = (newChaos: ChaosSnapshot) => {
    setOverview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        chaos: newChaos,
      };
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090D16]">
      {/* Top Header */}
      <Header
        connected={connected}
        anchor={overview?.anchor ?? null}
        lastUpdated={lastUpdated}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-5 flex flex-col gap-5">
        {/* KPI Strip */}
        <KpiStrip counts={overview?.counts ?? null} loading={loading} />

        {/* Workbench Panels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Chaos Fault Injector & Webhooks */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <ChaosPanel
              initialChaos={overview?.chaos ?? null}
              onChaosUpdated={handleChaosUpdated}
            />
            <WebhooksPanel onRefreshOverview={loadOverview} />
          </div>

          {/* Right Column: Live Traffic Stream & Quick Probes */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <TrafficPanel onOpenProbe={(result) => setProbeResult(result)} />
          </div>
        </div>
      </main>

      {/* Probe Result Modal */}
      <ProbeModal
        result={probeResult}
        onClose={() => setProbeResult(null)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#0C121E] py-3 px-4 lg:px-6 mt-auto">
        <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
          <div>
            SEPBox Phase 8 Inspector • Live Traffic, Chaos Fault Injector & Webhook Replay
          </div>
          <div>
            Next.js 16 • React 19 • Tailwind CSS v4 • Docker Standalone
          </div>
        </div>
      </footer>
    </div>
  );
}
