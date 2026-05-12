import { useState } from "react";
import { Layers, LogOut, X, ChevronDown, Map, Satellite } from "lucide-react";
import { logout } from "@/app/login/actions";

type BarangayIndexEntry = {
  name: string;
  file: string;
};

type SettingsPanelProps = {
  barangays: BarangayIndexEntry[];
  activeFiles: Set<string>;
  toggleFile: (file: string) => void;
  showLotNumbers: boolean;
  setShowLotNumbers: (show: boolean) => void;
  autoLoadBarangay: boolean;
  setAutoLoadBarangay: (show: boolean) => void;
  basemap: "streets" | "satellite";
  setBasemap: (map: "streets" | "satellite") => void;
  activeLandClasses: Set<string>;
  toggleLandClass: (lc: string) => void;
  landClasses: string[];
};

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border-0 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0051d5] ${
        checked ? "bg-[#0051d5]" : "bg-[var(--surface-dim,#d8dadc)]"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function SettingsPanel({
  barangays,
  activeFiles,
  toggleFile,
  showLotNumbers,
  setShowLotNumbers,
  autoLoadBarangay,
  setAutoLoadBarangay,
  basemap,
  setBasemap,
  activeLandClasses,
  toggleLandClass,
  landClasses,
}: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [barangaySearch, setBarangaySearch] = useState("");

  const filteredBarangays = barangaySearch.trim()
    ? barangays.filter((b) =>
        b.name.toLowerCase().includes(barangaySearch.toLowerCase())
      )
    : barangays;

  return (
    <div className="relative">
      {/* FAB Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/20 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:shadow-md ${
          isOpen
            ? "bg-[#0051d5] text-white"
            : "bg-white/70 text-[var(--on-surface-variant)] hover:bg-white/90"
        }`}
        title="Map Settings"
      >
        {isOpen ? <X className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          className="absolute bottom-0 right-14 glass-panel flex flex-col rounded-xl overflow-hidden"
          style={{ width: "min(80vw, 300px)", maxHeight: "75vh" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/20">
            <h3 className="text-[15px] font-bold text-[var(--on-surface)]">
              Map Settings
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-slate-100/60 text-[var(--on-surface-variant)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-3 space-y-5">

            {/* ── General ── */}
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)] mb-3">
                General
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--on-surface)]">
                    Show Cadastral Lot No.
                  </span>
                  <Toggle checked={showLotNumbers} onChange={setShowLotNumbers} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--on-surface)]">
                    Auto-load Barangays
                  </span>
                  <Toggle checked={autoLoadBarangay} onChange={setAutoLoadBarangay} />
                </div>
                {/* Basemap toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--on-surface)]">Satellite View</span>
                  <Toggle
                    checked={basemap === "satellite"}
                    onChange={(v) => setBasemap(v ? "satellite" : "streets")}
                  />
                </div>
              </div>
            </section>

            {/* ── Land Classification ── */}
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)] mb-3">
                Land Classification
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {landClasses.map((lc) => (
                  <label
                    key={lc}
                    className="flex items-center gap-2 p-2 rounded-lg bg-white/40 hover:bg-blue-50/60 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={activeLandClasses.has(lc)}
                      onChange={() => toggleLandClass(lc)}
                      className="h-4 w-4 rounded border-gray-300 text-[#0051d5] focus:ring-[#0051d5]/30"
                    />
                    <span className="text-[12px] font-medium text-[var(--on-surface)] capitalize leading-none">
                      {lc}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            {/* ── Barangays ── */}
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--on-surface-variant)] mb-3">
                Barangays
              </h4>
              {/* Search */}
              <div className="relative mb-2.5">
                <svg
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--on-surface-variant)] pointer-events-none"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/50 border border-[var(--outline-variant)]/50 text-[12px] text-[var(--on-surface)] placeholder:text-[var(--on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[#0051d5]/20"
                  placeholder="Find barangay…"
                  value={barangaySearch}
                  onChange={(e) => setBarangaySearch(e.target.value)}
                />
              </div>

              <div className="space-y-0.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                {filteredBarangays.map((b) => (
                  <div
                    key={b.file}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-100/50 cursor-pointer transition-colors"
                    onClick={() => toggleFile(b.file)}
                  >
                    <span className="text-[12px] text-[var(--on-surface)]">{b.name}</span>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                        activeFiles.has(b.file)
                          ? "bg-[#0051d5]/10 text-[#0051d5]"
                          : "bg-slate-100/60 text-[var(--on-surface-variant)]"
                      }`}
                    >
                      {activeFiles.has(b.file) ? "ON" : "OFF"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Footer — Sign Out */}
          <div className="px-4 py-3 border-t border-white/20 bg-white/30">
            <button
              onClick={() => logout()}
              className="flex w-full items-center justify-center gap-2 py-2.5 rounded-lg border border-red-200/60 text-red-600 text-[13px] font-semibold hover:bg-red-50/60 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
