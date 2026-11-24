"use client";

import { useEffect, useState } from "react";
import { ChaosConfigUpdate, ChaosSnapshot } from "../types";
import { resetChaos, updateChaos } from "../lib/api";
import Switch from "./Switch";
import SegmentedControl from "./SegmentedControl";
import { ZapIcon } from "./Icons";

interface ChaosPanelProps {
  initialChaos: ChaosSnapshot | null;
  onChaosUpdated: (newChaos: ChaosSnapshot) => void;
}

const PREFIX_OPTIONS = [
  { label: "/sep", value: "/sep" },
  { label: "/sep24", value: "/sep24" },
  { label: "/sep38", value: "/sep38" },
  { label: "/sep12", value: "/sep12" },
  { label: "/auth", value: "/auth" },
];

const STATUS_OPTIONS = [
  { label: "429", value: 429 },
  { label: "500", value: 500 },
  { label: "502", value: 502 },
  { label: "503", value: 503 },
  { label: "504", value: 504 },
];

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

  // Form dirty state check
  const isDirty = Boolean(
    initialChaos &&
      (enabled !== initialChaos.enabled ||
        targetPrefix !== initialChaos.target_prefix ||
        errorStatus !== initialChaos.error_status ||
        latencyMs !== initialChaos.latency_ms ||
        Math.abs(errorRate - initialChaos.error_rate) > 0.001 ||
        corruptJson !== initialChaos.corrupt_json ||
        errorMessage !== initialChaos.error_message)
  );

  const isArmed = Boolean(initialChaos?.enabled);

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
      setFeedback("Rules applied to engine.");
      setTimeout(() => setFeedback(null), 2500);
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
      setFeedback("Fault parameters reset to bypass.");
      setTimeout(() => setFeedback(null), 2500);
    } catch (err: unknown) {
      setFeedback(`Reset failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setResetting(false);
    }
  };

  const applyPreset = (type: "sep24_outage" | "slow_network" | "corrupt_sep38") => {
    if (type === "sep24_outage") {
      const update: Partial<ChaosConfigUpdate> = {
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
      handleApply(update);
    } else if (type === "slow_network") {
      const update: Partial<ChaosConfigUpdate> = {
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
      handleApply(update);
    } else if (type === "corrupt_sep38") {
      const update: Partial<ChaosConfigUpdate> = {
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
      handleApply(update);
    }
  };

  const stats = initialChaos?.stats;

  return (
    <div className="flex flex-col justify-between flex-1 bg-[#0D0D10] text-[#F2F2EE] font-sans text-xs">
      <div className="p-3.5 space-y-3.5">
        {/* Master Toggle Row */}
        <div
          className={`p-3 rounded-md transition-all ${
            isArmed
              ? "bg-[#18181E] border border-[#F59E0B]/30"
              : "bg-[#18181E] border border-[#1E1E24]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-sans font-semibold text-xs text-[#F2F2EE]">
                  Fault Injection
                </span>
                <span
                  className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-[3px] border uppercase tracking-wider ${
                    isArmed
                      ? "bg-[#F59E0B]/10 border-[#F59E0B]/40 text-[#F59E0B]"
                      : "bg-[#09090B] border-[#292932] text-[#646472]"
                  }`}
                >
                  {isArmed ? "ARMED" : "STANDBY"}
                </span>
              </div>
              <p className="text-[11px] text-[#A0A0AD] font-sans mt-0.5">
                Simulate protocol outages, latency & corrupt JSON
              </p>
            </div>
            <Switch
              checked={enabled}
              onChange={(val) => setEnabled(val)}
              armedColor={true}
              label="Toggle Fault Injection"
            />
          </div>
        </div>

        {/* 3 Compact Presets */}
        <div>
          <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block mb-1.5">
            FAULT PRESETS
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => applyPreset("sep24_outage")}
              className="p-2 rounded-md bg-[#18181E] hover:bg-[#202028] border border-[#292932] hover:border-[#3A3A47] text-left transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] group"
            >
              <div className="flex items-center gap-1.5">
                <ZapIcon className="w-3 h-3 text-[#A0A0AD] group-hover:text-[#F2F2EE]" />
                <span className="text-[11px] font-sans font-medium text-[#F2F2EE]">
                  503 Outage
                </span>
              </div>
              <div className="text-[10px] font-mono text-[#646472] mt-0.5">
                /sep24 100%
              </div>
            </button>

            <button
              type="button"
              onClick={() => applyPreset("slow_network")}
              className="p-2 rounded-md bg-[#18181E] hover:bg-[#202028] border border-[#292932] hover:border-[#3A3A47] text-left transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] group"
            >
              <div className="flex items-center gap-1.5">
                <ZapIcon className="w-3 h-3 text-[#A0A0AD] group-hover:text-[#F2F2EE]" />
                <span className="text-[11px] font-sans font-medium text-[#F2F2EE]">
                  1200ms Delay
                </span>
              </div>
              <div className="text-[10px] font-mono text-[#646472] mt-0.5">
                /sep routes
              </div>
            </button>

            <button
              type="button"
              onClick={() => applyPreset("corrupt_sep38")}
              className="p-2 rounded-md bg-[#18181E] hover:bg-[#202028] border border-[#292932] hover:border-[#3A3A47] text-left transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] group"
            >
              <div className="flex items-center gap-1.5">
                <ZapIcon className="w-3 h-3 text-[#A0A0AD] group-hover:text-[#F2F2EE]" />
                <span className="text-[11px] font-sans font-medium text-[#F2F2EE]">
                  Corrupt JSON
                </span>
              </div>
              <div className="text-[10px] font-mono text-[#646472] mt-0.5">
                Truncated
              </div>
            </button>
          </div>
        </div>

        {/* Segmented Controls for Route & Status */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
                TARGET ROUTE PREFIX
              </span>
              <span className="text-[10px] font-mono text-[#646472]">
                path.startswith()
              </span>
            </div>
            <SegmentedControl
              options={PREFIX_OPTIONS}
              value={targetPrefix}
              onChange={(val) => setTargetPrefix(String(val))}
              className="w-full justify-between"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
                INJECTED HTTP STATUS
              </span>
              <span className="text-[10px] font-mono text-[#646472]">
                error code
              </span>
            </div>
            <SegmentedControl
              options={STATUS_OPTIONS}
              value={errorStatus}
              onChange={(val) => setErrorStatus(Number(val))}
              className="w-full justify-between"
            />
          </div>
        </div>

        {/* Custom Sleek Sliders */}
        <div className="space-y-2.5">
          <div className="p-2.5 rounded-md bg-[#18181E] border border-[#1E1E24]">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#A0A0AD]">
                ARTIFICIAL LATENCY
              </span>
              <span className="font-mono font-semibold text-xs text-[#F2F2EE] tabular-nums">
                {latencyMs} ms
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="5000"
              step="50"
              value={latencyMs}
              onChange={(e) => setLatencyMs(Number(e.target.value))}
              className={`sepbox-slider ${isArmed ? "sepbox-slider-armed" : ""}`}
            />
            <div className="flex justify-between text-[10px] font-mono text-[#646472] tabular-nums mt-0.5">
              <span>0 ms</span>
              <span>2500 ms</span>
              <span>5000 ms</span>
            </div>
          </div>

          <div className="p-2.5 rounded-md bg-[#18181E] border border-[#1E1E24]">
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#A0A0AD]">
                ERROR INJECTION RATE
              </span>
              <span className="font-mono font-semibold text-xs text-[#F2F2EE] tabular-nums">
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
              className={`sepbox-slider ${isArmed ? "sepbox-slider-armed" : ""}`}
            />
            <div className="flex justify-between text-[10px] font-mono text-[#646472] tabular-nums mt-0.5">
              <span>0% (Bypass)</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Truncate / Corrupt JSON Row */}
        <div className="flex items-center justify-between p-2.5 rounded-md bg-[#18181E] border border-[#1E1E24]">
          <div>
            <span className="text-xs font-sans font-medium text-[#F2F2EE] block">
              Truncate / Corrupt JSON
            </span>
            <span className="text-[10px] text-[#A0A0AD] font-sans">
              Returns truncated string to test client deserializers
            </span>
          </div>
          <Switch
            checked={corruptJson}
            onChange={(val) => setCorruptJson(val)}
            armedColor={true}
            label="Toggle Corrupt JSON"
          />
        </div>

        {/* Injected Error Message */}
        <div>
          <label className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block mb-1">
            INJECTED ERROR MESSAGE
          </label>
          <input
            type="text"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
            className="w-full bg-[#18181E] border border-[#1E1E24] rounded-md px-2.5 py-1.5 text-[#F2F2EE] text-xs font-mono focus:outline-none focus:border-[#3A3A47] transition-colors"
          />
        </div>

        {/* Feedback message */}
        {feedback && (
          <div className="text-[11px] font-mono text-[#F59E0B] py-0.5">
            {feedback}
          </div>
        )}

        {/* Action Bar (Restrained: calm zinc when clean; bone-white only when dirty) */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => handleApply()}
            disabled={applying}
            className={`flex-1 py-1.5 px-3 rounded-md font-sans text-xs transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] disabled:opacity-50 ${
              isDirty
                ? "bg-[#F2F2EE] hover:bg-white text-[#09090B] font-semibold"
                : "bg-[#1C1C22] hover:bg-[#24242C] text-[#A0A0AD] hover:text-[#F2F2EE] border border-[#2E2E38] font-medium"
            }`}
          >
            {applying ? "Applying..." : isDirty ? "Apply Rules *" : "Apply Rules"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            className="py-1.5 px-3 rounded-md bg-[#18181E] hover:bg-[#202028] border border-[#292932] text-[#A0A0AD] hover:text-[#F2F2EE] font-sans text-xs transition-colors disabled:opacity-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            {resetting ? "Resetting..." : "Reset"}
          </button>
        </div>

        {/* Compact Telemetry Box (Directly below Action Bar, NO gap) */}
        <div className="grid grid-cols-3 divide-x divide-[#1E1E24] border border-[#1E1E24] bg-[#18181E] rounded-md text-center py-2 shrink-0">
          <div>
            <span className="text-[9px] uppercase font-sans font-medium text-[#646472] block tracking-[0.06em]">
              INSPECTED
            </span>
            <span className="text-xs font-mono font-semibold text-[#F2F2EE] tabular-nums">
              {stats?.total_inspected ?? 0}
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-sans font-medium text-[#646472] block tracking-[0.06em]">
              ERRORS
            </span>
            <span className="text-xs font-mono font-semibold text-[#F59E0B] tabular-nums">
              {stats?.injected_errors ?? 0}
            </span>
          </div>
          <div>
            <span className="text-[9px] uppercase font-sans font-medium text-[#646472] block tracking-[0.06em]">
              DELAYS
            </span>
            <span className="text-xs font-mono font-semibold text-[#F2F2EE] tabular-nums">
              {stats?.injected_delays ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
