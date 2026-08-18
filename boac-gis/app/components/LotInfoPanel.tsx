"use client";

import { centroid } from "@turf/turf";
import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { X, MapPin, Copy, Check } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type LotFeature = Feature<Geometry, GeoJsonProperties>;

type LotInfoPanelProps = {
  selectedFeature: LotFeature | null;
  onClose: () => void;
};

type Field = {
  label: string;
  value: string | null;
};

function getPropertyValue(feature: LotFeature | null, key: string): string | null {
  if (!feature?.properties) {
    return null;
  }
  const raw = (feature.properties as Record<string, unknown>)[key];
  if (raw === undefined || raw === null) {
    return null;
  }
  const value = String(raw).trim();
  return value.length > 0 ? value : null;
}

export default function LotInfoPanel({ selectedFeature, onClose }: LotInfoPanelProps) {
  const [copied, setCopied] = useState(false);
  const [sheetMode, setSheetMode] = useState<"half" | "full">("half");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startYRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedFeature) setSheetMode("half");
  }, [selectedFeature]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - startYRef.current;
    
    const isAtTop = contentRef.current ? contentRef.current.scrollTop <= 0 : true;

    if ((delta > 0 && isAtTop) || (delta < 0 && sheetMode === "half")) {
      setIsDragging(true);
      setDragOffset(delta);
    } else {
      setIsDragging(false);
    }
  };

  const handleEnd = () => {
    if (startYRef.current === null) return;
    if (isDragging) {
      if (sheetMode === "half") {
        if (dragOffset < -20) setSheetMode("full");
        else if (dragOffset > 30) onClose();
      } else if (sheetMode === "full") {
        if (dragOffset > 80) onClose();
        else if (dragOffset > 30) setSheetMode("half");
      }
    }
    setIsDragging(false);
    setDragOffset(0);
    startYRef.current = null;
  };

  // Desktop Mouse Dragging via Header
  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return; // Touch is handled by the root modal
    if ((e.target as HTMLElement).closest('button')) return; // Allow button clicks
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
  };

  const handleHeaderPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (startYRef.current === null) return;
    const delta = e.clientY - startYRef.current;
    setIsDragging(true);
    setDragOffset(delta);
  };

  const handleHeaderPointerEnd = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    handleEnd();
  };

  const barangay = getPropertyValue(selectedFeature, "Barangay") ?? "Lot Details";
  const landClass =
    getPropertyValue(selectedFeature, "Land_Class") ?? getPropertyValue(selectedFeature, "LAND_CLASS");

  const owner =
    getPropertyValue(selectedFeature, "Owner") ??
    getPropertyValue(selectedFeature, "OWNER") ??
    getPropertyValue(selectedFeature, "Claimant") ??
    getPropertyValue(selectedFeature, "CLAIMANT");

  let centerCoords: [number, number] | null = null;
  if (selectedFeature && selectedFeature.geometry) {
    try {
      const c = centroid(selectedFeature);
      if (c?.geometry?.coordinates) {
        // turf returns [longitude, latitude], standard is lat, lng
        centerCoords = [c.geometry.coordinates[1], c.geometry.coordinates[0]];
      }
    } catch {
      // fallback if centroid fails
    }
  }

  const handleCopyCoords = () => {
    if (centerCoords) {
      navigator.clipboard.writeText(`${centerCoords[0].toFixed(6)}, ${centerCoords[1].toFixed(6)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const fields: Field[] = [
    { label: "Owner", value: owner },
    { label: "Cadastral Lot No.", value: getPropertyValue(selectedFeature, "CLN") },
    { label: "Approved Lot No.", value: getPropertyValue(selectedFeature, "ALN") },
    { label: "Property ID No.", value: getPropertyValue(selectedFeature, "PIN") },
    { label: "Barangay", value: getPropertyValue(selectedFeature, "Barangay") },
    { label: "Section", value: getPropertyValue(selectedFeature, "Section") },
    { label: "Land Classification", value: landClass },
    { label: "Area", value: getPropertyValue(selectedFeature, "Area") },
    { label: "Coordinates (Center)", value: centerCoords ? `${centerCoords[0].toFixed(6)}, ${centerCoords[1].toFixed(6)}` : null },
    { label: "Remarks", value: getPropertyValue(selectedFeature, "Remarks") },
  ].filter((field) => field.value);

  const isOpen = Boolean(selectedFeature);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[1000] flex flex-col glass-panel
        rounded-t-2xl
        md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:w-80 md:rounded-none md:rounded-l-2xl md:border-t-0
        ${
          isOpen
            ? `opacity-100 h-[85vh] md:h-full ${sheetMode === "half" ? "translate-y-[40vh] md:translate-y-0" : "translate-y-0"}`
            : "pointer-events-none translate-y-full opacity-0 md:translate-y-0 md:translate-x-full md:h-full"
        }`}
      style={{
        transform: isDragging ? `translateY(calc(${sheetMode === "half" ? "40vh" : "0px"} + ${dragOffset}px))` : undefined,
        transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.1, 0.9, 0.2, 1)'
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleEnd}
    >
      {/* Mobile drag handle */}
      <div 
        className="w-full flex justify-center pt-3 pb-1 md:hidden cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerEnd}
        onPointerCancel={handleHeaderPointerEnd}
      >
        <div className="w-10 h-1.5 bg-gray-400 rounded-full" />
      </div>

      {/* Panel Header */}
      <div 
        className="flex items-start justify-between gap-3 px-5 pt-2 md:pt-5 pb-4 border-b border-white/20 md:cursor-default"
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={handleHeaderPointerEnd}
        onPointerCancel={handleHeaderPointerEnd}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0051d5]/10">
            <MapPin className="h-4 w-4 text-[#0051d5]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)]">
              Barangay
            </p>
            <h2 className="text-[15px] font-bold text-[var(--on-surface)] leading-snug truncate">
              {barangay}
            </h2>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 h-7 w-7 flex items-center justify-center rounded-full hover:bg-slate-100/60 text-[var(--on-surface-variant)] transition-colors mt-0.5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Fields */}
      <div 
        className={`flex-1 custom-scrollbar px-5 py-4 ${isDragging ? 'overflow-hidden' : 'overflow-y-auto'}`}
        ref={contentRef}
      >
        {fields.length ? (
          <div className="space-y-2.5">
            {fields.map((field) => (
              <div
                key={field.label}
                className="glass-field group rounded-lg px-4 py-3"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--on-surface-variant)] mb-0.5">
                  {field.label}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-[var(--on-surface)] leading-snug">
                    {field.value}
                  </p>
                  {field.label === "Coordinates (Center)" && (
                    <button
                      onClick={handleCopyCoords}
                      className="rounded-md p-1.5 text-[var(--on-surface-variant)] opacity-0 transition-colors hover:bg-[var(--glass-field-hover)] group-hover:opacity-100 focus:opacity-100"
                      title="Copy Coordinates"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <MapPin className="h-8 w-8 text-[var(--outline-variant)]" />
            <p className="text-[13px] text-[var(--on-surface-variant)]">
              Select a lot on the map to view property details.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
