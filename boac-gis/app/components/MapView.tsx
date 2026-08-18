"use client";

import "leaflet/dist/leaflet.css";

import { booleanPointInPolygon, point } from "@turf/turf";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import L from "leaflet";
import { Satellite, Map as MapIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

import GPSButton from "./GPSButton";
import SearchBar from "./SearchBar";
import SettingsPanel from "./SettingsPanel";
import MiniMap from "./MiniMap";
import { useToast } from "@/hooks/use-toast";

// Fix Leaflet default icon paths in Next.js.
delete (L.Icon.Default.prototype as unknown as { _getIconUrl: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

type LotFeature = Feature<Geometry, GeoJsonProperties>;

type BarangayIndexEntry = {
  name: string;
  file: string;
  bbox: [number, number, number, number];
  lot_count: number;
};

type MapViewProps = {
  selectedFeature: LotFeature | null;
  setSelectedFeature: (feature: LotFeature | null) => void;
  canManageUsers?: boolean;
};

type SearchRecord = {
  CLN?: string;
  ALN?: string;
  PIN?: string;
  Barangay?: string;
  Section?: string;
  Land_Class?: string;
  LAND_CLASS?: string;
  Area?: string;
  Owner?: string;
  __uid?: string;
  file: string;
};

const DEFAULT_CENTER: [number, number] = [13.4477, 121.8472];
const DEFAULT_ZOOM = 13;
const SELECT_ZOOM = 20;
const LOT_LABEL_MIN_ZOOM_DESKTOP = 18;
const LOT_LABEL_MIN_ZOOM_MOBILE = 18;
const LOT_LABEL_CLASS =
  "bg-white/80 backdrop-blur-[2px] border border-[#0051d5]/20 px-2 py-0.5 rounded text-[9px] md:text-xs text-[#0051d5] font-bold shadow-sm text-center lot-label-tooltip leading-none pointer-events-none";

const LAND_CLASS_COLORS: Record<string, string> = {
  agricultural: "#a3e635",    // Vibrant Lime Green
  residential: "#93c5fd",     // Soft Blue
  commercial: "#fcd34d",      // Warm Amber
  industrial: "#f9a8d4",      // Soft Pink
  timberland: "#10b981",      // Deep Emerald Green
  "gov't owned": "#94a3b8",   // Slate Gray
  scientific: "#5eead4",      // Cyan/Teal
  special: "#fca5a5",         // Soft Red
};

const DEFAULT_STYLE: L.PathOptions = {
  color: "#1f2937",
  weight: 1.5,
  opacity: 0.95,
  fillOpacity: 0.4,
};

const HOVER_STYLE: L.PathOptions = {
  color: "#f59e0b",
  fillColor: "#facc15",
  fillOpacity: 0.55,
  weight: 3,
  opacity: 1,
};

const SELECTED_STYLE: L.PathOptions = {
  color: "#00e5ff",
  fillColor: "#2563eb",
  fillOpacity: 0.65,
  weight: 4,
  opacity: 1,
};

function getLandClassColor(feature: LotFeature | undefined): string {
  const raw = feature?.properties?.Land_Class ?? feature?.properties?.LAND_CLASS;
  if (!raw) {
    return "#e5e7eb";
  }
  const normalized = String(raw).trim().toLowerCase();
  return LAND_CLASS_COLORS[normalized] ?? "#e5e7eb";
}

function getFeatureId(feature: LotFeature | undefined): string | null {
  return feature?.properties?.__uid ?? null;
}

function getFeatureLabel(feature: LotFeature | undefined): string {
  const props = feature?.properties;
  if (!props) return "";
  return String(props.CLN || props.PIN || "");
}

function getLayerFeature(layer: L.Path): LotFeature | undefined {
  return (layer as L.Path & { feature?: LotFeature }).feature;
}

export default function MapView({ selectedFeature, setSelectedFeature, canManageUsers = false }: MapViewProps) {
  const { toast } = useToast();
  const [barangayIndex, setBarangayIndex] = useState<BarangayIndexEntry[]>([]);
  const [geojsonByFile, setGeojsonByFile] = useState<Record<string, FeatureCollection>>({});
  const [activeFiles, setActiveFiles] = useState<Set<string>>(new Set());
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showLotNumbers, setShowLotNumbers] = useState(true);
  const [autoLoadBarangay, setAutoLoadBarangay] = useState(true);
  const [locationBarangayFile, setLocationBarangayFile] = useState<string | null>(null);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [basemap, setBasemap] = useState<"streets" | "satellite">("satellite");
  const [activeLandClasses, setActiveLandClasses] = useState<Set<string>>(
    new Set([...Object.keys(LAND_CLASS_COLORS), "unknown"])
  );

  const mapRef = useRef<L.Map | null>(null);
  const loadedFilesRef = useRef<Set<string>>(new Set());
  const geojsonCacheRef = useRef<Record<string, FeatureCollection>>({});
  const featuresRef = useRef<LotFeature[]>([]);
  const layerByIdRef = useRef<Map<string, L.Path>>(new Map());
  const selectedIdRef = useRef<string | null>(null);
  const suppressMapClickRef = useRef(false);
  const lastCoordUpdateRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const hasInitialLocateRef = useRef(false);

  const selectedId = getFeatureId(selectedFeature ?? undefined);
  const lotLabelMinZoom = isMobileViewport ? LOT_LABEL_MIN_ZOOM_MOBILE : LOT_LABEL_MIN_ZOOM_DESKTOP;

  const updateLotLabelVisibility = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const zoom = map.getZoom();
    const canShowLabels = showLotNumbers && zoom >= lotLabelMinZoom;
    const visibleBounds = map.getBounds().pad(0.08);

    layerByIdRef.current.forEach((layer, featureId) => {
      const feature = getLayerFeature(layer);
      const label = getFeatureLabel(feature);
      const isSelected = selectedIdRef.current === featureId;
      let shouldShow = canShowLabels && Boolean(label);

      if (shouldShow && !isSelected) {
        const bounds = (layer as L.Path & { getBounds: () => L.LatLngBounds }).getBounds();
        if (!bounds.isValid()) {
          shouldShow = false;
        } else if (!visibleBounds.intersects(bounds)) {
          shouldShow = false;
        } else if (zoom < SELECT_ZOOM) {
          const northWest = map.latLngToContainerPoint(bounds.getNorthWest());
          const southEast = map.latLngToContainerPoint(bounds.getSouthEast());
          const pixelWidth = Math.abs(southEast.x - northWest.x);
          const pixelHeight = Math.abs(southEast.y - northWest.y);
          const estimatedLabelWidth = Math.max(26, label.length * (isMobileViewport ? 5.8 : 7));
          const estimatedLabelHeight = isMobileViewport ? 16 : 20;
          const minArea = isMobileViewport ? 850 : 1200;

          shouldShow =
            pixelWidth >= estimatedLabelWidth + 10 &&
            pixelHeight >= estimatedLabelHeight + 8 &&
            pixelWidth * pixelHeight >= minArea;
        }
      } else if (shouldShow) {
        const bounds = (layer as L.Path & { getBounds: () => L.LatLngBounds }).getBounds();
        if (!bounds.isValid()) {
          shouldShow = false;
        } else {
          shouldShow = visibleBounds.intersects(bounds);
        }
      }

      if (shouldShow) {
        if (!layer.getTooltip()) {
          layer.bindTooltip(label, {
            permanent: true,
            direction: "center",
            className: LOT_LABEL_CLASS
          });
        }
        layer.getTooltip()?.getElement()?.classList.remove("lot-label-hidden");
      } else if (layer.getTooltip()) {
        layer.unbindTooltip();
      }
    });
  }, [isMobileViewport, lotLabelMinZoom, showLotNumbers]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleViewportChange = () => {
      setIsMobileViewport(mediaQuery.matches);
    };

    handleViewportChange();
    mediaQuery.addEventListener("change", handleViewportChange);
    return () => mediaQuery.removeEventListener("change", handleViewportChange);
  }, []);

  const getDefaultStyle = useCallback((feature?: LotFeature): L.PathOptions => {
    const rawClass = feature?.properties?.Land_Class ?? feature?.properties?.LAND_CLASS;
    const normalized = rawClass ? String(rawClass).trim().toLowerCase() : "unknown";
    const isActive = activeLandClasses.has(normalized);

    return {
      ...DEFAULT_STYLE,
      fillColor: getLandClassColor(feature),
      fillOpacity: isActive ? DEFAULT_STYLE.fillOpacity : 0.05,
      weight: isActive ? DEFAULT_STYLE.weight : 0.2,
      color: isActive ? DEFAULT_STYLE.color : "#aaa",
    };
  }, [activeLandClasses]);

  const syncSelectedStyles = useCallback(() => {
    const prevId = selectedIdRef.current;
    if (prevId && layerByIdRef.current.has(prevId)) {
      const prevLayer = layerByIdRef.current.get(prevId) as L.Path & { feature?: LotFeature };
      prevLayer.setStyle(getDefaultStyle(prevLayer.feature));
    }
    if (selectedId && layerByIdRef.current.has(selectedId)) {
      const selectedLayer = layerByIdRef.current.get(selectedId) as L.Path & { feature?: LotFeature };
      selectedLayer.setStyle(SELECTED_STYLE);
      selectedLayer.bringToFront();
    }
    selectedIdRef.current = selectedId ?? null;
  }, [getDefaultStyle, selectedId]);

  useEffect(() => {
    fetch("/geojson/index.json")
      .then((response) => response.json())
      .then((data: BarangayIndexEntry[]) => {
        // Filter out Poblacion as requested by the user
        const filteredData = data.filter(b => !b.name.toLowerCase().includes('poblacion'));
        setBarangayIndex(filteredData);
      })
      .catch(() => {
        toast({ title: "Failed to load barangay index" });
      });
  }, [toast]);

  useEffect(() => {
    syncSelectedStyles();
    requestAnimationFrame(updateLotLabelVisibility);
  }, [syncSelectedStyles, updateLotLabelVisibility]);

  const ensureBarangayLoaded = useCallback(
    async (file: string) => {
      // Use ref for cache — never stale, no dependency on geojsonByFile state
      if (loadedFilesRef.current.has(file)) {
        return geojsonCacheRef.current[file];
      }
      loadedFilesRef.current.add(file);
      try {
        const response = await fetch(encodeURI(file));
        if (!response.ok) {
          throw new Error("Failed to load GeoJSON");
        }
        const data = (await response.json()) as FeatureCollection;
        data.features.forEach((f, idx) => {
          if (!f.properties) f.properties = {};
          f.properties.__uid = `${file}-${idx}`;
        });
        // Write to ref immediately (synchronous) — always fresh for any follow-up reads
        geojsonCacheRef.current[file] = data;
        // Write to state so GeoLayers re-renders and shows shapes
        setGeojsonByFile((prev) => ({ ...prev, [file]: data }));
        featuresRef.current = [...featuresRef.current, ...(data.features as LotFeature[])];
        return data;
      } catch {
        loadedFilesRef.current.delete(file);
        toast({ title: "Failed to load barangay data" });
        return undefined;
      }
    },
    [toast] // stable — toast never changes, so this callback is created only once
  );
  const findBarangayAtCoordinate = useCallback(
    async (latitude: number, longitude: number) => {
      const targetPoint = point([longitude, latitude]);
      const matchingCandidates = barangayIndex.filter((b) => {
        const [minLon, minLat, maxLon, maxLat] = b.bbox;
        return longitude >= minLon && longitude <= maxLon && latitude >= minLat && latitude <= maxLat;
      });

      let trueBarangay: BarangayIndexEntry | null = null;
      for (const candidate of matchingCandidates) {
        const data = await ensureBarangayLoaded(candidate.file);
        if (!data) continue;
        const isInside = (data.features as LotFeature[]).some((feature) => {
          if (!feature?.geometry) return false;
          // @ts-expect-error valid GeoJSON polygon feature for turf.
          return booleanPointInPolygon(targetPoint, feature);
        });
        if (isInside) {
          trueBarangay = candidate;
          break;
        }
      }

      return trueBarangay || matchingCandidates[0] || null;
    },
    [barangayIndex, ensureBarangayLoaded]
  );

  const turnOnLocationBarangay = useCallback(
    async (latitude: number, longitude: number, messagePrefix = "Loaded") => {
      const barangayToLoad = await findBarangayAtCoordinate(latitude, longitude);
      if (!barangayToLoad) {
        return;
      }

      setLocationBarangayFile(barangayToLoad.file);
      let wasActive = false;
      setActiveFiles((prev) => {
        wasActive = prev.has(barangayToLoad.file);
        if (wasActive) {
          return prev;
        }
        return new Set(prev).add(barangayToLoad.file);
      });
      if (!wasActive) {
        toast({ title: `${messagePrefix} ${barangayToLoad.name} based on location` });
      }
    },
    [findBarangayAtCoordinate, toast]
  );

  const handleLocationBarangayToggle = useCallback(
    (enabled: boolean) => {
      setAutoLoadBarangay(enabled);

      if (!enabled) {
        if (locationBarangayFile) {
          setActiveFiles((prev) => {
            const next = new Set(prev);
            next.delete(locationBarangayFile);
            return next;
          });
        }
        setLocationBarangayFile(null);
        return;
      }

      if (userLocation) {
        void turnOnLocationBarangay(userLocation.lat, userLocation.lng);
      }
    },
    [locationBarangayFile, turnOnLocationBarangay, userLocation]
  );

  useEffect(() => {
    if ("geolocation" in navigator) {
      setIsLocating(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          setIsLocating(false);
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });

          if (!hasInitialLocateRef.current) {
            hasInitialLocateRef.current = true;
            if (mapRef.current) {
              mapRef.current.flyTo([latitude, longitude], SELECT_ZOOM, { animate: true, duration: 2.5 });
            }
            if (autoLoadBarangay) {
              setTimeout(async () => {
                await turnOnLocationBarangay(latitude, longitude, "Auto-loaded");
              }, 2600);
            }
          }
        },
        (error) => {
          setIsLocating(false);
          console.warn("Geolocation watch error:", error);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
    }
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [autoLoadBarangay, turnOnLocationBarangay]);

  useEffect(() => {
    requestAnimationFrame(updateLotLabelVisibility);
  }, [showLotNumbers, activeFiles, geojsonByFile, updateLotLabelVisibility]);

  const toggleFile = useCallback(
    async (file: string) => {
      if (activeFiles.has(file)) {
        // Turn OFF — just remove from active set
        setActiveFiles((prev) => {
          const next = new Set(prev);
          next.delete(file);
          return next;
        });
        return;
      }
      // Turn ON — add to active set first so the layer slot appears,
      // then load the GeoJSON data and fly to its bounds
      setActiveFiles((prev) => new Set(prev).add(file));
      const data = await ensureBarangayLoaded(file);
      if (data && mapRef.current) {
        const bounds = L.geoJSON(data).getBounds();
        if (bounds.isValid()) {
          mapRef.current.flyToBounds(bounds, { duration: 2.5, padding: [100, 100], maxZoom: 18 });
        }
      }
    },
    [activeFiles, ensureBarangayLoaded]
  );

  const toggleLandClass = useCallback((lc: string) => {
    setActiveLandClasses((prev) => {
      const next = new Set(prev);
      if (next.has(lc)) {
        next.delete(lc);
      } else {
        next.add(lc);
      }
      return next;
    });
  }, []);

  const selectFeature = useCallback(
    (feature: LotFeature, flyToFeature = true) => {
      setSelectedFeature(feature);
      if (flyToFeature && mapRef.current) {
        const bounds = L.geoJSON(feature).getBounds();
        if (bounds.isValid()) {
          // Automatically calculate the perfect zoom level to frame the entire property, with a max limit
          mapRef.current.flyToBounds(bounds, { duration: 2.5, padding: [50, 50], maxZoom: 21 });
        }
      }
    },
    [setSelectedFeature]
  );

  const handleSearchSelect = useCallback(
    async (record: SearchRecord) => {
      if (!activeFiles.has(record.file)) {
        toast({ title: "That barangay is no longer turned on" });
        return;
      }
      const data = await ensureBarangayLoaded(record.file);
      if (!data) {
        return;
      }
      const matchId = record.CLN ?? "";
      const matchPin = record.PIN ?? "";
      const matchAln = record.ALN ?? "";
      const matchOwner = record.Owner?.trim().toLowerCase() ?? "";
      const matchUid = record.__uid ?? "";

      const matched = (data.features as LotFeature[]).find((feature) => {
        const uid = feature.properties?.__uid ?? "";
        // 1. Perfect Match using __uid
        if (matchUid && uid === matchUid) {
          return true;
        }

        // 2. Fallback matching logic (in case of old cache)
        const props = feature.properties as GeoJsonProperties;
        const cln = props?.CLN ? String(props.CLN) : "";
        const pin = props?.PIN ? String(props.PIN) : "";
        const aln = props?.ALN ? String(props.ALN) : "";
        const owner = props?.Owner ? String(props.Owner).trim().toLowerCase() : "";
        
        if (matchId && cln !== matchId) return false;
        if (matchPin && pin !== matchPin) return false;
        if (matchAln && aln !== matchAln) return false;
        if (matchOwner && owner !== matchOwner) return false;
        
        return true;
      });

      if (matched) {
        selectFeature(matched, true);
        
        // Check if geometry is valid to provide user feedback
        const bounds = L.geoJSON(matched).getBounds();
        if (!bounds.isValid()) {
          toast({ 
            title: "Cannot focus shape", 
            description: "The geometry for this lot is missing or invalid in the database.",
            variant: "destructive" 
          });
        }
      } else {
        toast({ 
          title: "Lot not found on map", 
          description: "The lot exists in the search index but couldn't be located in the map file. Try clearing your browser cache.",
          variant: "destructive" 
        });
      }
    },
    [activeFiles, ensureBarangayLoaded, selectFeature, toast]
  );

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation is not supported by your browser" });
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        if (mapRef.current) {
          mapRef.current.flyTo([latitude, longitude], SELECT_ZOOM, { animate: true, duration: 2.5 });
        }

        setTimeout(async () => {
          const targetPoint = point([longitude, latitude]);

          if (autoLoadBarangay) {
            await turnOnLocationBarangay(latitude, longitude);
          }

          const matched = featuresRef.current.find((feature) => {
            if (!feature?.geometry) {
              return false;
            }
            // @ts-expect-error valid format for turf booleanPointInPolygon
            return booleanPointInPolygon(targetPoint, feature);
          });
          if (matched) {
            selectFeature(matched, false);
          } else {
            toast({ title: "No cadastral lot found exactly at your coordinate, but showing location map." });
          }
        }, 2600);
      },
      (error) => {
        setIsLocating(false);
        toast({ title: "Geolocation error: " + error.message });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [selectFeature, toast, autoLoadBarangay, turnOnLocationBarangay]);

  const GeoLayers = useMemo(() => {
    return Array.from(activeFiles).map((file) => {
      const data = geojsonByFile[file];
      if (!data) return null;
      return (
        <GeoJSON
          key={file}
          data={data}
          style={(feature) => {
            const lotFeature = feature as LotFeature | undefined;
            if (selectedId && getFeatureId(lotFeature) === selectedId) {
              return SELECTED_STYLE;
            }
            return getDefaultStyle(lotFeature);
          }}
          onEachFeature={(feature, layer) => {
            const lotFeature = feature as LotFeature;
            const featureId = getFeatureId(lotFeature);
            const featureLabel = getFeatureLabel(lotFeature);
            // Ensure the feature object is attached so the useEffect can grab it later
            (layer as L.Path & { feature?: LotFeature }).feature = lotFeature;
            
            if (featureId) {
              layerByIdRef.current.set(featureId, layer as L.Path);
              if (showLotNumbers && featureLabel && selectedIdRef.current === featureId) {
                layer.bindTooltip(featureLabel, {
                  permanent: true,
                  direction: "center",
                  className: LOT_LABEL_CLASS
                });
              }
            }
            layer.on({
              remove: () => {
                if (featureId) {
                  layerByIdRef.current.delete(featureId);
                }
              },
              mouseover: () => {
                (layer as L.Path).setStyle(
                  featureId && selectedIdRef.current === featureId ? SELECTED_STYLE : HOVER_STYLE
                );
              },
              mouseout: () => {
                if (featureId && selectedIdRef.current === featureId) {
                  (layer as L.Path).setStyle(SELECTED_STYLE);
                } else {
                  (layer as L.Path).setStyle(getDefaultStyle(lotFeature));
                }
              },
              click: (event) => {
                L.DomEvent.stopPropagation(event);
                suppressMapClickRef.current = true;
                selectFeature(lotFeature, false);
              },
            });
          }}
        />
      );
    });
  }, [activeFiles, geojsonByFile, getDefaultStyle, selectFeature, selectedId, showLotNumbers]);

  function MapEvents() {
    useMapEvents({
      zoomend: (e) => {
        setCurrentZoom(e.target.getZoom());
        requestAnimationFrame(updateLotLabelVisibility);
      },
      moveend: () => {
        requestAnimationFrame(updateLotLabelVisibility);
      },
      mousemove: (e) => {
        const now = performance.now();
        if (now - lastCoordUpdateRef.current >= 120) {
          lastCoordUpdateRef.current = now;
          setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        }
      },
      click: () => {
        if (suppressMapClickRef.current) {
          suppressMapClickRef.current = false;
          return;
        }
        setSelectedFeature(null);
      },
    });
    return null;
  }

  return (
    <div className={`relative h-full w-full ${(currentZoom < lotLabelMinZoom || !showLotNumbers) ? "hide-lot-labels" : ""}`}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        maxZoom={30}
        zoomControl={false}
        preferCanvas
        className="h-full w-full"
        ref={mapRef}
      >
        {basemap === "streets" ? (
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={30}
            maxNativeZoom={19}
          />
        ) : (
          <TileLayer
            attribution="&copy; Google"
            url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
            maxZoom={30}
            maxNativeZoom={20}
          />
        )}
        <MapEvents />
        {GeoLayers}
        {userLocation ? (
          <Marker position={[userLocation.lat, userLocation.lng]} />
        ) : null}
        
        {/* Dynamic Mini-Map Overview */}
        <MiniMap basemap={basemap} />
      </MapContainer>

      <SearchBar onSelect={handleSearchSelect} activeFiles={activeFiles} canManageUsers={canManageUsers} />
      
      {/* FAB Cluster — bottom-right */}
      <div
        className={`absolute z-[1000] flex flex-col items-center gap-2 glass-panel rounded-2xl p-2 transition-all duration-300 ${
          selectedFeature ? "bottom-[52vh] right-4 md:bottom-8 md:right-[336px]" : "bottom-8 right-4"
        }`}
      >
        {/* Basemap toggle */}
        <button
          onClick={() => setBasemap(basemap === "streets" ? "satellite" : "streets")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/70 text-[var(--on-surface-variant)] shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-md"
          title={basemap === "streets" ? "Switch to Satellite" : "Switch to Streets"}
        >
          {basemap === "streets" ? <Satellite className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
        </button>

        {/* Divider */}
        <div className="h-px w-6 bg-[var(--outline-variant)]/40" />

        {/* Settings Panel trigger */}
        <SettingsPanel
          barangays={barangayIndex}
          activeFiles={activeFiles}
          toggleFile={toggleFile}
          showLotNumbers={showLotNumbers}
          setShowLotNumbers={setShowLotNumbers}
          autoLoadBarangay={autoLoadBarangay}
          setAutoLoadBarangay={handleLocationBarangayToggle}
          basemap={basemap}
          setBasemap={setBasemap}
          activeLandClasses={activeLandClasses}
          toggleLandClass={toggleLandClass}
          landClasses={[...Object.keys(LAND_CLASS_COLORS), "unknown"]}
        />

        {/* GPS / My Location */}
        <GPSButton onLocate={handleLocate} isLocating={isLocating} />
      </div>

      {/* Coordinate Bar — bottom center */}
      <div className="absolute bottom-3 md:bottom-4 left-1/2 -translate-x-1/2 z-[1000] glass-panel px-3 md:px-4 py-1.5 md:py-2 rounded-full w-auto max-w-[95%]">
        <div className="coord-bar flex items-center justify-center gap-3 md:gap-4 text-[var(--on-surface)] text-[10px] md:text-[12px] whitespace-nowrap">
          <span>
            LAT:{" "}
            <span className="text-[#0051d5] font-semibold">
              {coords ? `${coords.lat.toFixed(4)}° N` : "—"}
            </span>
          </span>
          <span>
            LNG:{" "}
            <span className="text-[#0051d5] font-semibold">
              {coords ? `${coords.lng.toFixed(4)}° E` : "—"}
            </span>
          </span>
        </div>
      </div>

      {/* <MapLegend colors={LAND_CLASS_COLORS} /> */}
    </div>
  );
}
