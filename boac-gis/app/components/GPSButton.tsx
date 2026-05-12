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
      className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/70 p-0 text-slate-900 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-md dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800/90"
      disabled={isLocating}
      title="My Location"
    >
      {isLocating ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
      ) : (
        <Crosshair className="h-4 w-4" />
      )}
    </Button>
  );
}
