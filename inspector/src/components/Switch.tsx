"use client";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  armedColor?: boolean;
  disabled?: boolean;
}

export default function Switch({
  checked,
  onChange,
  label,
  armedColor = false,
  disabled = false,
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3A3A47] disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? armedColor
            ? "bg-[#F59E0B] border-[#F59E0B]"
            : "bg-[#F2F2EE] border-[#F2F2EE]"
          : "bg-[#141418] border-[#292932]"
      }`}
    >
      <span className="sr-only">{label || "Toggle"}</span>
      <span
        className={`pointer-events-none block h-4 w-4 rounded-full transition-transform ${
          checked
            ? "translate-x-4 bg-[#09090B]"
            : "translate-x-0.5 bg-[#646472]"
        }`}
      />
    </button>
  );
}
