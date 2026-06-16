"use client";

import { Crosshair } from "lucide-react";

import { Button } from "@/components/ui/button";

type GPSButtonProps = {
  onLocate: () => void;
  isLocating: boolean;
};

export default function GPSButton({ onLocate, isLocating }: GPSButtonProps) {
  return (
    <div
      className="absolute left-4 z-[1000]"
      style={{ bottom: "clamp(72px, 8vh, 140px)" }}
    >
      <Button
        type="button"
        onClick={onLocate}
        className="h-12 w-12 rounded-full border border-slate-200 bg-white text-slate-900 shadow-lg hover:bg-slate-100"
        variant="secondary"
        disabled={isLocating}
      >
        {isLocating ? (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
        ) : (
          <Crosshair className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
