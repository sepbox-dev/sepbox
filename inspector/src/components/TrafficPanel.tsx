"use client";

import { useEffect, useRef, useState } from "react";
import { TrafficEvent } from "../types";
import SegmentedControl from "./SegmentedControl";
import { PlayIcon, TrashIcon } from "./Icons";

interface TrafficPanelProps {
  events: TrafficEvent[];
  selectedEventId: string | null;
  onSelectEvent: (event: TrafficEvent) => void;
  onFireProbe: (path: string) => void;
  onRunProbeSuite: () => void;
  onClearTraffic: () => void;
  autoRefresh: boolean;
  onToggleAutoRefresh: () => void;
  probingSuite: boolean;
  probingPath: string | null;
}

const ROUTE_FILTER_OPTIONS = [
  { label: "ALL", value: "" },
  { label: "/sep24", value: "/sep24" },
  { label: "/sep38", value: "/sep38" },
  { label: "/sep12", value: "/sep12" },
  { label: "/auth", value: "/auth" },
];

const QUICK_PROBES = [
  { label: "stellar.toml", path: "/.well-known/stellar.toml" },
  { label: "/sep24/info", path: "/sep24/info" },
  { label: "/sep38/info", path: "/sep38/info" },
  { label: "/health", path: "/health" },
];

