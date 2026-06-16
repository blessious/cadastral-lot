"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

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

type SearchBarProps = {
  onSelect: (record: SearchRecord) => void;
};

const MAX_RESULTS = 8;

export default function SearchBar({ onSelect }: SearchBarProps) {
  const [searchIndex, setSearchIndex] = useState<SearchRecord[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/geojson/search_index.json")
      .then((response) => response.json())
      .then((data: SearchRecord[]) => setSearchIndex(data))
      .catch(() => setSearchIndex([]));
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) {
        setResults([]);
        setOpen(false);
        return;
      }
      const filtered = searchIndex.filter((item) => {
        const cln = item.CLN?.toLowerCase() ?? "";
        const aln = item.ALN?.toLowerCase() ?? "";
        const pin = item.PIN?.toLowerCase() ?? "";
        const barangay = item.Barangay?.toLowerCase() ?? "";
        return (
          cln.includes(trimmed) ||
          aln.includes(trimmed) ||
          pin.includes(trimmed) ||
          barangay.includes(trimmed)
        );
      });
      setResults(filtered.slice(0, MAX_RESULTS));
      setOpen(true);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, searchIndex]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const hasResults = results.length > 0;

  const renderResults = useMemo(() => {
    if (!open || !hasResults) {
      return null;
    }
    return (
      <div className="absolute z-30 mt-2 w-full rounded-xl border bg-white/95 shadow-lg backdrop-blur">
        <ul className="max-h-80 overflow-y-auto py-2 text-sm">
          {results.map((item, index) => {
            const landClass = item.Land_Class ?? item.LAND_CLASS;
            return (
              <li key={`${item.CLN ?? "lot"}-${index}`}>
                <button
                  className="flex w-full flex-col gap-1 px-4 py-2 text-left hover:bg-slate-100"
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className="font-medium text-slate-900">
                    {item.CLN ?? "Unknown lot"} • {item.Barangay ?? ""}
                  </span>
                  {landClass ? (
                    <span className="text-xs text-slate-500">{landClass}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }, [hasResults, onSelect, open, results]);

  return (
    <div ref={wrapperRef} className="absolute left-1/2 top-4 z-[1000] w-[90%] max-w-[400px] -translate-x-1/2">
      <input
        className={cn(
          "w-full rounded-full border bg-white/95 px-4 py-3 text-sm shadow-md",
          "focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
        )}
        placeholder="Search by lot no., PIN, or barangay..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {renderResults}
    </div>
  );
}
