"use client";

import { useState } from "react";
import { AnchorInfo } from "../types";
import { CopyIcon, CheckIcon } from "./Icons";

interface HeaderProps {
  connected: boolean;
  anchor: AnchorInfo | null;
  chaosArmed?: boolean;
}

export default function Header({ connected, anchor, chaosArmed }: HeaderProps) {
  const [copied, setCopied] = useState(false);
  const signingKey = anchor?.signing_public_key || "";
  const displayKey = signingKey
    ? `${signingKey.slice(0, 6)}...${signingKey.slice(-6)}`
    : "—";

  const handleCopyKey = () => {
    if (!signingKey) return;
    navigator.clipboard.writeText(signingKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header
      className={`h-12 border-b border-[#1E1E24] bg-[#09090B] px-4 flex items-center justify-between gap-4 sticky top-0 z-30 transition-colors ${
        chaosArmed ? "border-t-2 border-t-[#F59E0B]" : "border-t-2 border-t-transparent"
      }`}
    >
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
              {copied ? <CheckIcon className="w-3 h-3 text-[#34D399]" /> : <CopyIcon className="w-3 h-3" />}
            </button>
          </div>
        )}

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
  );
}
