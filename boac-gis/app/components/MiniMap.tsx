"use client";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import { Map as MapLucide, Minus } from "lucide-react";

type MiniMapProps = {
  basemap: "streets" | "satellite";
  theme: "light" | "dark";
};

const LIGHT_STREETS_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE_TILE_URL = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";

export default function MiniMap({ basemap, theme }: MiniMapProps) {
  const mainMap = useMap();
  const minimapContainerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.TileLayer | null>(null);
  const rectRef = useRef<L.Rectangle | null>(null);
  
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (!minimapContainerRef.current) return;

    // Initialize the minimap
    const minimap = L.map(minimapContainerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    
    minimapRef.current = minimap;

    // Create the bounding box representing the main map's view
    const rect = L.rectangle(mainMap.getBounds(), {
      color: "#0051d5",
      weight: 2,
      fillColor: "#0051d5",
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(minimap);
    
    rectRef.current = rect;

    // Sync function: match minimap center, but zoomed out by 5 levels
    const syncMaps = () => {
      const bounds = mainMap.getBounds();
      rect.setBounds(bounds);
      minimap.setView(mainMap.getCenter(), Math.max(0, mainMap.getZoom() - 5), { animate: false });
    };

    // Bind events
    mainMap.on("move", syncMaps);
    mainMap.on("zoom", syncMaps);
    
    // Initial sync
    syncMaps();

    return () => {
      mainMap.off("move", syncMaps);
      mainMap.off("zoom", syncMaps);
      minimap.remove();
      minimapRef.current = null;
    };
  }, [mainMap]);

  // Update tile layer when basemap or theme changes
  useEffect(() => {
    if (minimapRef.current) {
      if (layerRef.current) {
        layerRef.current.remove();
      }
      
      const url = basemap === "streets"
        ? LIGHT_STREETS_TILE_URL
        : SATELLITE_TILE_URL;
        
      layerRef.current = L.tileLayer(url, {
        className: theme === "dark" && basemap === "streets" ? "map-tiles map-tiles-filtered" : "map-tiles",
        maxZoom: 20,
      }).addTo(minimapRef.current);
    }
  }, [basemap, theme]);

  // Force map to recalculate size when the container expands/collapses
  useEffect(() => {
    if (minimapRef.current) {
      setTimeout(() => { minimapRef.current?.invalidateSize(); }, 50);
      setTimeout(() => { minimapRef.current?.invalidateSize(); }, 300);
    }
  }, [isExpanded]);

  // Stop propagation of clicks so we don't trigger main map events
  const stopPropagation = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  return (
    <div 
      className={`absolute bottom-4 left-4 z-[1000] overflow-hidden rounded-xl glass-panel transition-all duration-300 ${
        isExpanded ? "h-36 w-36 md:h-48 md:w-48" : "h-11 w-11"
      }`}
      onMouseDown={stopPropagation}
      onMouseUp={stopPropagation}
      onClick={stopPropagation}
      onDoubleClick={stopPropagation}
      onTouchStart={stopPropagation}
      onTouchEnd={stopPropagation}
    >
      {/* Map Container */}
      <div 
        ref={minimapContainerRef} 
        className={`h-full w-full transition-opacity duration-300 ${!isExpanded ? "opacity-0" : "opacity-100"}`}
      />
      
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`absolute z-[1010] flex items-center justify-center transition-all text-[var(--on-surface-variant)] hover:text-[var(--on-surface)] ${
          isExpanded 
            ? "top-1 right-1 h-11 w-11 rounded-lg glass-field glass-field-hover shadow-sm"
            : "inset-0 h-full w-full glass-field glass-field-hover"
        }`}
        title={isExpanded ? "Collapse overview map" : "Expand overview map"}
      >
        {isExpanded ? (
          <Minus className="h-3 w-3" />
        ) : (
          <MapLucide className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
