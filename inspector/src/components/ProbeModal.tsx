"use client";

import { useEffect } from "react";
import { ProbeResult } from "../types";

interface ProbeModalProps {
  result: ProbeResult | null;
  onClose: () => void;
}

export default function ProbeModal({ result, onClose }: ProbeModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!result) return null;

  const isSuccess = result.status >= 200 && result.status < 300;
  const isClientError = result.status >= 400 && result.status < 500;
  const statusColor = isSuccess
    ? "text-[#34D399]"
    : isClientError
    ? "text-[#F59E0B]"
    : "text-[#F87171]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono text-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#121215] border border-[#232329] rounded-sm overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#232329] bg-[#0C0C0E]">
          <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[#9A9AA6]">
            PROBE INSPECTOR
          </span>
          <button
            onClick={onClose}
            className="text-[11px] text-[#9A9AA6] hover:text-[#F4F4F0]"
          >
            ESC
          </button>
        </div>

        <div className="px-4 py-2 border-b border-[#232329] bg-[#121215] flex items-center justify-between gap-3 text-[11px]">
          <span className="text-[#F4F4F0] truncate">{result.url}</span>
          <span className={`font-semibold tabular-nums ${statusColor}`}>
            {result.status} {result.statusText}
          </span>
        </div>

        <div className="p-4 overflow-y-auto space-y-3 bg-[#0C0C0E]">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-[#9A9AA6]">
              RESPONSE BODY
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(result.body)}
              className="text-[11px] text-[#9A9AA6] hover:text-[#F4F4F0]"
            >
              Copy
            </button>
          </div>
          <pre className="p-3 bg-[#121215] border border-[#232329] rounded-sm text-[#F4F4F0] text-[11px] overflow-x-auto max-h-60 leading-relaxed">
            <code>{result.body}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
