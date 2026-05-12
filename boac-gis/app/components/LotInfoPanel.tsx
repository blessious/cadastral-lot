"use client";

import type { Feature, GeoJsonProperties, Geometry } from "geojson";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

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
  const barangay = getPropertyValue(selectedFeature, "Barangay") ?? "Lot details";
  const landClass =
    getPropertyValue(selectedFeature, "Land_Class") ?? getPropertyValue(selectedFeature, "LAND_CLASS");

  const owner = 
    getPropertyValue(selectedFeature, "Owner") ?? 
    getPropertyValue(selectedFeature, "OWNER") ?? 
    getPropertyValue(selectedFeature, "Claimant") ??
    getPropertyValue(selectedFeature, "CLAIMANT");

  const fields: Field[] = [
    { label: "Owner", value: owner },
    { label: "Cadastral Lot No.", value: getPropertyValue(selectedFeature, "CLN") },
    { label: "Approved Lot No.", value: getPropertyValue(selectedFeature, "ALN") },
    { label: "Property ID No.", value: getPropertyValue(selectedFeature, "PIN") },
    { label: "Barangay", value: getPropertyValue(selectedFeature, "Barangay") },
    { label: "Section", value: getPropertyValue(selectedFeature, "Section") },
    { label: "Land Classification", value: landClass },
    { label: "Area", value: getPropertyValue(selectedFeature, "Area") },
    { label: "Remarks", value: getPropertyValue(selectedFeature, "Remarks") },
  ].filter((field) => field.value);

  const isOpen = Boolean(selectedFeature);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-[1000] h-[50vh] rounded-t-2xl border-t bg-white/95 shadow-2xl backdrop-blur transition duration-300 md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:w-80 md:rounded-none md:border-l md:border-t-0 ${
        isOpen
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0 md:translate-y-0 md:translate-x-full"
      }`}
    >
      <div className="relative flex h-full flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Barangay</p>
            <h2 className="text-lg font-semibold text-slate-900">{barangay}</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {fields.length ? (
          <div className="space-y-3">
            {fields.map((field) => (
              <div key={field.label} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-500">{field.label}</p>
                <p className="text-sm font-medium text-slate-900">{field.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Select a lot to view details.</p>
        )}
      </div>
    </div>
  );
}
