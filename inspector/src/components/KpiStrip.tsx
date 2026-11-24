"use client";

import { OverviewCounts } from "../types";

interface KpiStripProps {
  counts: OverviewCounts | null;
}

export default function KpiStrip({ counts }: KpiStripProps) {
  const bufferCount = counts?.buffered_requests ?? 0;

  return (
    <section className="border-b border-[#1E1E24] bg-[#0B0B0E] w-full shrink-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full divide-y sm:divide-y-0 sm:divide-x divide-[#1E1E24] text-xs">
        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
            SEP-12 KYC
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
              {counts?.sep12_customers ?? 0}
            </span>
            <span className="text-[10px] font-sans text-[#646472]">registered</span>
          </div>
        </div>

        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
            SEP-38 QUOTES
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
              {counts?.sep38_quotes ?? 0}
            </span>
            <span className="text-[10px] font-sans text-[#646472]">firm</span>
          </div>
        </div>

        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
            SEP-24 TXS
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
              {counts?.sep24_transactions ?? 0}
            </span>
            <span className="text-[10px] font-sans text-[#646472]">tracked</span>
          </div>
        </div>

        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
            SUBSCRIPTIONS
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
              {counts?.webhook_subscriptions ?? 0}
            </span>
            <span className="text-[10px] font-sans text-[#646472]">active</span>
          </div>
        </div>

        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
            DELIVERIES
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
              {counts?.webhook_deliveries ?? 0}
            </span>
            <span className="text-[10px] font-sans text-[#646472]">dispatched</span>
          </div>
        </div>

        <div className="p-3 flex flex-col justify-between">
          <span className="text-[10px] uppercase font-sans font-medium tracking-[0.06em] text-[#646472]">
            BUFFER
          </span>
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-[18px] font-mono font-semibold text-[#F2F2EE] tabular-nums">
              {bufferCount}
              <span className="text-xs text-[#646472] font-normal font-sans ml-0.5">/200</span>
            </span>
            <span className="text-[10px] font-sans text-[#646472]">window</span>
          </div>
          <div className="w-full bg-[#18181E] h-0.5 rounded-full mt-1.5 overflow-hidden">
            <div
              className="bg-[#34D399] h-full transition-all duration-300"
              style={{ width: `${Math.min(100, (bufferCount / 200) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
