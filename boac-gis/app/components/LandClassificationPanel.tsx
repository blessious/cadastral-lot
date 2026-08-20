import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ListFilter, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type LandClassificationPanelProps = {
  activeLandClasses: Set<string>;
  toggleLandClass: (landClass: string) => void;
  landClasses: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  detailsOpen: boolean;
};

export default function LandClassificationPanel({
  activeLandClasses,
  toggleLandClass,
  landClasses,
  isOpen,
  onOpenChange,
  detailsOpen,
}: LandClassificationPanelProps) {
  const [sheetMode, setSheetMode] = useState<"half" | "full">("half");
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [mounted, setMounted] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  const dragFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) setSheetMode("half");
  }, [isOpen]);

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

  const handleHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    if ((e.target as HTMLElement).closest("button")) return;
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

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onOpenChange(!isOpen)}
        className={`map-control-button ${isOpen ? "bg-[#0051d5] text-white hover:bg-[#0051d5]" : ""}`}
        title="Land Classification"
        aria-label="Land classification"
      >
        {isOpen ? <X className="h-4 w-4" /> : <ListFilter className="h-4 w-4" />}
      </Button>

      {mounted && createPortal(
        <div
          className={`fixed bottom-0 left-0 right-0 z-[1100] flex flex-col pb-[env(safe-area-inset-bottom)] glass-panel
            rounded-t-2xl md:rounded-xl overflow-hidden
            md:absolute md:top-20 md:left-auto md:bottom-auto md:w-[400px] ${detailsOpen ? "md:right-[21rem]" : "md:right-16"}
            ${isOpen ? `opacity-100 h-[92vh] md:h-auto ${sheetMode === "half" ? "translate-y-[32vh] md:translate-y-0" : "translate-y-0"}` : "pointer-events-none translate-y-full opacity-0 md:translate-y-0 md:scale-95"}`}
          style={{
            maxHeight: "92vh",
            transform: isDragging ? `translateY(calc(${sheetMode === "half" ? "32vh" : "0px"} + ${dragOffset}px))` : undefined,
            transition: isDragging ? "none" : "transform 0.2s cubic-bezier(0.1, 0.9, 0.2, 1)",
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
        >
          <div
            className="w-full flex justify-center pt-3 pb-1 md:hidden cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={handleHeaderPointerEnd}
            onPointerCancel={handleHeaderPointerEnd}
          >
            <div className="w-10 h-1.5 bg-gray-400 rounded-full" />
          </div>

          <div
            className="flex items-center justify-between px-4 pt-2 md:pt-3.5 pb-3.5 border-b border-white/20"
            onPointerDown={handleHeaderPointerDown}
            onPointerMove={handleHeaderPointerMove}
            onPointerUp={handleHeaderPointerEnd}
            onPointerCancel={handleHeaderPointerEnd}
          >
            <h3 className="text-[15px] font-bold text-[var(--on-surface)]">
              Land Classification
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              className="text-[var(--on-surface-variant)]"
              aria-label="Close land classification"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div
            className={`custom-scrollbar grid grid-cols-2 gap-2 px-4 py-3 ${isDragging ? "overflow-hidden" : "overflow-y-auto"}`}
            ref={contentRef}
          >
            {landClasses.map((landClass) => (
              <label
                key={landClass}
                className="glass-field-hover flex min-h-11 cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={activeLandClasses.has(landClass)}
                  onChange={() => toggleLandClass(landClass)}
                  className="h-4 w-4 rounded border-gray-300 text-[#0051d5] focus:ring-[#0051d5]/30"
                />
                <span className="text-[12px] font-medium text-[var(--on-surface)] capitalize leading-none">
                  {landClass}
                </span>
              </label>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
