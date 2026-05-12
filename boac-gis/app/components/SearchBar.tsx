"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type SearchRecord = {
  CLN?: string;
  ALN?: string;
  PIN?: string;
  Barangay?: string;
  Owner?: string;
  Section?: string;
  Land_Class?: string;
  LAND_CLASS?: string;
  Area?: string;
  file: string;
  __uid?: string;
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
    fetch(`/geojson/search_index.json?v=${Date.now()}`)
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
        const owner = item.Owner?.toLowerCase() ?? "";
        return (
          cln.includes(trimmed) ||
          aln.includes(trimmed) ||
          pin.includes(trimmed) ||
          barangay.includes(trimmed) ||
          owner.includes(trimmed)
        );
      });

      filtered.sort((a, b) => {
        const aCln = a.CLN?.toLowerCase() ?? "";
        const bCln = b.CLN?.toLowerCase() ?? "";
        const aAln = a.ALN?.toLowerCase() ?? "";
        const bAln = b.ALN?.toLowerCase() ?? "";
        const aPin = a.PIN?.toLowerCase() ?? "";
        const bPin = b.PIN?.toLowerCase() ?? "";
        const aOwner = a.Owner?.toLowerCase() ?? "";
        const bOwner = b.Owner?.toLowerCase() ?? "";

        const aExactId = (aCln === trimmed || aAln === trimmed || aPin === trimmed) ? 2 : 
                         ((aCln.startsWith(trimmed) || aAln.startsWith(trimmed) || aPin.startsWith(trimmed)) ? 1 : 0);
        const bExactId = (bCln === trimmed || bAln === trimmed || bPin === trimmed) ? 2 : 
                         ((bCln.startsWith(trimmed) || bAln.startsWith(trimmed) || bPin.startsWith(trimmed)) ? 1 : 0);
        
        if (aExactId !== bExactId) {
          return bExactId - aExactId;
        }

        const aExactOwner = aOwner === trimmed ? 2 : (aOwner.startsWith(trimmed) ? 1 : 0);
        const bExactOwner = bOwner === trimmed ? 2 : (bOwner.startsWith(trimmed) ? 1 : 0);
        
        if (aExactOwner !== bExactOwner) {
          return bExactOwner - aExactOwner;
        }

        return 0;
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
      <div className="absolute z-30 mt-2 w-full rounded-xl border border-white/20 bg-white/70 shadow-lg backdrop-blur-md dark:bg-slate-900/70">
        <ul className="max-h-80 overflow-y-auto py-2 text-sm">
          {results.map((item, index) => {
            const landClass = item.Land_Class ?? item.LAND_CLASS;
            return (
              <li key={`${item.CLN ?? "lot"}-${index}`}>
                <button
                  className="flex w-full flex-col gap-1 px-4 py-2 text-left transition-colors hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className="font-medium text-slate-900">
                    {item.CLN ?? "Unknown lot"} • {item.Barangay ?? ""}
                  </span>
                  {item.Owner ? (
                    <span className="text-xs font-semibold text-slate-600">Owner: {item.Owner}</span>
                  ) : null}
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
          "w-full rounded-full border border-white/20 bg-white/70 px-4 py-3 text-sm shadow-md backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-lg dark:bg-slate-900/70 dark:text-slate-100",
          "focus:border-slate-400 focus:bg-white/90 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:bg-slate-900/90"
        )}
        placeholder="Search by lot no., PIN, owner, or barangay..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (query.trim().length > 0) {
            setOpen(true);
          }
        }}
      />
      {renderResults}
    </div>
  );
}
