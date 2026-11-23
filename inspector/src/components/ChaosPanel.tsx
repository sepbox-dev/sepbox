"use client";

import { useEffect, useState } from "react";
import { ChaosConfigUpdate, ChaosSnapshot } from "../types";
import { resetChaos, updateChaos } from "../lib/api";

interface ChaosPanelProps {
  initialChaos: ChaosSnapshot | null;
  onChaosUpdated: (newChaos: ChaosSnapshot) => void;
}

const ROUTE_PREFIXES = ["/sep", "/sep24", "/sep38", "/sep12", "/auth"];
const HTTP_STATUSES = [429, 500, 502, 503, 504];

export default function ChaosPanel({
  initialChaos,
  onChaosUpdated,
}: ChaosPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [targetPrefix, setTargetPrefix] = useState("/sep");
  const [errorStatus, setErrorStatus] = useState(503);
  const [latencyMs, setLatencyMs] = useState(0);
  const [errorRate, setErrorRate] = useState(0.0);
  const [corruptJson, setCorruptJson] = useState(false);
  const [errorMessage, setErrorMessage] = useState("Injected SEPBox chaos fault");

  const [applying, setApplying] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Sync state when initialChaos changes from polling
  useEffect(() => {
    if (initialChaos) {
      setEnabled(initialChaos.enabled);
      setTargetPrefix(initialChaos.target_prefix);
      setErrorStatus(initialChaos.error_status);
      setLatencyMs(initialChaos.latency_ms);
      setErrorRate(initialChaos.error_rate);
      setCorruptJson(initialChaos.corrupt_json);
      setErrorMessage(initialChaos.error_message);
    }
  }, [initialChaos]);

  const handleApply = async (override?: Partial<ChaosConfigUpdate>) => {
    setApplying(true);
    setFeedback(null);
    try {
      const payload: ChaosConfigUpdate = {
        enabled: override?.enabled ?? enabled,
        target_prefix: override?.target_prefix ?? targetPrefix,
        latency_ms: override?.latency_ms ?? latencyMs,
        error_rate: override?.error_rate ?? errorRate,
        error_status: override?.error_status ?? errorStatus,
        error_message: override?.error_message ?? errorMessage,
        corrupt_json: override?.corrupt_json ?? corruptJson,
      };
      const res = await updateChaos(payload);
      onChaosUpdated(res);
      setFeedback("Fault parameters applied to engine.");
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: unknown) {
      setFeedback(`Apply failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApplying(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    setFeedback(null);
    try {
      const res = await resetChaos();
      onChaosUpdated(res);
      setEnabled(res.enabled);
      setTargetPrefix(res.target_prefix);
      setErrorStatus(res.error_status);
      setLatencyMs(res.latency_ms);
      setErrorRate(res.error_rate);
      setCorruptJson(res.corrupt_json);
      setErrorMessage(res.error_message);
      setFeedback("Chaos engine reset to safe bypass state.");
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: unknown) {
      setFeedback(`Reset failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResetting(false);
    }
  };

  // Presets
  const applyPreset = (type: "sep24_outage" | "slow_network" | "corrupt_sep38") => {
    if (type === "sep24_outage") {
      const preset: Partial<ChaosConfigUpdate> = {
        enabled: true,
        target_prefix: "/sep24",
        error_status: 503,
        error_rate: 1.0,
        latency_ms: 0,
        corrupt_json: false,
        error_message: "SEP-24 Service Outage: Injected Chaos Fault",
      };
      setEnabled(true);
      setTargetPrefix("/sep24");
      setErrorStatus(503);
      setErrorRate(1.0);
      setLatencyMs(0);
      setCorruptJson(false);
      setErrorMessage("SEP-24 Service Outage: Injected Chaos Fault");
      handleApply(preset);
    } else if (type === "slow_network") {
      const preset: Partial<ChaosConfigUpdate> = {
        enabled: true,
        target_prefix: "/sep",
        latency_ms: 1200,
        error_rate: 0.0,
        corrupt_json: false,
        error_status: 503,
        error_message: "Injected SEPBox chaos fault",
      };
      setEnabled(true);
      setTargetPrefix("/sep");
      setLatencyMs(1200);
      setErrorRate(0.0);
      setCorruptJson(false);
      handleApply(preset);
    } else if (type === "corrupt_sep38") {
      const preset: Partial<ChaosConfigUpdate> = {
        enabled: true,
        target_prefix: "/sep38",
        corrupt_json: true,
        latency_ms: 0,
        error_rate: 0.0,
        error_status: 503,
        error_message: "Injected SEPBox chaos fault",
      };
      setEnabled(true);
      setTargetPrefix("/sep38");
      setCorruptJson(true);
      setLatencyMs(0);
      setErrorRate(0.0);
      handleApply(preset);
    }
  };

  const stats = initialChaos?.stats;

  return (
    <div className="bg-[#0E1524] border border-slate-800 rounded p-4 flex flex-col gap-4 font-mono">
      {/* Title & Live Badge */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          <h2 className="text-sm font-bold tracking-tight text-white uppercase">
            Chaos Fault Injector
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
              initialChaos?.enabled
                ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
          >
            {initialChaos?.enabled ? "FAULT ACTIVE" : "BYPASS (DISABLED)"}
          </span>
        </div>
      </div>

      {/* Live Injected Counters */}
      <div className="grid grid-cols-3 gap-2 bg-[#090D16] border border-slate-800/80 p-2.5 rounded text-center text-xs">
        <div>
          <span className="text-[10px] text-slate-400 block font-semibold">
            INSPECTED
          </span>
          <span className="text-base font-bold text-slate-200">
            {stats?.total_inspected ?? 0}
          </span>
        </div>
        <div className="border-x border-slate-800">
          <span className="text-[10px] text-rose-400 block font-semibold">
            INJECTED ERRORS
          </span>
          <span className="text-base font-bold text-rose-400">
            {stats?.injected_errors ?? 0}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-amber-400 block font-semibold">
            INJECTED DELAYS
          </span>
          <span className="text-base font-bold text-amber-400">
            {stats?.injected_delays ?? 0}
          </span>
        </div>
      </div>

      {/* Presets Strip */}
      <div>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
          One-Click Fault Presets
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <button
            type="button"
            onClick={() => applyPreset("sep24_outage")}
            className="px-2.5 py-1.5 rounded bg-rose-950/30 hover:bg-rose-900/40 text-rose-300 border border-rose-800/50 text-left transition-all hover:border-rose-600"
          >
            <div className="font-bold text-[11px]">503 SEP-24 Outage</div>
            <div className="text-[10px] text-rose-400/80">100% fail /sep24</div>
          </button>
          <button
            type="button"
            onClick={() => applyPreset("slow_network")}
            className="px-2.5 py-1.5 rounded bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 border border-amber-800/50 text-left transition-all hover:border-amber-600"
          >
            <div className="font-bold text-[11px]">1200ms Latency</div>
            <div className="text-[10px] text-amber-400/80">Delay /sep routes</div>
          </button>
          <button
            type="button"
            onClick={() => applyPreset("corrupt_sep38")}
            className="px-2.5 py-1.5 rounded bg-purple-950/30 hover:bg-purple-900/40 text-purple-300 border border-purple-800/50 text-left transition-all hover:border-purple-600"
          >
            <div className="font-bold text-[11px]">Corrupt SEP-38 JSON</div>
            <div className="text-[10px] text-purple-400/80">Truncated body</div>
          </button>
        </div>
      </div>

      {/* Form Controls */}
      <div className="space-y-3 text-xs">
        {/* Toggle Enabled */}
        <div className="flex items-center justify-between p-2.5 rounded bg-[#090D16] border border-slate-800">
          <div>
            <span className="font-bold text-slate-200 block">
              Enable Fault Injection
            </span>
            <span className="text-[10px] text-slate-400">
              When toggled off, all routes pass cleanly
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`w-12 h-6 rounded-full transition-colors relative border ${
              enabled
                ? "bg-rose-600 border-rose-500"
                : "bg-slate-800 border-slate-700"
            }`}
          >
            <span
              className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Target Prefix & Status Code */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
              Target Route Prefix
            </label>
            <select
              value={targetPrefix}
              onChange={(e) => setTargetPrefix(e.target.value)}
              className="w-full bg-[#090D16] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              {ROUTE_PREFIXES.map((prefix) => (
                <option key={prefix} value={prefix}>
                  {prefix}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
              Injected HTTP Status
            </label>
            <select
              value={errorStatus}
              onChange={(e) => setErrorStatus(Number(e.target.value))}
              className="w-full bg-[#090D16] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              {HTTP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status} (
                  {status === 429
                    ? "Rate Limit"
                    : status === 500
                    ? "Internal Error"
                    : status === 502
                    ? "Bad Gateway"
                    : status === 503
                    ? "Unavailable"
                    : "Gateway Timeout"}
                  )
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Latency Slider */}
        <div className="bg-[#090D16] border border-slate-800 p-2.5 rounded">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase">
              Artificial Latency
            </span>
            <span className="text-cyan-400 font-bold">{latencyMs} ms</span>
          </div>
          <input
            type="range"
            min="0"
            max="4000"
            step="50"
            value={latencyMs}
            onChange={(e) => setLatencyMs(Number(e.target.value))}
            className="w-full accent-cyan-500 cursor-pointer"
          />
        </div>

        {/* Error Rate Slider */}
        <div className="bg-[#090D16] border border-slate-800 p-2.5 rounded">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase">
              Error Injection Rate
            </span>
            <span className="text-rose-400 font-bold">
              {Math.round(errorRate * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={errorRate}
            onChange={(e) => setErrorRate(Number(e.target.value))}
            className="w-full accent-rose-500 cursor-pointer"
          />
        </div>

        {/* Corrupt JSON & Message */}
        <div className="flex items-center justify-between p-2.5 rounded bg-[#090D16] border border-slate-800">
          <div>
            <span className="font-bold text-slate-200 block">
              Corrupt JSON Body
            </span>
            <span className="text-[10px] text-slate-400">
              Returns truncated JSON string to test parser resilience
            </span>
          </div>
          <input
            type="checkbox"
            checked={corruptJson}
            onChange={(e) => setCorruptJson(e.target.checked)}
            className="h-4 w-4 accent-purple-500 rounded cursor-pointer"
          />
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
            Injected Error Message
          </label>
          <input
            type="text"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            className="w-full bg-[#090D16] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div className="text-[11px] px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-cyan-300">
          {feedback}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-1 border-t border-slate-800/80">
        <button
          type="button"
          onClick={() => handleApply()}
          disabled={applying}
          className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold py-2 px-3 rounded text-xs transition-colors flex items-center justify-center gap-1.5"
        >
          {applying ? "APPLYING..." : "APPLY CHAOS"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={resetting}
          className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-bold py-2 px-3 rounded text-xs border border-slate-700 transition-colors"
        >
          {resetting ? "RESETTING..." : "RESET"}
        </button>
      </div>
    </div>
  );
}