export default function TrafficPanel({
  events,
  selectedEventId,
  onSelectEvent,
  onFireProbe,
  onRunProbeSuite,
  onClearTraffic,
  autoRefresh,
  onToggleAutoRefresh,
  probingSuite,
  probingPath,
}: TrafficPanelProps) {
  const [prefix, setPrefix] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Press "/" anywhere to focus search filter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Filter events by prefix and query
  const filteredEvents = events.filter((e) => {
    if (prefix && !e.path.startsWith(prefix)) return false;
    if (!searchQuery.trim()) return true;
    const term = searchQuery.toLowerCase();
    return (
      e.path.toLowerCase().includes(term) ||
      e.query.toLowerCase().includes(term) ||
      String(e.status_code).includes(term)
    );
  });

  const getStatusColor = (code: number) => {
    if (code >= 200 && code < 300) return "text-[#34D399]";
    if (code >= 400 && code < 500) return "text-[#F59E0B]";
    return "text-[#F87171]";
  };

  return (
    <div className="flex flex-col h-full bg-[#111115] text-[#F2F2EE] font-sans text-xs overflow-hidden">
      {/* 1. Header Toolbar */}
      <div className="h-11 px-3.5 border-b border-[#1E1E24] bg-[#111115] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="font-sans font-semibold text-xs text-[#F2F2EE] tracking-tight">
            Live Traffic
          </span>

          {/* Polling Toggle Pill */}
          <button
            type="button"
            onClick={onToggleAutoRefresh}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#18181E] border border-[#292932] text-[10px] text-[#A0A0AD] hover:text-[#F2F2EE] transition-colors"
            title="Toggle Polling Pause / Live (Shortcut: P)"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                autoRefresh ? "bg-[#34D399] animate-pulse" : "bg-[#F59E0B]"
              }`}
            />
            <span className="font-sans font-medium">
              {autoRefresh ? "Live 2.5s" : "Paused"}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Prefix Segmented Control */}
          <SegmentedControl
            options={ROUTE_FILTER_OPTIONS}
            value={prefix}
            onChange={(val) => setPrefix(String(val))}
          />

          {/* Search Input */}
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search (/ to focus)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#18181E] border border-[#292932] rounded-md px-2 py-1 text-[11px] text-[#F2F2EE] placeholder-[#646472] font-mono focus:outline-none focus:border-[#3A3A47] w-32 sm:w-40 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1 text-[10px] text-[#646472] hover:text-[#F2F2EE]"
              >
                ×
              </button>
            )}
          </div>

          {/* Run Suite Primary Button */}
          <button
            type="button"
            onClick={onRunProbeSuite}
            disabled={probingSuite}
            className="px-2.5 py-1 rounded-md bg-[#F2F2EE] hover:bg-white text-[#09090B] font-sans text-xs font-semibold transition-all inline-flex items-center gap-1.5 shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] disabled:opacity-50"
            title="Execute 4 standard protocol probes in sequence"
          >
            <PlayIcon className="w-3 h-3" />
            <span>{probingSuite ? "Running..." : "Run Suite"}</span>
          </button>

          {/* Clear Button */}
          <button
            type="button"
            onClick={onClearTraffic}
            className="p-1 rounded-md bg-[#18181E] hover:bg-[#202028] border border-[#292932] text-[#A0A0AD] hover:text-[#F87171] transition-colors"
            title="Clear in-memory traffic log"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Tactile Quick Probe Action Strip */}
      <div className="px-3.5 py-2 border-b border-[#1E1E24] bg-[#0E0E12] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
          QUICK PROBES:
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_PROBES.map((probe) => (
            <button
              key={probe.path}
              type="button"
              onClick={() => onFireProbe(probe.path)}
              disabled={probingPath === probe.path}
              className="px-2.5 py-1 rounded-md bg-[#18181E] hover:bg-[#202028] text-[#F2F2EE] text-[11px] border border-[#292932] hover:border-[#3A3A47] transition-all flex items-center gap-1.5 font-mono shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              <PlayIcon className="w-2.5 h-2.5 text-[#34D399]" />
              <span className="text-[9px] font-bold px-1 rounded-[2px] bg-[#09090B] text-[#A0A0AD]">
                GET
              </span>
              <span>{probe.label}</span>
              {probingPath === probe.path && (
                <span className="h-1 w-1 rounded-full bg-[#F59E0B] animate-ping" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Main Stream Area (Table or Actionable Empty State) */}
      <div className="flex-1 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          /* Actionable Empty State — Refined Protocol Quick-Start Card */
          <div className="h-full flex items-center justify-center p-6">
            <div className="max-w-md w-full p-6 rounded-lg bg-[#0E0E12] border border-[#1E1E24] shadow-xl text-center space-y-4">
              <div className="w-10 h-10 rounded-full bg-[#18181E] border border-[#292932] mx-auto flex items-center justify-center text-[#F2F2EE]">
                <PlayIcon className="w-4 h-4 text-[#34D399]" />
              </div>

              <div>
                <h3 className="font-sans font-semibold text-sm text-[#F2F2EE]">
                  Protocol Quick-Start Launchpad
                </h3>
                <p className="text-xs text-[#A0A0AD] font-sans mt-1 leading-relaxed">
                  SEPBox engine is active on <code className="font-mono text-[#F2F2EE]">localhost:8000</code>. No inbound requests are currently buffered.
                </p>
              </div>

              {/* Main Suite Action */}
              <button
                type="button"
                onClick={onRunProbeSuite}
                disabled={probingSuite}
                className="w-full py-2 px-4 rounded-md bg-[#F2F2EE] hover:bg-white text-[#09090B] font-sans text-xs font-semibold transition-all inline-flex items-center justify-center gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] disabled:opacity-50"
              >
                <PlayIcon className="w-3.5 h-3.5" />
                <span>{probingSuite ? "Executing Protocol Probes..." : "Run Probe Suite (4 Requests)"}</span>
              </button>

              {/* 3 Clickable Scenario Rows */}
              <div className="space-y-1.5 pt-2 border-t border-[#1E1E24] text-left">
                <button
                  type="button"
                  onClick={() => onFireProbe("/.well-known/stellar.toml")}
                  className="w-full p-2.5 rounded-md bg-[#141418] hover:bg-[#18181E] border border-[#1E1E24] hover:border-[#292932] transition-all flex items-center justify-between text-xs font-sans group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold px-1 rounded-[2px] bg-[#18181E] text-[#A0A0AD]">
                      GET
                    </span>
                    <span className="text-[#F2F2EE] group-hover:text-white font-medium">
                      Inspect SEP-1 Discovery
                    </span>
                  </div>
                  <PlayIcon className="w-3 h-3 text-[#646472] group-hover:text-[#34D399] transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() => onFireProbe("/sep24/info")}
                  className="w-full p-2.5 rounded-md bg-[#141418] hover:bg-[#18181E] border border-[#1E1E24] hover:border-[#292932] transition-all flex items-center justify-between text-xs font-sans group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold px-1 rounded-[2px] bg-[#18181E] text-[#A0A0AD]">
                      GET
                    </span>
                    <span className="text-[#F2F2EE] group-hover:text-white font-medium">
                      Check SEP-24 Capabilities
                    </span>
                  </div>
                  <PlayIcon className="w-3 h-3 text-[#646472] group-hover:text-[#34D399] transition-colors" />
                </button>

                <button
                  type="button"
                  onClick={() => onFireProbe("/sep38/info")}
                  className="w-full p-2.5 rounded-md bg-[#141418] hover:bg-[#18181E] border border-[#1E1E24] hover:border-[#292932] transition-all flex items-center justify-between text-xs font-sans group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono font-bold px-1 rounded-[2px] bg-[#18181E] text-[#A0A0AD]">
                      GET
                    </span>
                    <span className="text-[#F2F2EE] group-hover:text-white font-medium">
                      Fetch SEP-38 FX Pricing
                    </span>
                  </div>
                  <PlayIcon className="w-3 h-3 text-[#646472] group-hover:text-[#34D399] transition-colors" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Dense Scannable Traffic Table */
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead className="bg-[#0E0E12] text-[#646472] text-[10px] uppercase font-sans font-medium tracking-[0.06em] sticky top-0 border-b border-[#1E1E24] z-10">
              <tr>
                <th className="py-2 px-3 w-20">TIME</th>
                <th className="py-2 px-2 w-14">METHOD</th>
                <th className="py-2 px-3">ENDPOINT</th>
                <th className="py-2 px-2 w-16">STATUS</th>
                <th className="py-2 px-3 w-24 text-right">LATENCY</th>
                <th className="py-2 px-2 w-16 text-center">CHAOS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E1E24]">
              {filteredEvents.map((evt) => {
                const timeStr = new Date(evt.timestamp).toLocaleTimeString();
                const isSelected = selectedEventId === evt.id;
                return (
                  <tr
                    key={evt.id}
                    onClick={() => onSelectEvent(evt)}
                    className={`cursor-pointer transition-colors relative ${
                      isSelected
                        ? "bg-[#1C1C24] text-[#F2F2EE]"
                        : "hover:bg-[#141418] text-[#A0A0AD]"
                    }`}
                  >
                    <td className="py-2 px-3 text-[11px] tabular-nums whitespace-nowrap text-[#646472] relative">
                      {isSelected && (
                        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#F2F2EE]" />
                      )}
                      {timeStr}
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap">
                      <span className="font-semibold text-[11px] text-[#F2F2EE]">
                        {evt.method}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-medium max-w-[240px] truncate text-[#F2F2EE]">
                      {evt.path}
                      {evt.query ? (
                        <span className="text-[#646472]">?{evt.query}</span>
                      ) : null}
                    </td>
                    <td className="py-2 px-2 whitespace-nowrap tabular-nums">
                      <span className={`font-semibold ${getStatusColor(evt.status_code)}`}>
                        {evt.status_code}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap text-[#A0A0AD]">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-[11px]">{evt.duration_ms} ms</span>
                        <div className="w-8 bg-[#18181E] h-1 rounded-full overflow-hidden shrink-0 hidden sm:block">
                          <div
                            className="bg-[#34D399] h-full"
                            style={{ width: `${Math.min(100, Math.max(10, (evt.duration_ms / 100) * 100))}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center whitespace-nowrap">
                      {evt.chaos_injected ? (
                        <span className="text-[9px] font-semibold text-[#F59E0B] tracking-wider px-1 py-0.5 rounded-[2px] bg-[#F59E0B]/10 border border-[#F59E0B]/30">
                          ARMED
                        </span>
                      ) : (
                        <span className="text-[#292932] text-[10px]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
