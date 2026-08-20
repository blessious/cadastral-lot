import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Layers, X, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

type BarangayIndexEntry = {
  name: string;
  file: string;
};

type SettingsPanelProps = {
  barangays: BarangayIndexEntry[];
  activeFiles: Set<string>;
  toggleFile: (file: string) => void;
  showLotNumbers: boolean;
  setShowLotNumbers: (show: boolean) => void;
  autoLoadBarangay: boolean;
  setAutoLoadBarangay: (show: boolean) => void;
  activeLandClasses: Set<string>;
  toggleLandClass: (lc: string) => void;
  landClasses: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  detailsOpen: boolean;
};

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-11 w-11 items-center rounded-full border-0 bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0051d5]"
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 h-6 w-11 rounded-full transition-colors duration-200 ${
          checked ? "bg-[#0051d5]" : "bg-[var(--surface-dim,#d8dadc)]"
        }`}
      />
      <span
        className={`relative inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function SettingsPanel({
  barangays,
  activeFiles,
  toggleFile,
  showLotNumbers,
  setShowLotNumbers,
  autoLoadBarangay,
  setAutoLoadBarangay,
  activeLandClasses,
  toggleLandClass,
  landClasses,
  isOpen,
  onOpenChange,
  detailsOpen,
}: SettingsPanelProps) {
  const [barangaySearch, setBarangaySearch] = useState("");
  
  const [sheetMode, setSheetMode] = useState<"half" | "full">("half");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startYRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  const dragFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) setSheetMode("half");
  }, [isOpen]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => {
      if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    };
  }, []);

  const scheduleDragOffset = (offset: number) => {
    dragOffsetRef.current = offset;
    if (dragFrameRef.current !== null) return;
    dragFrameRef.current = requestAnimationFrame(() => {
      setDragOffset(dragOffsetRef.current);
      dragFrameRef.current = null;
    });
  };

  const startDragging = () => {
    if (draggingRef.current) return;
    draggingRef.current = true;
    setIsDragging(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
    dragOffsetRef.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - startYRef.current;
    
    const isAtTop = contentRef.current ? contentRef.current.scrollTop <= 0 : true;

    if ((delta > 0 && isAtTop) || (delta < 0 && sheetMode === "half")) {
      startDragging();
      scheduleDragOffset(delta);
    } else {
      draggingRef.current = false;
      setIsDragging(false);
      scheduleDragOffset(0);
    }
  };

  const handleEnd = () => {
    if (startYRef.current === null) return;
    const finalOffset = dragOffsetRef.current;
    if (draggingRef.current) {
      if (sheetMode === "half") {
        if (finalOffset < -20) setSheetMode("full");
        else if (finalOffset > 30) onOpenChange(false);
      } else if (sheetMode === "full") {
        if (finalOffset > 80) onOpenChange(false);
        else if (finalOffset > 30) setSheetMode("half");
      }
    }
    draggingRef.current = false;
    dragOffsetRef.current = 0;
    setIsDragging(false);
    scheduleDragOffset(0);
    startYRef.current = null;
  };

  // Desktop Mouse Dragging via Header
  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return; 
    if ((e.target as HTMLElement).closest('button')) return; // Allow button clicks
    e.currentTarget.setPointerCapture(e.pointerId);
    startYRef.current = e.clientY;
  };

  const handleHeaderPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (startYRef.current === null) return;
    const delta = e.clientY - startYRef.current;
    startDragging();
    scheduleDragOffset(delta);
  };

  const handleHeaderPointerEnd = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    handleEnd();
  };

  const contentRef = useRef<HTMLDivElement>(null);

  const filteredBarangays = barangaySearch.trim()
    ? barangays.filter((b) =>
        b.name.toLowerCase().includes(barangaySearch.toLowerCase())
      )
    : barangays;

  return (
    <div className="relative">
      {/* FAB Trigger */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onOpenChange(!isOpen)}
        className={`map-control-button ${isOpen ? "bg-[#0051d5] text-white hover:bg-[#0051d5]" : ""}`}
        title="Map Settings"
        aria-label="Map settings"
      >
        {isOpen ? <X className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
      </Button>

      {/* Panel */}
      {mounted && createPortal(
        <div
          className={`fixed bottom-0 left-0 right-0 z-[1100] flex flex-col pb-[env(safe-area-inset-bottom)] glass-panel
            rounded-t-2xl md:rounded-xl overflow-hidden
            md:absolute md:top-20 md:left-auto md:bottom-auto md:w-[400px] ${detailsOpen ? "md:right-[21rem]" : "md:right-16"}
            ${isOpen ? `opacity-100 h-[92vh] md:h-auto ${sheetMode === "half" ? "translate-y-[32vh] md:translate-y-0" : "translate-y-0"}` : "pointer-events-none translate-y-full opacity-0 md:translate-y-0 md:scale-95"}`}
          style={{ 
            maxHeight: "92vh",
            transform: isDragging ? `translateY(calc(${sheetMode === "half" ? "32vh" : "0px"} + ${dragOffset}px))` : undefined,
            transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.1, 0.9, 0.2, 1)'
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
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

          {/* Header */}
          <div 
            className="flex items-center justify-between px-4 pt-2 md:pt-3.5 pb-3.5 border-b border-white/20"
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={handleHeaderPointerEnd}
            onPointerCancel={handleHeaderPointerEnd}
          >
          <h3 className="text-[15px] font-bold text-[var(--on-surface)]">
            Map Settings
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onOpenChange(false)}
            className="text-[var(--on-surface-variant)]"
            aria-label="Close map settings"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

          {/* Scrollable Content */}
          <div 
            className={`flex-1 custom-scrollbar px-4 py-3 space-y-5 ${isDragging ? 'overflow-hidden' : 'overflow-y-auto'}`}
            ref={contentRef}
          >

            {/* ── General ── */}
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)] mb-3">
                General
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--on-surface)]">
                    Show Cadastral Lot No.
                  </span>
                  <Toggle checked={showLotNumbers} onChange={setShowLotNumbers} label="Show cadastral lot numbers" />
                </div>
              </div>
            </section>

            {/* -- Current Location -- */}
            <section>
              <h4 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)]">
                Current Location
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-[var(--on-surface)]">
                    Barangay Shape
                  </span>
                  <Toggle checked={autoLoadBarangay} onChange={setAutoLoadBarangay} label="Automatically load the barangay at my location" />
                </div>
                <p className="text-[11px] leading-4 text-[var(--on-surface-variant)]">
                  When on, current location automatically turns on the matching barangay shape.
                </p>
              </div>
            </section>

            {/* ── Land Classification ── */}
            <section>
              <details className="glass-field group rounded-lg [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between px-4 py-3 list-none">
                  <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)] m-0">
                    Land Classification
                  </h4>
                  <ChevronDown className="h-4 w-4 text-[var(--on-surface-variant)] transition-transform group-open:rotate-180" />
                </summary>
                <div className="px-4 pb-3 pt-1 border-t border-white/20 grid grid-cols-2 gap-2">
                  {landClasses.map((lc) => (
                    <label
                      key={lc}
                    className="glass-field-hover flex min-h-11 cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={activeLandClasses.has(lc)}
                        onChange={() => toggleLandClass(lc)}
                        className="h-4 w-4 rounded border-gray-300 text-[#0051d5] focus:ring-[#0051d5]/30"
                      />
                      <span className="text-[12px] font-medium text-[var(--on-surface)] capitalize leading-none">
                        {lc}
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            </section>

            {/* ── Barangays ── */}
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)] mb-3">
                Barangays
              </h4>
              {/* Search */}
              <div className="relative mb-2.5">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--on-surface-variant)] pointer-events-none" />
                <input
                  className="glass-input h-11 w-full rounded-lg border py-1.5 pl-8 pr-3 text-[12px] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[#0051d5]/20"
                  placeholder="Find barangay…"
                  value={barangaySearch}
                  onChange={(e) => setBarangaySearch(e.target.value)}
                />
              </div>

              <div className="space-y-0.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                {filteredBarangays.map((b) => (
                  <button
                    key={b.file}
                    type="button"
                    aria-pressed={activeFiles.has(b.file)}
                    className="glass-field-hover flex min-h-11 w-full cursor-pointer items-center justify-between rounded-lg p-2 text-left transition-colors"
                    onClick={() => toggleFile(b.file)}
                  >
                    <span className="text-[12px] text-[var(--on-surface)]">{b.name}</span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                        activeFiles.has(b.file)
                          ? "bg-[#0051d5]/10 text-[#0051d5]"
                          : "bg-slate-100/60 text-[var(--on-surface-variant)]"
                      }`}
                    >
                      {activeFiles.has(b.file) ? "ON" : "OFF"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          </div>
        , document.body)}
    </div>
  );
}
