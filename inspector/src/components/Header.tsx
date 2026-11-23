"use client";

import { useState } from "react";
import { AnchorInfo } from "../types";
import { getEngineUrl } from "../lib/api";

interface HeaderProps {
  connected: boolean;
  anchor: AnchorInfo | null;
  lastUpdated: Date | null;
}

export default function Header({ connected, anchor, lastUpdated }: HeaderProps) {
  const [copied, setCopied] = useState(false);
  const engineUrl = getEngineUrl();

  const handleCopyKey = () => {
    if (!anchor?.signing_public_key) return;
    navigator.clipboard.writeText(anchor.signing_public_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="border-b border-slate-800/80 bg-[#0C121E]/90 backdrop-blur sticky top-0 z-30 px-4 lg:px-6 py-3.5">
      <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Brand & Status */}
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-mono font-bold text-sm tracking-tighter">
              SB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-base tracking-tight text-white">
                  SEPBOX
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 font-semibold uppercase tracking-wider">
                  Inspector
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono hidden sm:block">
                Stellar SEP Anchor Engine & Chaos Workbench
              </p>
            </div>
          </div>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          {/* Engine Connectivity Badge */}
          <div
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-mono font-medium border ${
              connected
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
                : "bg-rose-950/40 border-rose-500/30 text-rose-400"
            }`}
          >
            <span className="relative flex h-2 w-2">
              {connected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  connected ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
            </span>
            <span>{connected ? "ENGINE CONNECTED" : "ENGINE OFFLINE"}</span>
            <span className="text-slate-500 text-[10px]">({engineUrl})</span>
          </div>
        </div>

        {/* Anchor Details: Network Passphrase & Signing Key */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono">
          {/* Network Passphrase */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-2.5 py-1 rounded">
            <span className="text-slate-400">NET:</span>
            <span
              className="text-slate-200 font-medium max-w-[180px] sm:max-w-[240px] truncate"
              title={anchor?.network_passphrase || "Test SDF Network"}
            >
              {anchor?.network_passphrase || "Test SDF Network"}
            </span>
          </div>

          {/* Anchor Signing Public Key */}
          {anchor?.signing_public_key && (
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-2.5 py-1 rounded">
              <span className="text-slate-400">SIGNER:</span>
              <span
                className="text-cyan-400 font-medium truncate max-w-[110px] sm:max-w-[150px]"
                title={anchor.signing_public_key}
              >
                {anchor.signing_public_key.slice(0, 6)}...{anchor.signing_public_key.slice(-6)}
              </span>
              <button
                type="button"
                onClick={handleCopyKey}
                className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] transition-colors border border-slate-700"
                title="Copy Full Ed25519 Public Key"
              >
                {copied ? "COPIED!" : "COPY"}
              </button>
            </div>
          )}

          {lastUpdated && (
            <span className="text-[10px] text-slate-400 font-mono hidden xl:inline">
              SYNCED: {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
