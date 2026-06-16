"use client";

import { Crosshair } from "lucide-react";

type GPSButtonProps = {
  onLocate: () => void;
  isLocating: boolean;
};

export default function GPSButton({ onLocate, isLocating }: GPSButtonProps) {
  return (
    <button
      type="button"
      onClick={onLocate}
      disabled={isLocating}
      title="My Location"
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/20 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed ${
        isLocating
          ? "bg-[#0051d5] text-white"
          : "bg-white/70 text-[var(--on-surface-variant)] hover:bg-white/90"
      }`}
    >
      {isLocating ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        <Crosshair className="h-4 w-4" />
      )}
    </button>
  );
}
