"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

type MapLegendProps = {
  colors: Record<string, string>;
};

// Hectare approximations per land class for display
const CLASS_LABELS: Record<string, string> = {
  agricultural:  "Agricultural",
  residential:   "Residential",
  commercial:    "Commercial",
  industrial:    "Industrial",
  timberland:    "Timberland",
  "gov't owned": "Gov't Owned",
  scientific:    "Scientific",
  special:       "Special",
};

export default function MapLegend({ colors }: MapLegendProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute left-4 top-24 z-[1000] w-52 glass-panel rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/20">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)]">
          Map Legend
        </span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] transition-colors"
          title={isOpen ? "Collapse" : "Expand"}
        >
          {isOpen
            ? <ChevronUp className="h-4 w-4" />
            : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {isOpen && (
        <ul className="flex flex-col gap-2.5 p-3">
          {Object.entries(colors).map(([key, color]) => (
            <li key={key} className="flex items-center gap-2.5">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10 shadow-sm"
                style={{ backgroundColor: color }}
              />
              <span className="text-[12px] font-medium text-[var(--on-surface)] leading-none">
                {CLASS_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)}
              </span>
            </li>
          ))}
          {/* Unknown fallback */}
          <li className="flex items-center gap-2.5 border-t border-white/20 pt-2 mt-0.5">
            <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10 bg-[#e5e7eb] shadow-sm" />
            <span className="text-[12px] font-medium text-[var(--on-surface)] leading-none">Unknown</span>
          </li>
        </ul>
      )}
    </div>
  );
}
