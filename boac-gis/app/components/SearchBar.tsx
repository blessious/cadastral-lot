"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";

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
  activeFiles: ReadonlySet<string>;
};

const MAX_RESULTS = 50;

export default function SearchBar({ onSelect, activeFiles }: SearchBarProps) {
  const [searchIndex, setSearchIndex] = useState<SearchRecord[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    fetch(`/geojson/search_index.json?v=${Date.now()}`)
      .then((response) => {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.json();
      })
      .then((data: SearchRecord[]) => {
        setSearchIndex(data);
        setSearchError(false);
      })
      .catch((error) => {
        console.error("Failed to load search index:", error);
        setSearchIndex([]);
        setSearchError(true);
      });
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
        if (!activeFiles.has(item.file)) {
          return false;
        }
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
  }, [activeFiles, query, searchIndex]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setUserMenuOpen(false);
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
    if (!open) {
      return null;
    }
    
    if (searchError) {
      return (
        <div className="absolute top-full left-0 right-0 z-30 mt-2 rounded-xl glass-panel overflow-hidden">
          <div className="px-4 py-4 text-center text-sm text-red-500 font-medium bg-white/80">
            Failed to load search database. Please refresh the page.
          </div>
        </div>
      );
    }
    
    if (query.trim() && !hasResults) {
      return (
        <div className="absolute top-full left-0 right-0 z-30 mt-2 rounded-xl glass-panel overflow-hidden">
          <div className="px-4 py-4 text-center text-sm text-[var(--on-surface-variant)] bg-white/80">
            No results found in the turned-on barangays for &quot;{query}&quot;
          </div>
        </div>
      );
    }

    if (!hasResults) return null;

    return (
      <div className="absolute top-full left-0 right-0 z-30 mt-2 rounded-xl glass-panel overflow-hidden shadow-xl border border-white/40">
        <ul className="max-h-80 overflow-y-auto custom-scrollbar py-1.5 text-sm bg-white/95 backdrop-blur-md">
          {results.map((item, index) => {
            const landClass = item.Land_Class ?? item.LAND_CLASS;
            return (
              <li key={`${item.CLN ?? "lot"}-${index}`}>
                <button
                  className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-blue-50/60"
                  onClick={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  type="button"
                >
                  <span className="font-semibold text-[13px] text-[var(--on-surface)]">
                    {item.CLN ?? "Unknown lot"}
                    {item.Barangay && (
                      <span className="ml-2 font-normal text-[var(--on-surface-variant)]">
                        • {item.Barangay}
                      </span>
                    )}
                  </span>
                  {item.Owner ? (
                    <span className="text-[11px] font-medium text-[#0051d5]">
                      {item.Owner}
                    </span>
                  ) : null}
                  {landClass ? (
                    <span className="text-[11px] text-[var(--on-surface-variant)]">
                      {landClass}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }, [hasResults, onSelect, open, query, results, searchError]);

  return (
    /* Top Navigation Bar */
    <nav className="absolute top-5 left-1/2 -translate-x-1/2 z-[1000] w-[95%] max-w-3xl glass-panel rounded-xl flex items-center px-4 h-14 gap-4">
      {/* Brand — Boac Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <Image
          src="/Boac-Logo.png"
          alt="Boac LGU Logo"
          width={36}
          height={36}
          className="rounded-full object-contain"
          priority
        />
        <span className="text-[14px] font-bold text-[var(--on-surface)] tracking-tight leading-none whitespace-nowrap hidden sm:block">
          GeoLGU Navigator
        </span>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-[var(--outline-variant)] shrink-0" />

      {/* Search */}
      <div ref={wrapperRef} className="relative flex-1 min-w-0">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--on-surface-variant)] pointer-events-none"
          strokeWidth={2}
        />
        <input
          className={cn(
            "w-full pl-9 pr-8 py-2 rounded-lg bg-white/50 border border-[var(--outline-variant)]/60 text-[13px] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]",
            "focus:outline-none focus:ring-2 focus:ring-[#0051d5]/30 focus:border-[#0051d5]/50 focus:bg-white/80 transition-all"
          )}
          placeholder="Search within turned-on barangays…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (query.trim().length > 0) {
              setOpen(true);
            }
          }}
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-[var(--on-surface-variant)] hover:bg-slate-100/80 transition-colors"
            type="button"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {renderResults}
      </div>

      {/* Right Actions — User menu with Sign Out */}
      <div ref={userMenuRef} className="relative flex items-center shrink-0">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0051d5]/10 text-[#0051d5] hover:bg-[#0051d5]/20 transition-colors"
          title="Account"
        >
          <User className="h-4 w-4" />
        </button>

        {/* Sign-out dropdown */}
        {userMenuOpen && (
          <div className="absolute top-full right-0 mt-2 glass-panel rounded-xl overflow-hidden w-44 z-50">
            <div className="px-4 py-3 border-b border-white/20">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)]">Account</p>
              <p className="text-[13px] font-bold text-[var(--on-surface)] mt-0.5">City Planning</p>
            </div>
            <button
              onClick={() => logout()}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-[13px] font-semibold text-red-600 hover:bg-red-50/60 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
