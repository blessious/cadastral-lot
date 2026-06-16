"use client";

import "leaflet/dist/leaflet.css";

import { booleanPointInPolygon, point } from "@turf/turf";
import type { Feature, FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";

import GPSButton from "./GPSButton";
import SearchBar from "./SearchBar";
import SettingsPanel from "./SettingsPanel";
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
  file: string;
};

const DEFAULT_CENTER: [number, number] = [13.4477, 121.8472];
const DEFAULT_ZOOM = 13;
const SELECT_ZOOM = 17;

const LAND_CLASS_COLORS: Record<string, string> = {
  agricultural: "#86efac",
  residential: "#93c5fd",
  commercial: "#fcd34d",
  industrial: "#f9a8d4",
  timberland: "#6ee7b7",
};

const DEFAULT_STYLE: L.PathOptions = {
  color: "#555",
  weight: 0.8,
  fillOpacity: 0.05,
};

const HOVER_STYLE: L.PathOptions = {
  fillColor: "#facc15",
  fillOpacity: 0.4,
};

const SELECTED_STYLE: L.PathOptions = {
  fillColor: "#3b82f6",
  fillOpacity: 0.5,
  weight: 2,
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
  const id = feature?.properties?.CLN;
  if (!id) {
    return null;
  }
  return String(id);
}

