"use client";

import { useEffect, useState } from "react";
import { AnchorInfo, ProbeResult, TrafficEvent } from "../types";
import { generateCurl, getEngineUrl } from "../lib/api";
import { CopyIcon, CheckIcon, CloseIcon, PlayIcon, TerminalIcon, RefreshIcon } from "./Icons";

interface InspectorPaneProps {
  event: TrafficEvent | null;
  probeResult: ProbeResult | null;
  anchor: AnchorInfo | null;
  onClose: () => void;
  onFireProbe: (path: string) => void;
}

const SEP_DIRECTORY_ROUTES = [
  {
    name: "SEP-1 Discovery",
    method: "GET",
    path: "/.well-known/stellar.toml",
    desc: "Anchor discovery & currencies TOML",
    probed: true,
  },
  {
    name: "SEP-10 Web Auth",
    method: "GET",
    path: "/auth",
    desc: "Challenge transaction exchange",
    probed: false,
  },
  {
    name: "SEP-12 Customer KYC",
    method: "GET",
    path: "/sep12/customer",
    desc: "Identity & document verification",
    probed: false,
  },
  {
    name: "SEP-24 Capabilities",
    method: "GET",
    path: "/sep24/info",
    desc: "Deposit & withdrawal asset metadata",
    probed: true,
  },
  {
    name: "SEP-38 FX Quotes",
    method: "GET",
    path: "/sep38/info",
    desc: "Indicative & firm exchange pricing",
    probed: true,
  },
  {
    name: "Engine Health",
    method: "GET",
    path: "/health",
    desc: "Database connectivity & keypair ping",
    probed: true,
  },
];

