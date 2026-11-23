"use client";

import { OverviewCounts } from "../types";

interface KpiStripProps {
  counts: OverviewCounts | null;
  loading: boolean;
}

export default function KpiStrip({ counts, loading }: KpiStripProps) {
  const kpis = [
    {
      label: "SEP-12 KYC PROFILES",
      value: counts?.sep12_customers ?? 0,
      sub: "Registered Customers",
      color: "border-sky-500/20 text-sky-400",
      bg: "bg-sky-500/5",
    },
    {
      label: "SEP-38 QUOTES",
      value: counts?.sep38_quotes ?? 0,
      sub: "Indicative & Firm",
      color: "border-cyan-500/20 text-cyan-400",
      bg: "bg-cyan-500/5",
    },
    {
      label: "SEP-24 TRANSACTIONS",
      value: counts?.sep24_transactions ?? 0,
      sub: "Deposit & Withdraw",
      color: "border-emerald-500/20 text-emerald-400",
      bg: "bg-emerald-500/5",
    },
    {
      label: "WEBHOOK DELIVERIES",
      value: counts?.webhook_deliveries ?? 0,
      sub: "Dispatched Events",
      color: "border-purple-500/20 text-purple-400",
      bg: "bg-purple-500/5",
    },
    {
      label: "SUBSCRIPTIONS",
      value: counts?.webhook_subscriptions ?? 0,
      sub: "Active Listeners",
      color: "border-indigo-500/20 text-indigo-400",
      bg: "bg-indigo-500/5",
    },
    {
      label: "BUFFERED TRAFFIC",
      value: `${counts?.buffered_requests ?? 0}/200`,
      sub: "In-Memory Window",
      color: "border-amber-500/20 text-amber-400",
      bg: "bg-amber-500/5",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className={`p-3.5 rounded border ${kpi.color} ${kpi.bg} bg-[#0E1524] flex flex-col justify-between transition-all`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-wider font-semibold text-slate-400 uppercase">
              {kpi.label}
            </span>
            {loading && (
              <span className="h-1.5 w-1.5 rounded-full bg-slate-600 animate-pulse" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-bold tracking-tight text-white">
              {kpi.value}
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-400 mt-1">
            {kpi.sub}
          </span>
        </div>
      ))}
    </div>
  );
}
