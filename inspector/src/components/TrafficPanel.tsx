"use client";

import { useEffect, useState } from "react";
import { ProbeResult, TrafficEvent } from "../types";
import { clearTraffic, fetchTraffic, probeEndpoint } from "../lib/api";

interface TrafficPanelProps {
  onOpenProbe: (result: ProbeResult) => void;
}

const QUICK_FILTERS = ["ALL", "/sep24", "/sep38", "/sep12", "/auth", "/health"];
const QUICK_PROBES = [
  { label: "stellar.toml", path: "/.well-known/stellar.toml" },
  { label: "/sep24/info", path: "/sep24/info" },
  { label: "/sep38/info", path: "/sep38/info" },
  { label: "/health", path: "/health" },
];

export default function TrafficPanel({ onOpenProbe }: TrafficPanelProps) {
  const [events, setEvents] = useState<TrafficEvent[]>([]);
  const [prefix, setPrefix] = useState("");
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [probingPath, setProbingPath] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TrafficEvent | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadTraffic = async (filterPrefix = prefix) => {
    try {
      const data = await fetchTraffic(filterPrefix === "ALL" ? "" : filterPrefix, 50);
      setEvents(data.events || []);
    } catch {
      // ignore network errors if engine offline
    }
  };

  useEffect(() => {
    loadTraffic();
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      loadTraffic();
    }, 2500);
    return () => clearInterval(interval);
  }, [prefix, autoRefresh]);

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearTraffic();
      setEvents([]);
      setSelectedEvent(null);
    } catch (err: unknown) {
      console.error("Failed to clear traffic:", err);
    } finally {
      setClearing(false);
    }
  };

  const handleQuickProbe = async (path: string) => {
    setProbingPath(path);
    try {
      const result = await probeEndpoint(path);
      onOpenProbe(result);
      // Immediately reload traffic to show the probe event
      setTimeout(() => loadTraffic(), 300);
    } finally {
      setProbingPath(null);
    }
  };

  const getStatusBadge = (status: number) => {
    if (status >= 200 && status < 300) {
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    }
    if (status >= 300 && status < 400) {
      return "text-cyan-400 bg-cyan-500/10 border-cyan-500/30";
    }
    if (status >= 400 && status < 500) {
      return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    }
    return "text-rose-400 bg-rose-500/10 border-rose-500/30";
  };

  const getMethodBadge = (method: string) => {
    switch (method.toUpperCase()) {
      case "GET":
        return "text-sky-400 bg-sky-500/10 border-sky-500/30";
      case "POST":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
      case "PUT":
        return "text-amber-400 bg-amber-500/10 border-amber-500/30";
      case "DELETE":
        return "text-rose-400 bg-rose-500/10 border-rose-500/30";
      default:
        return "text-slate-400 bg-slate-500/10 border-slate-500/30";
    }
  };

  return (
    <div className="bg-[#0E1524] border border-slate-800 rounded p-4 flex flex-col gap-3 font-mono">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <h2 className="text-sm font-bold tracking-tight text-white uppercase">
            Live Traffic Stream
          </h2>
          <span className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
            {events.length} buffered
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors ${
              autoRefresh
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-400"
                : "bg-slate-800 border-slate-700 text-slate-400"
            }`}
          >
            {autoRefresh ? "POLLING ~2.5s" : "PAUSED"}
          </button>
          <button
            type="button"
            onClick={() => loadTraffic()}
            disabled={loading}
            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] border border-slate-700"
          >
            REFRESH
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={clearing}
            className="px-2 py-1 rounded bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 text-[11px] border border-rose-800/50"
          >
            {clearing ? "CLEARING..." : "CLEAR LOG"}
          </button>
        </div>
      </div>

      {/* Quick Probe Strip */}
      <div className="bg-[#090D16] border border-slate-800/80 rounded p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Quick Probes:
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_PROBES.map((probe) => (
            <button
              key={probe.path}
              type="button"
              onClick={() => handleQuickProbe(probe.path)}
              disabled={probingPath === probe.path}
              className="px-2.5 py-1 rounded bg-indigo-950/40 hover:bg-indigo-900/50 text-indigo-300 text-[11px] font-medium border border-indigo-700/50 transition-colors flex items-center gap-1"
            >
              <span>{probe.label}</span>
              {probingPath === probe.path && (
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Path Filter Chips & Input */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[10px] text-slate-400 uppercase font-semibold">
          FILTER:
        </span>
        <div className="flex flex-wrap gap-1">
          {QUICK_FILTERS.map((qf) => {
            const isSelected =
              (qf === "ALL" && prefix === "") || prefix === qf;
            return (
              <button
                key={qf}
                type="button"
                onClick={() => setPrefix(qf === "ALL" ? "" : qf)}
                className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                  isSelected
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 font-bold"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {qf}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          placeholder="Custom prefix (e.g. /auth)..."
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          className="ml-auto bg-[#090D16] border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 w-full sm:w-48"
        />
      </div>

      {/* Event Stream Table */}
      <div className="border border-slate-800 rounded bg-[#090D16] overflow-hidden flex flex-col">
        <div className="overflow-x-auto max-h-[460px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#0C121E] text-slate-400 text-[10px] uppercase font-semibold tracking-wider sticky top-0 border-b border-slate-800">
              <tr>
                <th className="py-2 px-3">TIME</th>
                <th className="py-2 px-3">METHOD</th>
                <th className="py-2 px-3">PATH</th>
                <th className="py-2 px-3">STATUS</th>
                <th className="py-2 px-3 text-right">LATENCY</th>
                <th className="py-2 px-3 text-center">FLAG</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-slate-400 text-xs"
                  >
                    No traffic matching filter. Click a Quick Probe above to trigger activity.
                  </td>
                </tr>
              ) : (
                events.map((evt) => {
                  const timeStr = new Date(evt.timestamp).toLocaleTimeString();
                  const isSelected = selectedEvent?.id === evt.id;
                  return (
                    <tr
                      key={evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      className={`cursor-pointer transition-colors hover:bg-slate-800/40 ${
                        isSelected ? "bg-cyan-950/30" : ""
                      }`}
                    >
                      <td className="py-2 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                        {timeStr}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getMethodBadge(
                            evt.method
                          )}`}
                        >
                          {evt.method}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-200 font-medium max-w-[260px] truncate">
                        {evt.path}
                        {evt.query ? (
                          <span className="text-slate-400 text-[11px]">
                            ?{evt.query}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(
                            evt.status_code
                          )}`}
                        >
                          {evt.status_code}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-slate-300 font-medium whitespace-nowrap">
                        {evt.duration_ms} ms
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        {evt.chaos_injected ? (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                            CHAOS
                          </span>
                        ) : (
                          <span className="text-slate-700 text-[10px]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Selected Event Detail Drawer */}
        {selectedEvent && (
          <div className="border-t border-slate-800 bg-[#0C121E] p-3 text-xs flex flex-col gap-1.5 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-semibold text-[10px]">
                  EVENT DETAILS:
                </span>
                <span className="text-cyan-400 text-[11px]">
                  {selectedEvent.id}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="text-[10px] text-slate-400 hover:text-white"
              >
                CLOSE
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-300 bg-[#090D16] p-2 rounded border border-slate-800">
              <div>
                <span className="text-slate-400 block text-[10px]">URI:</span>
                <span className="font-semibold break-all">
                  {selectedEvent.method} {selectedEvent.path}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">STATUS:</span>
                <span className="font-semibold">
                  {selectedEvent.status_code}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">LATENCY:</span>
                <span className="font-semibold">
                  {selectedEvent.duration_ms} ms
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">CHAOS:</span>
                <span
                  className={
                    selectedEvent.chaos_injected
                      ? "text-rose-400 font-bold"
                      : "text-slate-400"
                  }
                >
                  {selectedEvent.chaos_injected ? "INJECTED" : "CLEAN"}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
