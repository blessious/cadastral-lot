"use client";

import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import dynamic from "next/dynamic";
import { useState } from "react";

import LotInfoPanel from "./components/LotInfoPanel";
import { Toaster } from "@/components/ui/toaster";

type LotFeature = Feature<Geometry, GeoJsonProperties>;

const MapView = dynamic(() => import("./components/MapView"), { ssr: false });

export default function Home() {
  const [selectedFeature, setSelectedFeature] = useState<LotFeature | null>(null);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <MapView selectedFeature={selectedFeature} setSelectedFeature={setSelectedFeature} />
      <LotInfoPanel selectedFeature={selectedFeature} onClose={() => setSelectedFeature(null)} />
      <Toaster />
    </div>
  );
}