export default function MapView({ selectedFeature, setSelectedFeature }: MapViewProps) {
  const { toast } = useToast();
  const [barangayIndex, setBarangayIndex] = useState<BarangayIndexEntry[]>([]);
  const [geojsonByFile, setGeojsonByFile] = useState<Record<string, FeatureCollection>>({});
  const [activeFiles, setActiveFiles] = useState<Set<string>>(new Set());
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [showLotNumbers, setShowLotNumbers] = useState(true);
  const [autoLoadBarangay, setAutoLoadBarangay] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);

  const mapRef = useRef<L.Map | null>(null);
  const loadedFilesRef = useRef<Set<string>>(new Set());
  const featuresRef = useRef<LotFeature[]>([]);
  const layerByIdRef = useRef<Map<string, L.Path>>(new Map());
  const selectedIdRef = useRef<string | null>(null);
  const suppressMapClickRef = useRef(false);
  const watchIdRef = useRef<number | null>(null);
  const hasInitialLocateRef = useRef(false);

  const selectedId = getFeatureId(selectedFeature ?? undefined);

  const getDefaultStyle = useCallback((feature?: LotFeature): L.PathOptions => {
    return {
      ...DEFAULT_STYLE,
      fillColor: getLandClassColor(feature),
    };
  }, []);

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
      .then((data: BarangayIndexEntry[]) => setBarangayIndex(data))
      .catch(() => {
        toast({ title: "Failed to load barangay index" });
      });
  }, [toast]);

  useEffect(() => {
    syncSelectedStyles();
  }, [syncSelectedStyles]);

  const ensureBarangayLoaded = useCallback(
    async (file: string) => {
      if (loadedFilesRef.current.has(file)) {
        return geojsonByFile[file];
      }
      loadedFilesRef.current.add(file);
      try {
        const response = await fetch(encodeURI(file));
        if (!response.ok) {
          throw new Error("Failed to load GeoJSON");
        }
        const data = (await response.json()) as FeatureCollection;
        setGeojsonByFile((prev) => ({
          ...prev,
          [file]: data,
        }));
        featuresRef.current = [...featuresRef.current, ...(data.features as LotFeature[])];
        return data;
      } catch {
        loadedFilesRef.current.delete(file);
        toast({ title: "Failed to load barangay data" });
        return undefined;
      }
    },
    [geojsonByFile, toast]
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
              mapRef.current.flyTo([latitude, longitude], SELECT_ZOOM, { animate: true, duration: 0.7 });
            }
            if (autoLoadBarangay) {
              const targetPoint = point([longitude, latitude]);
              const matchingCandidates = barangayIndex.filter((b) => {
                const [minLon, minLat, maxLon, maxLat] = b.bbox;
                return longitude >= minLon && longitude <= maxLon && latitude >= minLat && latitude <= maxLat;
              });
              let trueBarangay = null;
              for (const candidate of matchingCandidates) {
                const data = await ensureBarangayLoaded(candidate.file);
                if (!data) continue;
                const isInside = (data.features as LotFeature[]).some((feature) => {
                  if (!feature?.geometry) return false;
                  // @ts-expect-error valid
                  return booleanPointInPolygon(targetPoint, feature);
                });
                if (isInside) { trueBarangay = candidate; break; }
              }
              const barangayToLoad = trueBarangay || matchingCandidates[0];
              if (barangayToLoad && !activeFiles.has(barangayToLoad.file)) {
                setActiveFiles((prev) => new Set(prev).add(barangayToLoad.file));
                toast({ title: `Auto-loaded ${barangayToLoad.name} based on initial location` });
              }
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
  }, [autoLoadBarangay, barangayIndex, activeFiles, ensureBarangayLoaded, toast]);

  useEffect(() => {
    layerByIdRef.current.forEach((layer, featureId) => {
      if (showLotNumbers) {
        if (!layer.getTooltip()) {
          layer.bindTooltip(String(featureId), {
            permanent: true,
            direction: "center",
            className: "bg-transparent border-none text-[10px] md:text-xs text-black font-bold shadow-none text-center lot-label-tooltip leading-none"
          });
        }
      } else {
        layer.unbindTooltip();
      }
    });
  }, [showLotNumbers, activeFiles]);

  const toggleFile = useCallback(
    async (file: string) => {
      setActiveFiles((prev) => {
        const next = new Set(prev);
        if (next.has(file)) {
          next.delete(file);
        } else {
          next.add(file);
          void ensureBarangayLoaded(file);
        }
        return next;
      });
    },
    [ensureBarangayLoaded]
  );

  const selectFeature = useCallback(
    (feature: LotFeature, flyToFeature = true) => {
      setSelectedFeature(feature);
      if (flyToFeature && mapRef.current) {
        const bounds = L.geoJSON(feature).getBounds();
        const center = bounds.getCenter();
        mapRef.current.flyTo(center, SELECT_ZOOM, { duration: 0.7 });
      }
    },
    [setSelectedFeature]
  );

  const handleSearchSelect = useCallback(
    async (record: SearchRecord) => {
      const data = await ensureBarangayLoaded(record.file);
      if (!data) {
        return;
      }
      setActiveFiles((prev) => new Set(prev).add(record.file));
      const matchId = record.CLN ?? "";
      const matchPin = record.PIN ?? "";
      const matchAln = record.ALN ?? "";
      const matched = (data.features as LotFeature[]).find((feature) => {
        const props = feature.properties as GeoJsonProperties;
        const cln = props?.CLN ? String(props.CLN) : "";
        const pin = props?.PIN ? String(props.PIN) : "";
        const aln = props?.ALN ? String(props.ALN) : "";
        return (matchId && cln === matchId) || (matchPin && pin === matchPin) || (matchAln && aln === matchAln);
      });
      if (matched) {
        selectFeature(matched, true);
      } else {
        toast({ title: "Lot not found in loaded data" });
      }
    },
    [ensureBarangayLoaded, selectFeature, toast]
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
            mapRef.current.flyTo([latitude, longitude], SELECT_ZOOM, { animate: true, duration: 0.7 });
        }

        const targetPoint = point([longitude, latitude]);

        if (autoLoadBarangay) {
          const matchingCandidates = barangayIndex.filter((b) => {
            const [minLon, minLat, maxLon, maxLat] = b.bbox;
            return longitude >= minLon && longitude <= maxLon && latitude >= minLat && latitude <= maxLat;
          });
          
          let trueBarangay = null;
          for (const candidate of matchingCandidates) {
            const data = await ensureBarangayLoaded(candidate.file);
            if (!data) continue;
            
            const isInside = (data.features as LotFeature[]).some((feature) => {
              if (!feature?.geometry) return false;
              // @ts-expect-error valid format
              return booleanPointInPolygon(targetPoint, feature);
            });

            if (isInside) {
              trueBarangay = candidate;
              break;
            }
          }

          const barangayToLoad = trueBarangay || matchingCandidates[0];
          if (barangayToLoad && !activeFiles.has(barangayToLoad.file)) {
            setActiveFiles((prev) => new Set(prev).add(barangayToLoad.file));
            toast({ title: `Loaded ${barangayToLoad.name} based on location` });
          }
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
      },
      (error) => {
        setIsLocating(false);
        toast({ title: "Geolocation error: " + error.message });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
    }, [selectFeature, toast, autoLoadBarangay, barangayIndex, activeFiles, ensureBarangayLoaded]);

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
          if (featureId) {
            layerByIdRef.current.set(featureId, layer as L.Path);
            if (showLotNumbers) {
              layer.bindTooltip(String(featureId), {
                permanent: true,
                direction: "center",
                className: "bg-transparent border-none text-[10px] md:text-xs text-black font-bold shadow-none text-center lot-label-tooltip leading-none"
              });
            }
          }
          layer.on({
            mouseover: () => {
              (layer as L.Path).setStyle(HOVER_STYLE);
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
    <div className={`relative h-full w-full ${(currentZoom < SELECT_ZOOM || !showLotNumbers) ? "hide-lot-labels" : ""}`}>
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        maxZoom={24}
        className="h-full w-full"
        ref={mapRef}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={24}
          maxNativeZoom={19}
        />
        <MapEvents />
        {GeoLayers}
        {userLocation ? (
          <Marker position={[userLocation.lat, userLocation.lng]} />
        ) : null}
      </MapContainer>

      <SearchBar onSelect={handleSearchSelect} />
        <SettingsPanel
          barangays={barangayIndex}
          activeFiles={activeFiles}
          toggleFile={toggleFile}
          showLotNumbers={showLotNumbers}
          setShowLotNumbers={setShowLotNumbers}
          autoLoadBarangay={autoLoadBarangay}
          setAutoLoadBarangay={setAutoLoadBarangay}
        />
        <GPSButton onLocate={handleLocate} isLocating={isLocating} />
      </div>
  );
}
