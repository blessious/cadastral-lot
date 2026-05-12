"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Map as MapIcon } from "lucide-react";

type MapLegendProps = {
  colors: Record<string, string>;
};

export default function MapLegend({ colors }: MapLegendProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="absolute bottom-8 left-4 z-[1000] flex w-40 flex-col overflow-hidden rounded-xl border border-white/20 bg-white/80 shadow-lg backdrop-blur-md transition-all dark:bg-slate-900/80">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-3 bg-white/50 px-4 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100/50 dark:bg-slate-800/50 dark:text-slate-200 dark:hover:bg-slate-700/50"
      >
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4" />
          <span>Legend</span>
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      
      {isOpen && (
        <div className="flex flex-col gap-2.5 p-4 pt-3">
          {Object.entries(colors).map(([className, color]) => (
            <div key={className} className="flex items-center gap-3">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-200/50 shadow-sm dark:border-slate-700/50"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs font-medium capitalize text-slate-700 dark:text-slate-300">
                {className}
              </span>
            </div>
          ))}
          <div className="mt-0.5 flex items-center gap-3 border-t border-slate-200/50 pt-2.5 dark:border-slate-700/50">
             <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-200/50 bg-[#e5e7eb] shadow-sm dark:border-slate-700/50 dark:bg-slate-600" />
             <span className="text-xs font-medium capitalize text-slate-700 dark:text-slate-300">Unknown</span>
          </div>
        </div>
      )}
    </div>
  );
}