export default function InspectorPane({
  event,
  probeResult,
  anchor,
  onClose,
  onFireProbe,
}: InspectorPaneProps) {
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrlPath, setCopiedUrlPath] = useState<string | null>(null);

  const engineUrl = getEngineUrl();

  // Esc key listener to deselect event
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (event || probeResult)) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [event, probeResult, onClose]);

  const handleCopyCurl = () => {
    if (!event && !probeResult) return;
    const path = event ? event.path : probeResult ? new URL(probeResult.url).pathname : "/";
    const method = event ? event.method : probeResult ? probeResult.method : "GET";
    const query = event ? event.query : "";
    const curl = generateCurl({
      method,
      path,
      query,
      headers: probeResult?.headers,
      body: probeResult?.body,
    });
    navigator.clipboard.writeText(curl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const handleCopySigningKey = () => {
    if (!anchor?.signing_public_key) return;
    navigator.clipboard.writeText(anchor.signing_public_key);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyRouteUrl = (path: string) => {
    const full = `${engineUrl}${path}`;
    navigator.clipboard.writeText(full);
    setCopiedUrlPath(path);
    setTimeout(() => setCopiedUrlPath(null), 2000);
  };

  const getStatusColor = (code: number) => {
    if (code >= 200 && code < 300) return "text-[#34D399]";
    if (code >= 400 && code < 500) return "text-[#F59E0B]";
    return "text-[#F87171]";
  };

  // State A: A request row IS selected
  if (event || probeResult) {
    const currentPath = event ? event.path : probeResult ? new URL(probeResult.url).pathname : "/";
    const currentQuery = event ? event.query : "";
    const currentMethod = event ? event.method : probeResult ? probeResult.method : "GET";
    const currentStatus = event ? event.status_code : probeResult ? probeResult.status : 200;
    const currentDuration = event ? event.duration_ms : probeResult ? probeResult.durationMs : 0;
    const isChaos = event ? event.chaos_injected : Boolean(probeResult?.chaosInjected);
    const contentType = event?.content_type || probeResult?.contentType || probeResult?.headers?.["content-type"] || "—";
    const fullUrl = `${engineUrl}${currentPath}${currentQuery ? `?${currentQuery}` : ""}`;

    return (
      <div className="flex flex-col h-full bg-[#0D0D10] text-[#F2F2EE] font-sans text-xs overflow-hidden">
        {/* Selected Request Header */}
        <div className="h-11 px-3.5 border-b border-[#1E1E24] bg-[#09090B] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-[11px] px-1.5 py-0.5 rounded-[3px] bg-[#18181E] border border-[#292932] text-[#F2F2EE]">
              {currentMethod}
            </span>
            <span className="font-mono text-xs font-semibold text-[#F2F2EE] truncate" title={currentPath}>
              {currentPath}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm text-[#A0A0AD] hover:text-[#F2F2EE] hover:bg-[#18181E] transition-colors"
            title="Deselect request (Esc)"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Telemetry Summary Grid */}
        <div className="p-3.5 border-b border-[#1E1E24] bg-[#0B0B0E] grid grid-cols-2 gap-2.5 text-[11px] shrink-0">
          <div>
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block">
              STATUS CODE
            </span>
            <span className={`font-mono font-bold text-sm tabular-nums ${getStatusColor(currentStatus)}`}>
              {currentStatus} {currentStatus === 200 ? "OK" : ""}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block">
              LATENCY
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono font-medium text-[#F2F2EE] tabular-nums">
                {currentDuration} ms
              </span>
              <div className="flex-1 bg-[#18181E] h-1 rounded-full overflow-hidden max-w-[60px]">
                <div
                  className="bg-[#34D399] h-full"
                  style={{ width: `${Math.min(100, Math.max(8, (currentDuration / 100) * 100))}%` }}
                />
              </div>
            </div>
          </div>

          <div>
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block">
              CONTENT TYPE
            </span>
            <span className="font-mono text-[11px] text-[#A0A0AD] truncate block" title={contentType}>
              {contentType}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block">
              FAULT INJECTION
            </span>
            <span className={`font-mono font-semibold text-[11px] ${isChaos ? "text-[#F59E0B]" : "text-[#646472]"}`}>
              {isChaos ? "ARMED (INJECTED)" : "CLEAN"}
            </span>
          </div>

          <div className="col-span-2 pt-1 border-t border-[#18181E]">
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block">
              FULL TARGET URL
            </span>
            <code className="font-mono text-[11px] text-[#A0A0AD] select-all truncate block mt-0.5">
              {fullUrl}
            </code>
          </div>
        </div>

        {/* Payload / Response Viewer */}
        <div className="flex-1 p-3.5 overflow-y-auto space-y-2 bg-[#0D0D10]">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
              RESPONSE PAYLOAD {probeResult?.isJson ? "(FORMATTED JSON)" : ""}
            </span>
            {probeResult?.body && (
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(probeResult.body)}
                className="text-[10px] font-sans text-[#A0A0AD] hover:text-[#F2F2EE] transition-colors"
              >
                Copy Body
              </button>
            )}
          </div>

          {probeResult?.body ? (
            <pre className="p-3 rounded-md bg-[#09090B] border border-[#1E1E24] text-[#F2F2EE] font-mono text-[11px] leading-relaxed overflow-x-auto max-h-72 select-all">
              <code>{probeResult.body}</code>
            </pre>
          ) : (
            <div className="p-4 rounded-md bg-[#111115] border border-[#1E1E24] text-center space-y-2">
              <p className="text-[#A0A0AD] text-xs font-sans">
                External traffic event captured in memory without cached response payload.
              </p>
              {currentMethod === "GET" && (
                <button
                  type="button"
                  onClick={() => onFireProbe(currentPath)}
                  className="px-3 py-1.5 rounded-md bg-[#18181E] hover:bg-[#202028] border border-[#292932] text-[#F2F2EE] text-xs font-sans font-medium transition-all inline-flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  <RefreshIcon className="w-3 h-3" />
                  <span>Probe Response Now</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Bottom Actions Bar */}
        <div className="p-3 border-t border-[#1E1E24] bg-[#09090B] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyCurl}
            className="flex-1 py-1.5 px-3 rounded-md bg-[#18181E] hover:bg-[#202028] border border-[#292932] text-[#F2F2EE] text-xs font-sans font-medium transition-all flex items-center justify-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            {copiedCurl ? <CheckIcon className="w-3.5 h-3.5 text-[#34D399]" /> : <TerminalIcon className="w-3.5 h-3.5 text-[#A0A0AD]" />}
            <span>{copiedCurl ? "cURL Copied" : "Copy as cURL"}</span>
          </button>

          {currentMethod === "GET" && (
            <button
              type="button"
              onClick={() => onFireProbe(currentPath)}
              className="py-1.5 px-3 rounded-md bg-[#F2F2EE] hover:bg-white text-[#09090B] text-xs font-sans font-semibold transition-all flex items-center justify-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              <PlayIcon className="w-3.5 h-3.5" />
              <span>Replay</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // State B: Default State — Anchor Directory (Zero dead voids!)
  const signingKey = anchor?.signing_public_key || "";
  const displayKey = signingKey
    ? `${signingKey.slice(0, 10)}...${signingKey.slice(-10)}`
    : "—";

  return (
    <div className="flex flex-col h-full bg-[#0D0D10] text-[#F2F2EE] font-sans text-xs overflow-y-auto">
      {/* Directory Header */}
      <div className="p-3.5 border-b border-[#1E1E24] bg-[#09090B] shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
            ANCHOR DIRECTORY & SPECIFICATION
          </span>
          <span className="text-[10px] font-mono text-[#34D399] bg-[#34D399]/10 border border-[#34D399]/30 px-1.5 py-0.5 rounded-[3px]">
            ACTIVE
          </span>
        </div>
        <h3 className="font-sans font-semibold text-sm text-[#F2F2EE] mt-1">
          Local Anchor Instance
        </h3>
        <p className="text-[11px] text-[#A0A0AD] font-sans mt-0.5">
          Standard Stellar protocol endpoints exposed on this engine
        </p>
      </div>

      {/* Anchor Identity Box */}
      <div className="p-3.5 border-b border-[#1E1E24] bg-[#0B0B0E] space-y-2.5 shrink-0">
        <div>
          <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block">
            ED25519 SIGNING KEY
          </span>
          <div className="flex items-center justify-between gap-2 mt-1 bg-[#141418] border border-[#1E1E24] px-2.5 py-1.5 rounded-md">
            <span className="font-mono text-xs text-[#F2F2EE] select-all truncate" title={signingKey}>
              {displayKey}
            </span>
            <button
              type="button"
              onClick={handleCopySigningKey}
              className="text-[#A0A0AD] hover:text-[#F2F2EE] transition-colors p-1"
              title="Copy Ed25519 Public Key"
            >
              {copiedKey ? <CheckIcon className="w-3.5 h-3.5 text-[#34D399]" /> : <CopyIcon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block">
              HOME DOMAIN
            </span>
            <span className="font-mono text-[#F2F2EE]">
              {anchor?.home_domain || "localhost:8000"}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block">
              NETWORK
            </span>
            <span className="font-mono text-[#F2F2EE] truncate block" title={anchor?.network_passphrase}>
              Test SDF Network
            </span>
          </div>
        </div>
      </div>

      {/* Interactive SEP Endpoints List */}
      <div className="flex-1 p-3.5 space-y-2">
        <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block">
          STELLAR PROTOCOL ENDPOINTS
        </span>

        <div className="space-y-1.5">
          {SEP_DIRECTORY_ROUTES.map((route) => (
            <div
              key={route.path}
              className="p-2.5 rounded-md bg-[#111115] border border-[#1E1E24] hover:border-[#292932] transition-all flex items-center justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono font-bold px-1 rounded-[2px] bg-[#18181E] border border-[#292932] text-[#A0A0AD]">
                    {route.method}
                  </span>
                  <span className="font-sans font-medium text-xs text-[#F2F2EE] truncate">
                    {route.name}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-[#A0A0AD] truncate mt-0.5">
                  {route.path}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopyRouteUrl(route.path)}
                  className="p-1 rounded-sm text-[#646472] hover:text-[#F2F2EE] hover:bg-[#18181E] transition-colors"
                  title="Copy full URL"
                >
                  {copiedUrlPath === route.path ? (
                    <CheckIcon className="w-3.5 h-3.5 text-[#34D399]" />
                  ) : (
                    <CopyIcon className="w-3.5 h-3.5" />
                  )}
                </button>

                {route.probed && (
                  <button
                    type="button"
                    onClick={() => onFireProbe(route.path)}
                    className="p-1 rounded-sm text-[#A0A0AD] hover:text-[#34D399] hover:bg-[#18181E] transition-colors"
                    title="Fire probe directly"
                  >
                    <PlayIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard Shortcuts Legend */}
      <div className="p-3.5 border-t border-[#1E1E24] bg-[#09090B] shrink-0">
        <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472] block mb-1.5">
          KEYBOARD SHORTCUTS
        </span>
        <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono text-[#A0A0AD]">
          <div className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded-[3px] bg-[#18181E] border border-[#292932] text-[#F2F2EE]">
              /
            </kbd>
            <span>Filter</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded-[3px] bg-[#18181E] border border-[#292932] text-[#F2F2EE]">
              P
            </kbd>
            <span>Pause</span>
          </div>
          <div className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded-[3px] bg-[#18181E] border border-[#292932] text-[#F2F2EE]">
              Esc
            </kbd>
            <span>Deselect</span>
          </div>
        </div>
      </div>
    </div>
  );
}
