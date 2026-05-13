import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Layers, LogOut, X, ChevronDown, Map, Satellite } from "lucide-react";
import { logout } from "@/app/login/actions";

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
  basemap: "streets" | "satellite";
  setBasemap: (map: "streets" | "satellite") => void;
  activeLandClasses: Set<string>;
  toggleLandClass: (lc: string) => void;
  landClasses: string[];
};

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0051d5] ${
        checked ? "bg-[#0051d5]" : "bg-[var(--surface-dim,#d8dadc)]"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
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
  basemap,
  setBasemap,
  activeLandClasses,
  toggleLandClass,
  landClasses,
}: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [barangaySearch, setBarangaySearch] = useState("");
  
  const [sheetMode, setSheetMode] = useState<"half" | "full">("half");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const startYRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) setSheetMode("half");
  }, [isOpen]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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
        else if (dragOffset > 30) setIsOpen(false);
      } else if (sheetMode === "full") {
        if (dragOffset > 80) setIsOpen(false);
        else if (dragOffset > 30) setSheetMode("half");
      }
    }
    setIsDragging(false);
    setDragOffset(0);
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
    setIsDragging(true);
    setDragOffset(delta);
  };

  const handleHeaderPointerEnd = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    e.currentTarget.releasePointerCapture(e.pointerId);
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
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/20 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-md ${
          isOpen
            ? "bg-[#0051d5] text-white"
            : "bg-white/70 text-[var(--on-surface-variant)] hover:bg-white/90"
        }`}
        title="Map Settings"
      >
        {isOpen ? <X className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
      </button>

      {/* Panel */}
      {mounted && createPortal(
        <div
          className={`fixed bottom-0 left-0 right-0 z-[1100] flex flex-col glass-panel
            rounded-t-2xl md:rounded-xl overflow-hidden
            md:absolute md:bottom-8 md:right-[380px] md:left-auto md:w-[300px]
            ${isOpen ? `opacity-100 h-[85vh] md:h-auto ${sheetMode === "half" ? "translate-y-[40vh] md:translate-y-0" : "translate-y-0"}` : "pointer-events-none translate-y-full opacity-0 md:translate-y-0 md:scale-95"}`}
          style={{ 
            maxHeight: "85vh",
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
          <button
            onClick={() => setIsOpen(false)}
            className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-slate-100/60 text-[var(--on-surface-variant)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
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
                  <Toggle checked={showLotNumbers} onChange={setShowLotNumbers} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--on-surface)]">
                    Auto-load Barangay Cadastral
                  </span>
                  <Toggle checked={autoLoadBarangay} onChange={setAutoLoadBarangay} />
                </div>
                {/* Basemap toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--on-surface)]">Satellite View</span>
                  <Toggle
                    checked={basemap === "satellite"}
                    onChange={(v) => setBasemap(v ? "satellite" : "streets")}
                  />
                </div>
              </div>
            </section>

            {/* ── Land Classification ── */}
            <section>
              <details className="group rounded-xl border border-white/30 bg-white/40 [&_summary::-webkit-details-marker]:hidden">
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
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-blue-50/60 cursor-pointer transition-colors"
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
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--on-surface-variant)] pointer-events-none"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/50 border border-[var(--outline-variant)]/50 text-[12px] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[#0051d5]/20"
                  placeholder="Find barangay…"
                  value={barangaySearch}
                  onChange={(e) => setBarangaySearch(e.target.value)}
                />
              </div>

              <div className="space-y-0.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                {filteredBarangays.map((b) => (
                  <div
                    key={b.file}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-100/50 cursor-pointer transition-colors"
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
                  </div>
                ))}
              </div>
            </section>
          </div>

            {/* Footer — Sign Out */}
            <div className="px-4 py-3 border-t border-white/20 bg-white/30">
              <button
                onClick={() => logout()}
                className="flex w-full items-center justify-center gap-2 py-2.5 rounded-lg border border-red-200/60 text-red-600 text-[13px] font-semibold hover:bg-red-50/60 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        , document.body)}
    </div>
  );
}
