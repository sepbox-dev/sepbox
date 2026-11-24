"use client";

interface SegmentedControlProps<T extends string | number> {
  options: { label: string; value: T }[];
  value: T;
  onChange: (val: T) => void;
  size?: "sm" | "xs";
  className?: string;
}

export default function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = "xs",
  className = "",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`inline-flex rounded-md bg-[#08080A] p-1 border border-[#1E1E24] ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`font-mono transition-all rounded-[3px] ${
              size === "xs"
                ? "px-2 py-1 text-[11px]"
                : "px-2.5 py-1 text-xs"
            } ${
              isSelected
                ? "bg-[#1E1E26] border border-[#32323E] text-[#F2F2EE] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                : "border border-transparent text-[#A0A0AD] hover:text-[#F2F2EE] hover:bg-[#141418]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
