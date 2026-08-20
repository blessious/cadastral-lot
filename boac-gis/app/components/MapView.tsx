"use client";

import "leaflet/dist/leaflet.css";

import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import L from "leaflet";
import { Minus, Plus, Satellite, Map as MapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

import GPSButton from "./GPSButton";
import SearchBar from "./SearchBar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const SettingsPanel = dynamic(() => import("./SettingsPanel"), { ssr: false });
const MiniMap = dynamic(() => import("./MiniMap"), { ssr: false });

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
  slug: string;
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

type ThemeMode = "light" | "dark";

type ViewportBounds = [west: number, south: number, east: number, north: number];

type QueuedBarangayLoad = {
  file: string;
  attempt: number;
  promise: Promise<FeatureCollection | undefined>;
  resolve: (data: FeatureCollection | undefined) => void;
};

type LocationMatch = {
  barangay: BarangayIndexEntry | null;
  lot: LotFeature | null;
};

const DEFAULT_CENTER: [number, number] = [13.4477, 121.8472];
const DEFAULT_ZOOM = 13;
const SELECT_ZOOM = 20;
const LIGHT_STREETS_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE_TILE_URL = "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
const LOT_LABEL_MIN_ZOOM_DESKTOP = 18;
const LOT_LABEL_MIN_ZOOM_MOBILE = 18;
const LOT_LABEL_CLASS =
  "bg-white/80 backdrop-blur-[2px] border border-[#0051d5]/20 px-2 py-0.5 rounded text-[9px] md:text-xs text-[#0051d5] font-bold shadow-sm text-center lot-label-tooltip leading-none pointer-events-none";
const MAX_CACHED_BARANGAYS = 8;
const MAX_CONCURRENT_GEOMETRY_REQUESTS = 2;
const MAX_GEOMETRY_RETRIES = 2;
const GEOMETRY_RETRY_BASE_DELAY_MS = 500;
const DETAIL_MIN_ZOOM = 15;
const VIEWPORT_LOAD_PADDING = 0.12;
const INITIAL_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;
const LOCATION_PERMISSION_DESCRIPTION =
  "Click the tune icon beside the address bar, set Location to Allow, then refresh GeoLGU.";

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

function getCurrentTheme(): ThemeMode {
  const selectedTheme = document.documentElement.dataset.theme;
  if (selectedTheme === "dark" || selectedTheme === "light") {
    return selectedTheme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function boundsIntersect(left: ViewportBounds, right: ViewportBounds): boolean {
  return left[0] <= right[2] && left[2] >= right[0] && left[1] <= right[3] && left[3] >= right[1];
}

function boundaryFallback(entries: BarangayIndexEntry[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: entries.map((entry) => {
      const [west, south, east, north] = entry.bbox;
      return {
        type: "Feature",
        properties: { name: entry.name, file: entry.file, derived: "bbox-fallback" },
        geometry: {
          type: "Polygon",
          coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
        },
      };
    }),
  };
}

function MapEventBridge({
  onViewportChange,
  onPointerMove,
  onMapClick,
}: {
  onViewportChange: (map: L.Map) => void;
  onPointerMove: (latitude: number, longitude: number) => void;
  onMapClick: () => void;
}) {
  const map = useMapEvents({
    zoomend: () => onViewportChange(map),
    moveend: () => onViewportChange(map),
    mousemove: (event) => onPointerMove(event.latlng.lat, event.latlng.lng),
    click: onMapClick,
  });

  useEffect(() => {
    onViewportChange(map);
  }, [map, onViewportChange]);

  return null;
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
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
  const [viewportCenter, setViewportCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [basemap, setBasemap] = useState<"streets" | "satellite">("satellite");
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [barangayBoundaries, setBarangayBoundaries] = useState<FeatureCollection | null>(null);
  const [activeLandClasses, setActiveLandClasses] = useState<Set<string>>(
    new Set([...Object.keys(LAND_CLASS_COLORS), "unknown"])
  );
  const [initialView] = useState(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem("geolgu-viewport") ?? "null") as
        | { center: [number, number]; zoom: number }
        | null;
      if (value && Array.isArray(value.center) && value.center.length === 2 && Number.isFinite(value.zoom)) return value;
    } catch {
      window.localStorage.removeItem("geolgu-viewport");
    }
    return { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM };
  });

  const mapRef = useRef<L.Map | null>(null);
  const activeFilesRef = useRef<Set<string>>(new Set());
  const barangayByFileRef = useRef<Map<string, BarangayIndexEntry>>(new Map());
  const geojsonCacheRef = useRef<Map<string, FeatureCollection>>(new Map());
  const desiredDetailFilesRef = useRef<Set<string>>(new Set());
  const queuedLoadsRef = useRef<QueuedBarangayLoad[]>([]);
  const pendingLoadsRef = useRef<Map<string, QueuedBarangayLoad>>(new Map());
  const inFlightLoadsRef = useRef<Map<string, AbortController>>(new Map());
  const activeRequestCountRef = useRef(0);
  const pumpLoadQueueRef = useRef<() => void>(() => undefined);
  const queueBarangayLoadRef = useRef<(file: string, priority?: boolean) => Promise<FeatureCollection | undefined>>(
    async () => undefined,
  );
  const retryTimersRef = useRef<Map<string, number>>(new Map());
  const layerByIdRef = useRef<Map<string, L.Path>>(new Map());
  const selectedIdRef = useRef<string | null>(null);
  const suppressMapClickRef = useRef(false);
  const lastCoordUpdateRef = useRef(0);
  const hasInitialLocateRef = useRef(false);
  const hasLoadedPreferencesRef = useRef(false);
  const autoLoadBarangayRef = useRef(autoLoadBarangay);
  const focusSequenceRef = useRef(0);

  const selectedId = getFeatureId(selectedFeature ?? undefined);
  const lotLabelMinZoom = isMobileViewport ? LOT_LABEL_MIN_ZOOM_MOBILE : LOT_LABEL_MIN_ZOOM_DESKTOP;

  const visibleDetailFiles = useMemo(() => {
    if (currentZoom < DETAIL_MIN_ZOOM || !viewportBounds) return [];

    return barangayIndex
      .filter((entry) => activeFiles.has(entry.file) && boundsIntersect(entry.bbox, viewportBounds))
      .sort((left, right) => {
        const leftCenter: [number, number] = [
          (left.bbox[1] + left.bbox[3]) / 2,
          (left.bbox[0] + left.bbox[2]) / 2,
        ];
        const rightCenter: [number, number] = [
          (right.bbox[1] + right.bbox[3]) / 2,
          (right.bbox[0] + right.bbox[2]) / 2,
        ];
        const leftDistance = Math.hypot(leftCenter[0] - viewportCenter[0], leftCenter[1] - viewportCenter[1]);
        const rightDistance = Math.hypot(rightCenter[0] - viewportCenter[0], rightCenter[1] - viewportCenter[1]);
        return leftDistance - rightDistance;
      })
      .slice(0, MAX_CACHED_BARANGAYS)
      .map((entry) => entry.file);
  }, [activeFiles, barangayIndex, currentZoom, viewportBounds, viewportCenter]);

  const visibleDetailFilesKey = visibleDetailFiles.join("|");

  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      setSettingsOpen(open);
      if (open && isMobileViewport && selectedFeature) {
        setSelectedFeature(null);
      }
    },
    [isMobileViewport, selectedFeature, setSelectedFeature]
  );

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

  useEffect(() => {
    const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => setTheme(getCurrentTheme());
    const observer = new MutationObserver(syncTheme);

    syncTheme();
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    themeMediaQuery.addEventListener("change", syncTheme);

    return () => {
      observer.disconnect();
      themeMediaQuery.removeEventListener("change", syncTheme);
    };
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
    performance.mark("geolgu-barangay-index-start");
    fetch("/api/map/barangays")
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load barangays");
        return response.json() as Promise<{ barangays: BarangayIndexEntry[] }>;
      })
      .then(({ barangays: data }) => {
        // Filter out Poblacion as requested by the user
        const filteredData = data.filter(b => !b.name.toLowerCase().includes('poblacion'));
        barangayByFileRef.current = new Map(filteredData.map((entry) => [entry.file, entry]));
        setBarangayIndex(filteredData);
        performance.mark("geolgu-barangay-index-ready");
        performance.measure("geolgu-barangay-index", "geolgu-barangay-index-start", "geolgu-barangay-index-ready");
      })
      .catch(() => {
        toast({ title: "Failed to load barangay index" });
    });
  }, [toast]);

  useEffect(() => {
    if (!barangayIndex.length) return;
    const controller = new AbortController();
    fetch("/geojson/barangay_boundaries.geojson", { cache: "no-cache", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Boundary asset unavailable");
        return response.json() as Promise<FeatureCollection>;
      })
      .then(setBarangayBoundaries)
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          setBarangayBoundaries(boundaryFallback(barangayIndex));
        }
      });
    return () => controller.abort();
  }, [barangayIndex]);

  useEffect(() => {
    activeFilesRef.current = activeFiles;
    if (!hasLoadedPreferencesRef.current) return;
    window.localStorage.setItem("geolgu-active-files", JSON.stringify(Array.from(activeFiles)));
  }, [activeFiles]);

  useEffect(() => {
    autoLoadBarangayRef.current = autoLoadBarangay;
  }, [autoLoadBarangay]);

  useEffect(() => {
    const storedBasemap = window.localStorage.getItem("geolgu-basemap");
    if (storedBasemap === "streets" || storedBasemap === "satellite") setBasemap(storedBasemap);
    try {
      const storedFiles = JSON.parse(window.localStorage.getItem("geolgu-active-files") ?? "[]") as string[];
      if (Array.isArray(storedFiles)) setActiveFiles(new Set(storedFiles.filter((file) => typeof file === "string")));
    } catch {
      window.localStorage.removeItem("geolgu-active-files");
    }
    hasLoadedPreferencesRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasLoadedPreferencesRef.current) return;
    window.localStorage.setItem("geolgu-basemap", basemap);
  }, [basemap]);

  useEffect(() => {
    syncSelectedStyles();
    requestAnimationFrame(updateLotLabelVisibility);
  }, [syncSelectedStyles, updateLotLabelVisibility]);

  const commitBarangayToCache = useCallback((file: string, data: FeatureCollection) => {
    const cache = geojsonCacheRef.current;
    cache.delete(file);
    cache.set(file, data);

    const evictedFiles: string[] = [];
    while (cache.size > MAX_CACHED_BARANGAYS) {
      const oldest = cache.keys().next().value as string | undefined;
      if (!oldest) break;
      cache.delete(oldest);
      evictedFiles.push(oldest);
    }

    setGeojsonByFile((current) => {
      const next = { ...current, [file]: data };
      evictedFiles.forEach((evicted) => delete next[evicted]);
      return next;
    });
  }, []);

  const pumpLoadQueue = useCallback(() => {
    while (
      activeRequestCountRef.current < MAX_CONCURRENT_GEOMETRY_REQUESTS &&
      queuedLoadsRef.current.length > 0
    ) {
      const queued = queuedLoadsRef.current.shift();
      if (!queued) break;

      const cached = geojsonCacheRef.current.get(queued.file);
      if (cached) {
        geojsonCacheRef.current.delete(queued.file);
        geojsonCacheRef.current.set(queued.file, cached);
        pendingLoadsRef.current.delete(queued.file);
        queued.resolve(cached);
        continue;
      }

      if (!desiredDetailFilesRef.current.has(queued.file)) {
        pendingLoadsRef.current.delete(queued.file);
        queued.resolve(undefined);
        continue;
      }

      const entry = barangayByFileRef.current.get(queued.file);
      if (!entry) {
        pendingLoadsRef.current.delete(queued.file);
        queued.resolve(undefined);
        continue;
      }

      const controller = new AbortController();
      const metricName = `geolgu-layer-${queued.file}`;
      inFlightLoadsRef.current.set(queued.file, controller);
      activeRequestCountRef.current += 1;
      setLoadingFiles((current) => new Set(current).add(queued.file));
      performance.mark(`${metricName}-start`);

      void (async () => {
        let loaded: FeatureCollection | undefined;
        let retryAfterFailure = false;
        try {
          const response = await fetch(`/api/map/barangays/${encodeURIComponent(entry.slug)}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Failed to load GeoJSON (${response.status})`);
          const data = (await response.json()) as FeatureCollection;
          if (controller.signal.aborted || !desiredDetailFilesRef.current.has(queued.file)) return;

          data.features.forEach((feature, index) => {
            if (!feature.properties) feature.properties = {};
            if (!feature.properties.__uid) feature.properties.__uid = `${queued.file}-${index}`;
          });
          commitBarangayToCache(queued.file, data);
          loaded = data;
          performance.mark(`${metricName}-ready`);
          performance.measure(metricName, `${metricName}-start`, `${metricName}-ready`);
        } catch (error) {
          if ((error as Error).name !== "AbortError") {
            console.error(`Failed to load ${queued.file}:`, error);
            retryAfterFailure =
              desiredDetailFilesRef.current.has(queued.file) && queued.attempt < MAX_GEOMETRY_RETRIES;
            if (!retryAfterFailure) {
              toast({ title: "Failed to load barangay data", description: entry.name });
            }
          }
        } finally {
          inFlightLoadsRef.current.delete(queued.file);
          activeRequestCountRef.current = Math.max(0, activeRequestCountRef.current - 1);
          setLoadingFiles((current) => {
            const next = new Set(current);
            next.delete(queued.file);
            return next;
          });

          if (retryAfterFailure) {
            const retryLoad: QueuedBarangayLoad = { ...queued, attempt: queued.attempt + 1 };
            pendingLoadsRef.current.set(queued.file, retryLoad);
            const delay = GEOMETRY_RETRY_BASE_DELAY_MS * 2 ** queued.attempt;
            const timerId = window.setTimeout(() => {
              retryTimersRef.current.delete(queued.file);
              if (!desiredDetailFilesRef.current.has(queued.file)) {
                if (pendingLoadsRef.current.get(queued.file) === retryLoad) {
                  pendingLoadsRef.current.delete(queued.file);
                }
                retryLoad.resolve(undefined);
                return;
              }
              queuedLoadsRef.current.push(retryLoad);
              pumpLoadQueueRef.current();
            }, delay);
            retryTimersRef.current.set(queued.file, timerId);
          } else {
            if (pendingLoadsRef.current.get(queued.file) === queued) {
              pendingLoadsRef.current.delete(queued.file);
            }
            queued.resolve(loaded);
          }
          pumpLoadQueueRef.current();
        }
      })();
    }
  }, [commitBarangayToCache, toast]);

  useEffect(() => {
    pumpLoadQueueRef.current = pumpLoadQueue;
  }, [pumpLoadQueue]);

  const queueBarangayLoad = useCallback((file: string, priority = false) => {
    const cached = geojsonCacheRef.current.get(file);
    if (cached) {
      geojsonCacheRef.current.delete(file);
      geojsonCacheRef.current.set(file, cached);
      return Promise.resolve(cached);
    }

    const pending = pendingLoadsRef.current.get(file);
    if (pending) {
      const activeController = inFlightLoadsRef.current.get(file);
      if (activeController?.signal.aborted) {
        return pending.promise.then(() => {
          if (!desiredDetailFilesRef.current.has(file)) return undefined;
          return queueBarangayLoadRef.current(file, priority);
        });
      }
      const retryTimer = retryTimersRef.current.get(file);
      if (priority && retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimersRef.current.delete(file);
        queuedLoadsRef.current.unshift(pending);
        pumpLoadQueueRef.current();
      }
      return pending.promise;
    }

    const retryTimer = retryTimersRef.current.get(file);
    if (retryTimer !== undefined) {
      window.clearTimeout(retryTimer);
      retryTimersRef.current.delete(file);
    }
    let resolveLoad!: (data: FeatureCollection | undefined) => void;
    const promise = new Promise<FeatureCollection | undefined>((resolve) => {
      resolveLoad = resolve;
    });
    const queued: QueuedBarangayLoad = { file, attempt: 0, promise, resolve: resolveLoad };
    pendingLoadsRef.current.set(file, queued);
    if (priority) queuedLoadsRef.current.unshift(queued);
    else queuedLoadsRef.current.push(queued);
    pumpLoadQueueRef.current();
    return promise;
  }, []);

  useEffect(() => {
    queueBarangayLoadRef.current = queueBarangayLoad;
  }, [queueBarangayLoad]);

  useEffect(() => {
    const desired = new Set(visibleDetailFiles);
    desiredDetailFilesRef.current = desired;

    const retainedQueue = queuedLoadsRef.current.filter((queued) => {
      if (desired.has(queued.file)) return true;
      pendingLoadsRef.current.delete(queued.file);
      queued.resolve(undefined);
      return false;
    });
    queuedLoadsRef.current.splice(0, queuedLoadsRef.current.length, ...retainedQueue);
    inFlightLoadsRef.current.forEach((controller, file) => {
      if (!desired.has(file)) controller.abort();
    });
    retryTimersRef.current.forEach((timerId, file) => {
      if (desired.has(file)) return;
      window.clearTimeout(timerId);
      retryTimersRef.current.delete(file);
      const pending = pendingLoadsRef.current.get(file);
      if (pending && !inFlightLoadsRef.current.has(file)) {
        pendingLoadsRef.current.delete(file);
        pending.resolve(undefined);
      }
    });

    visibleDetailFiles.forEach((file) => {
      const cached = geojsonCacheRef.current.get(file);
      if (cached) {
        geojsonCacheRef.current.delete(file);
        geojsonCacheRef.current.set(file, cached);
      } else {
        void queueBarangayLoad(file);
      }
    });
    pumpLoadQueueRef.current();
  }, [queueBarangayLoad, visibleDetailFiles, visibleDetailFilesKey]);

  useEffect(() => {
    const inFlightLoads = inFlightLoadsRef.current;
    const queuedLoads = queuedLoadsRef.current;
    const pendingLoads = pendingLoadsRef.current;
    const retryTimers = retryTimersRef.current;
    return () => {
      inFlightLoads.forEach((controller) => controller.abort());
      retryTimers.forEach((timerId) => window.clearTimeout(timerId));
      retryTimers.clear();
      queuedLoads.forEach((queued) => queued.resolve(undefined));
      queuedLoads.length = 0;
      pendingLoads.forEach((pending) => pending.resolve(undefined));
      pendingLoads.clear();
    };
  }, []);

  const fetchLocationMatch = useCallback(
    async (latitude: number, longitude: number) => {
      try {
        const response = await fetch(`/api/map/locate?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`);
        if (!response.ok) return null;
        return (await response.json()) as LocationMatch;
      } catch (error) {
        console.warn("Location lookup failed:", error);
        return null;
      }
    },
    []
  );

  const turnOnLocationBarangay = useCallback(
    async (latitude: number, longitude: number, messagePrefix = "Loaded") => {
      const match = await fetchLocationMatch(latitude, longitude);
      const barangayToLoad = match?.barangay;
      if (!barangayToLoad || !autoLoadBarangayRef.current) {
        return match;
      }

      setLocationBarangayFile(barangayToLoad.file);
      const wasActive = activeFilesRef.current.has(barangayToLoad.file);
      setActiveFiles((prev) => {
        if (prev.has(barangayToLoad.file)) return prev;
        return new Set(prev).add(barangayToLoad.file);
      });
      if (!wasActive) {
        toast({ title: `${messagePrefix} ${barangayToLoad.name} based on location` });
      }
      return match;
    },
    [fetchLocationMatch, toast]
  );

  const handleLocationBarangayToggle = useCallback(
    (enabled: boolean) => {
      autoLoadBarangayRef.current = enabled;
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

  const showGeolocationError = useCallback(
    (error: GeolocationPositionError, automatic = false) => {
      if (error.code === error.PERMISSION_DENIED) {
        toast({
          title: automatic ? "Auto-location is blocked" : "Location permission is blocked",
          description: LOCATION_PERMISSION_DESCRIPTION,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: automatic ? "Auto-location unavailable" : "Geolocation error",
        description: error.message,
        variant: "destructive",
      });
    },
    [toast],
  );

  useEffect(() => {
    if (!("geolocation" in navigator) || hasInitialLocateRef.current) return;
    hasInitialLocateRef.current = true;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const { latitude, longitude } = position.coords;
        setUserLocation({ lat: latitude, lng: longitude });
        mapRef.current?.flyTo([latitude, longitude], SELECT_ZOOM, { animate: true, duration: 1.2 });
        if (autoLoadBarangayRef.current) {
          window.setTimeout(() => {
            if (autoLoadBarangayRef.current) {
              void turnOnLocationBarangay(latitude, longitude, "Auto-loaded");
            }
          }, 1250);
        }
      },
      (error) => {
        setIsLocating(false);
        console.info("Initial cached geolocation unavailable:", error.message);
        showGeolocationError(error, true);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: INITIAL_LOCATION_MAX_AGE_MS },
    );
  }, [showGeolocationError, turnOnLocationBarangay]);

  useEffect(() => {
    requestAnimationFrame(updateLotLabelVisibility);
  }, [showLotNumbers, activeFiles, geojsonByFile, updateLotLabelVisibility]);

  const focusBarangay = useCallback((file: string) => {
    const map = mapRef.current;
    const entry = barangayByFileRef.current.get(file);
    if (!map || !entry) return Promise.resolve(false);
    const [west, south, east, north] = entry.bbox;
    const bounds = L.latLngBounds([south, west], [north, east]);
    const fitZoom = map.getBoundsZoom(bounds, false, L.point(100, 100));
    const targetZoom = Math.max(DETAIL_MIN_ZOOM, Math.min(18, fitZoom));
    const targetCenter = bounds.getCenter();
    const centerTolerance = Math.max(40, bounds.getNorthWest().distanceTo(bounds.getSouthEast()) * 0.08);
    const requestId = ++focusSequenceRef.current;
    map.stop();

    const isTargetReached = () =>
      map.getZoom() >= DETAIL_MIN_ZOOM &&
      map.getBounds().intersects(bounds) &&
      map.getCenter().distanceTo(targetCenter) <= centerTolerance;

    if (isTargetReached()) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timeoutId = 0;
      const finish = (reached: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        map.off("moveend", handleMoveEnd);
        resolve(reached && requestId === focusSequenceRef.current);
      };
      const handleMoveEnd = () => {
        if (requestId !== focusSequenceRef.current) {
          finish(false);
        } else if (isTargetReached()) {
          finish(true);
        }
      };
      timeoutId = window.setTimeout(() => finish(isTargetReached()), 2600);
      map.on("moveend", handleMoveEnd);
      map.flyTo(bounds.getCenter(), targetZoom, { animate: true, duration: 1.2 });
    });
  }, []);

  const waitForDetailDemand = useCallback((file: string) => {
    const startedAt = performance.now();
    return new Promise<boolean>((resolve) => {
      const check = () => {
        if (!activeFilesRef.current.has(file)) {
          resolve(false);
          return;
        }
        if (desiredDetailFilesRef.current.has(file)) {
          resolve(true);
          return;
        }
        if (performance.now() - startedAt >= 1000) {
          resolve(false);
          return;
        }
        window.setTimeout(check, 25);
      };
      check();
    });
  }, []);

  const toggleFile = useCallback(
    (file: string) => {
      if (activeFiles.has(file)) {
        setActiveFiles((prev) => {
          const next = new Set(prev);
          next.delete(file);
          return next;
        });
        return;
      }
      setActiveFiles((prev) => new Set(prev).add(file));
      void focusBarangay(file);
    },
    [activeFiles, focusBarangay]
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
      const focused = await focusBarangay(record.file);
      if (!focused) return;
      if (!activeFilesRef.current.has(record.file)) return;
      if (!(await waitForDetailDemand(record.file))) return;
      const data = await queueBarangayLoad(record.file, true);
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
    [activeFiles, focusBarangay, queueBarangayLoad, selectFeature, toast, waitForDetailDemand]
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
          mapRef.current.flyTo([latitude, longitude], SELECT_ZOOM, { animate: true, duration: 1.2 });
        }

        setTimeout(async () => {
          const match = autoLoadBarangayRef.current
            ? await turnOnLocationBarangay(latitude, longitude)
            : await fetchLocationMatch(latitude, longitude);
          if (match?.lot) {
            selectFeature(match.lot, false);
          } else {
            toast({ title: "No cadastral lot found exactly at your coordinate, but showing location map." });
          }
        }, 1250);
      },
      (error) => {
        setIsLocating(false);
        showGeolocationError(error);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }, [fetchLocationMatch, selectFeature, showGeolocationError, turnOnLocationBarangay]);

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn();
  }, []);

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut();
  }, []);

  const GeoLayers = useMemo(() => {
    return visibleDetailFiles.map((file) => {
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
  }, [geojsonByFile, getDefaultStyle, selectFeature, selectedId, showLotNumbers, visibleDetailFiles]);

  const BoundaryLayer = useMemo(() => {
    if (!barangayBoundaries || activeFiles.size === 0) return null;
    const boundaryFiles =
      currentZoom < DETAIL_MIN_ZOOM
        ? activeFiles
        : new Set(visibleDetailFiles.filter((file) => !geojsonByFile[file]));
    if (boundaryFiles.size === 0) return null;
    const boundaryFilesKey = Array.from(boundaryFiles).sort().join("|");
    const data: FeatureCollection = {
      ...barangayBoundaries,
      features: barangayBoundaries.features.filter((feature) => {
        const file = feature.properties?.file;
        return typeof file === "string" && boundaryFiles.has(file);
      }),
    };
    if (!data.features.length) return null;
    return (
      <GeoJSON
        key={`barangay-boundaries-${theme}-${boundaryFilesKey}`}
        data={data}
        interactive={false}
        style={{
          color: theme === "dark" ? "#93c5fd" : "#0051d5",
          fillColor: theme === "dark" ? "#1d4ed8" : "#60a5fa",
          fillOpacity: theme === "dark" ? 0.12 : 0.1,
          opacity: 0.9,
          weight: 2,
          dashArray: "6 5",
        }}
      />
    );
  }, [activeFiles, barangayBoundaries, currentZoom, geojsonByFile, theme, visibleDetailFiles]);

  const handleViewportChange = useCallback(
    (map: L.Map) => {
      const zoom = map.getZoom();
      const center = map.getCenter();
      const padded = map.getBounds().pad(VIEWPORT_LOAD_PADDING);
      setCurrentZoom(zoom);
      setViewportCenter([center.lat, center.lng]);
      setViewportBounds([padded.getWest(), padded.getSouth(), padded.getEast(), padded.getNorth()]);
      window.localStorage.setItem(
        "geolgu-viewport",
        JSON.stringify({ center: [center.lat, center.lng], zoom }),
      );
      requestAnimationFrame(updateLotLabelVisibility);
    },
    [updateLotLabelVisibility],
  );

  const handlePointerMove = useCallback((latitude: number, longitude: number) => {
    const now = performance.now();
    if (now - lastCoordUpdateRef.current < 120) return;
    lastCoordUpdateRef.current = now;
    setCoords({ lat: latitude, lng: longitude });
  }, []);

  const handleMapClick = useCallback(() => {
    if (suppressMapClickRef.current) {
      suppressMapClickRef.current = false;
      return;
    }
    setSelectedFeature(null);
  }, [setSelectedFeature]);

  return (
    <div className={`relative h-full w-full ${(currentZoom < lotLabelMinZoom || !showLotNumbers) ? "hide-lot-labels" : ""}`}>
      <MapContainer
        center={initialView.center}
        zoom={initialView.zoom}
        maxZoom={30}
        zoomControl={false}
        preferCanvas
        className="h-full w-full"
        ref={mapRef}
      >
        {basemap === "streets" ? (
          <TileLayer
            key={`streets-${theme}`}
            className="map-tiles"
            attribution="&copy; OpenStreetMap contributors"
            url={LIGHT_STREETS_TILE_URL}
            maxZoom={30}
            maxNativeZoom={19}
          />
        ) : (
          <TileLayer
            key={`satellite-${theme}`}
            className="map-tiles"
            attribution="&copy; Google"
            url={SATELLITE_TILE_URL}
            maxZoom={30}
            maxNativeZoom={20}
          />
        )}
        <MapEventBridge
          onViewportChange={handleViewportChange}
          onPointerMove={handlePointerMove}
          onMapClick={handleMapClick}
        />
        {BoundaryLayer}
        {GeoLayers}
        {userLocation ? (
          <Marker position={[userLocation.lat, userLocation.lng]} />
        ) : null}
        
        {/* Dynamic Mini-Map Overview */}
        <MiniMap basemap={basemap} theme={theme} />
      </MapContainer>

      <SearchBar onSelect={handleSearchSelect} activeFiles={activeFiles} canManageUsers={canManageUsers} />

      {loadingFiles.size > 0 ? (
        <div className="glass-panel absolute left-1/2 top-[4.5rem] z-[1000] flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-[var(--on-surface)] md:top-20" role="status">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0051d5]/25 border-t-[#0051d5]" />
          Loading map data…
        </div>
      ) : null}
      
      {/* Map controls */}
      <div
        className={`absolute right-3 top-[5.25rem] z-[1000] flex flex-col gap-2 md:top-24 ${
          selectedFeature ? "md:right-[21rem]" : "md:right-4"
        }`}
      >
        <div className="glass-panel flex flex-col overflow-hidden rounded-lg p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            className="map-control-button"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <div className="mx-1 h-px bg-[var(--outline-variant)]/60" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            className="map-control-button"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>

        <div className="glass-panel flex flex-col gap-1 rounded-lg p-1">
          <GPSButton onLocate={handleLocate} isLocating={isLocating} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setBasemap(basemap === "streets" ? "satellite" : "streets")}
            className="map-control-button"
            title={basemap === "streets" ? "Switch to satellite" : "Switch to streets"}
            aria-label={basemap === "streets" ? "Switch to satellite" : "Switch to streets"}
          >
            {basemap === "streets" ? <Satellite className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
          </Button>
        </div>

        <div className="glass-panel rounded-lg p-1">
          <SettingsPanel
            barangays={barangayIndex}
            activeFiles={activeFiles}
            toggleFile={toggleFile}
            showLotNumbers={showLotNumbers}
            setShowLotNumbers={setShowLotNumbers}
            autoLoadBarangay={autoLoadBarangay}
            setAutoLoadBarangay={handleLocationBarangayToggle}
            activeLandClasses={activeLandClasses}
            toggleLandClass={toggleLandClass}
            landClasses={[...Object.keys(LAND_CLASS_COLORS), "unknown"]}
            isOpen={settingsOpen}
            onOpenChange={handleSettingsOpenChange}
            detailsOpen={Boolean(selectedFeature)}
          />
        </div>
      </div>

      {/* Coordinates */}
      <div className="absolute bottom-3 left-1/2 z-[1000] w-auto max-w-[calc(100%-8rem)] -translate-x-1/2 rounded-md glass-panel px-2.5 py-1 md:bottom-4 md:max-w-[calc(100%-28rem)] md:px-3">
        <div className="coord-bar flex items-center justify-center gap-2.5 whitespace-nowrap text-[10px] text-[var(--on-surface)] md:gap-3 md:text-[11px]">
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
