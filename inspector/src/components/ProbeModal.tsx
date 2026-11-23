"use client";

import { ProbeResult } from "../types";

interface ProbeModalProps {
  result: ProbeResult | null;
  onClose: () => void;
}

export default function ProbeModal({ result, onClose }: ProbeModalProps) {
  if (!result) return null;

  const isSuccess = result.status >= 200 && result.status < 300;
  const isRedirect = result.status >= 300 && result.status < 400;
  const isClientError = result.status >= 400 && result.status < 500;
  const isServerError = result.status >= 500 || result.status === 0;

  const statusColor = isSuccess
    ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
    : isRedirect
    ? "text-cyan-400 border-cyan-500/30 bg-cyan-500/10"
    : isClientError
    ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
    : "text-rose-400 border-rose-500/30 bg-rose-500/10";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-[#0E1524] border border-slate-700/80 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-[#0C121E]">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              PROBE RESULT
            </span>
            <span className="font-mono text-xs text-slate-300 truncate max-w-[400px]">
              {result.url}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-800 text-sm font-mono transition-colors"
          >
            ESC / CLOSE
          </button>
        </div>

        {/* Status Bar */}
        <div className="px-5 py-3 border-b border-slate-800/80 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">STATUS:</span>
            <span
              className={`px-2 py-0.5 rounded font-bold border ${statusColor}`}
            >
              {result.status > 0 ? `${result.status} ${result.statusText}` : "FAILED / UNREACHABLE"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <div>
              LATENCY:{" "}
              <span className="text-slate-200 font-semibold">
                {result.durationMs} ms
              </span>
            </div>
            <div>
              TIME:{" "}
              <span className="text-slate-400">
                {new Date(result.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 font-mono text-xs">
          {/* Response Headers */}
          {Object.keys(result.headers).length > 0 && (
            <div>
              <span className="text-slate-400 font-semibold block mb-1">
                RESPONSE HEADERS
              </span>
              <div className="bg-[#090D16] border border-slate-800 rounded p-3 text-[11px] text-slate-400 space-y-0.5 max-h-36 overflow-y-auto">
                {Object.entries(result.headers).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-cyan-400 font-medium">{k}:</span>
                    <span className="text-slate-300 break-all">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Response Body */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-slate-400 font-semibold">
                RESPONSE BODY {result.isJson && "(JSON)"}
              </span>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(result.body)}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                Copy Content
              </button>
            </div>
            <pre className="bg-[#090D16] border border-slate-800 rounded p-3 text-slate-200 overflow-x-auto text-[11px] leading-relaxed max-h-72">
              <code>{result.body}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
