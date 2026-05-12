import { useState } from "react";
import { Layers, X } from "lucide-react";

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

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/70 p-0 shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-md dark:bg-slate-900/70 dark:hover:bg-slate-800/90"
        title="Map Settings"
      >
        {isOpen ? <X className="h-4 w-4 text-slate-700 dark:text-slate-200" /> : <Layers className="h-4 w-4 text-slate-700 dark:text-slate-200" />}
      </button>
      {isOpen && (
        <div className="absolute bottom-0 right-14 mb-0 flex max-h-[70vh] w-72 flex-col rounded-xl border border-white/20 bg-white/70 shadow-xl backdrop-blur-md dark:bg-slate-900/70">
          <div className="flex items-center justify-between border-b border-slate-200/50 p-4 dark:border-slate-700/50">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Settings</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 text-slate-800 dark:text-slate-200">
            {/* General Settings */}
            <div className="mb-4 border-b border-slate-200/50 pb-4 space-y-3 dark:border-slate-700/50">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">General</h4>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLotNumbers}
                  onChange={(e) => setShowLotNumbers(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-slate-200">Show Cadastral Lot No.</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLoadBarangay}
                  onChange={(e) => setAutoLoadBarangay(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-800 dark:text-slate-200">Auto-load Current Barangay</span>
              </label>
            </div>

            {/* Land Classes */}
            <div className="mb-4 border-b border-slate-200/50 pb-4 dark:border-slate-700/50">
              <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Filter by Land Class</h4>
              <div className="grid grid-cols-1 gap-2">
                {landClasses.map((lc) => (
                  <label key={lc} className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={activeLandClasses.has(lc)}
                      onChange={() => toggleLandClass(lc)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium capitalize text-gray-700 dark:text-slate-200">{lc}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Barangays */}
            <h4 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">Barangays</h4>
            <div className="space-y-2">
              {barangays.map((b) => (
                <label key={b.file} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeFiles.has(b.file)}
                    onChange={() => toggleFile(b.file)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-200">{b.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

