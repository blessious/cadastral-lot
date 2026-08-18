"use client";

import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";

type GPSButtonProps = {
  onLocate: () => void;
  isLocating: boolean;
};

export default function GPSButton({ onLocate, isLocating }: GPSButtonProps) {
  return (
    <Button
      type="button"
      onClick={onLocate}
      disabled={isLocating}
      title="My Location"
      aria-label="My location"
      variant="ghost"
      size="icon"
      className={`map-control-button disabled:cursor-not-allowed ${isLocating ? "bg-[#0051d5] text-white hover:bg-[#0051d5]" : ""}`}
    >
      {isLocating ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
      ) : (
        <Crosshair className="h-4 w-4" />
      )}
    </Button>
  );
}
