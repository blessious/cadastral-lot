"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, LogOut, User, Moon, Sun, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

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
  canManageUsers?: boolean;
};

const MAX_RESULTS = 50;
type ThemeMode = "light" | "dark";

export default function SearchBar({ onSelect, activeFiles, canManageUsers = false }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("geolgu-theme");
    const initialTheme =
      storedTheme === "light" || storedTheme === "dark"
        ? storedTheme
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";

    setTheme(initialTheme);
    document.documentElement.dataset.theme = initialTheme;
  }, []);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      window.localStorage.setItem("geolgu-theme", next);
      return next;
    });
  };

  const activeFilesKey = useMemo(() => Array.from(activeFiles).sort().join("|"), [activeFiles]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const trimmed = query.trim();
      if (trimmed.length < 2 || !activeFilesKey) {
        setResults([]);
        setOpen(false);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      setOpen(true);
      setSearchError(false);
      try {
        const params = new URLSearchParams({ q: trimmed, limit: String(MAX_RESULTS) });
        activeFiles.forEach((file) => params.append("barangay", file));
        const response = await fetch(`/api/map/search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Search failed (${response.status})`);
        const payload = (await response.json()) as { results: SearchRecord[] };
        setResults(payload.results);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        console.error("Search failed:", error);
        setResults([]);
        setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [activeFiles, activeFilesKey, query]);

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

    if (isSearching) {
      return (
        <div className="absolute top-full left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl glass-panel" role="status">
          <div className="flex items-center justify-center gap-2 px-4 py-4 text-sm text-[var(--on-surface-variant)]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0051d5]/25 border-t-[#0051d5]" />
            Searching lots…
          </div>
        </div>
      );
    }
    
    if (searchError) {
      return (
        <div className="absolute top-full left-0 right-0 z-30 mt-2 rounded-xl glass-panel overflow-hidden">
          <div className="px-4 py-4 text-center text-sm text-red-500 font-medium">
            Search is temporarily unavailable. Please try again.
          </div>
        </div>
      );
    }
    
    if (query.trim() && !hasResults) {
      return (
        <div className="absolute top-full left-0 right-0 z-30 mt-2 rounded-xl glass-panel overflow-hidden">
          <div className="px-4 py-4 text-center text-sm text-[var(--on-surface-variant)]">
            No results found in the turned-on barangays for &quot;{query}&quot;
          </div>
        </div>
      );
    }

    if (!hasResults) return null;

    return (
      <div className="absolute top-full left-0 right-0 z-30 mt-2 rounded-lg glass-panel overflow-hidden shadow-xl">
        <ul className="max-h-80 overflow-y-auto custom-scrollbar py-1.5 text-sm">
          {results.map((item, index) => {
            const landClass = item.Land_Class ?? item.LAND_CLASS;
            return (
              <li key={`${item.CLN ?? "lot"}-${index}`}>
                <button
                  className="glass-field-hover flex min-h-11 w-full flex-col justify-center gap-0.5 px-4 py-2.5 text-left transition-colors"
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
  }, [hasResults, isSearching, onSelect, open, query, results, searchError]);

  return (
    /* Top Navigation Bar */
    <nav aria-label="Map tools" className="absolute top-[calc(.75rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[1000] flex h-14 w-[calc(100%-1.5rem)] max-w-3xl items-center gap-2 rounded-lg glass-panel px-2 md:top-4 md:gap-3 md:px-4">
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
      <div className="h-6 w-px bg-[var(--outline-variant)] shrink-0 hidden sm:block" />

      {/* Search */}
      <div ref={wrapperRef} className="relative flex-1 min-w-0">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--on-surface-variant)] pointer-events-none"
          strokeWidth={2}
        />
        <input
          className={cn(
            "glass-input h-11 w-full rounded-lg border py-2 pl-9 pr-11 text-[13px] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)]",
            "focus:outline-none focus:ring-2 focus:ring-[#0051d5]/30 focus:border-[#0051d5]/50 transition-all"
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
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-[var(--on-surface-variant)] transition-colors hover:bg-[var(--glass-field-hover)]"
            type="button"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {renderResults}
      </div>

      {/* Right Actions — User menu with Sign Out */}
      <div ref={userMenuRef} className="relative flex items-center shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-11 w-11 rounded-lg text-[var(--on-surface-variant)] hover:bg-[var(--glass-field-hover)] hover:text-[var(--on-surface)]"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-pressed={theme === "dark"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="h-11 w-11 rounded-lg bg-[#0051d5]/10 text-[#0051d5] hover:bg-[#0051d5]/20"
          title="Account"
          aria-label="Account"
          aria-expanded={userMenuOpen}
        >
          <User className="h-4 w-4" />
        </Button>

        {/* Sign-out dropdown */}
        {userMenuOpen && (
          <div className="absolute top-full right-0 mt-2 z-50 w-44 overflow-hidden rounded-lg glass-panel">
            <div className="px-4 py-3 border-b border-white/20">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)]">Account</p>
              <p className="text-[13px] font-bold text-[var(--on-surface)] mt-0.5">City Planning</p>
            </div>
            {canManageUsers ? (
              <Button
                asChild
                variant="ghost"
                className="flex h-11 w-full justify-start gap-2.5 rounded-none px-4 text-[13px] font-semibold text-[var(--on-surface)] hover:bg-[var(--glass-field-hover)]"
              >
                <Link href="/admin/users">
                  <UserPlus className="h-4 w-4" />
                  Users
                </Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => logout()}
              className="flex h-11 w-full justify-start gap-2.5 rounded-none px-4 text-[13px] font-semibold text-red-600 hover:bg-red-50/60"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
