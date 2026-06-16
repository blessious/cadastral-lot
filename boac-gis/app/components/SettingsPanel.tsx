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
};

export default function SettingsPanel({ barangays, activeFiles, toggleFile, showLotNumbers, setShowLotNumbers, autoLoadBarangay, setAutoLoadBarangay }: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="absolute right-4 top-24 z-[1000]">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="rounded-full bg-white p-3 shadow-lg hover:bg-gray-100"
          title="Map Settings"
        >
          <Layers className="h-6 w-6 text-slate-700" />
        </button>
      ) : (
        <div className="flex max-h-[60vh] w-64 flex-col rounded-xl bg-white shadow-xl">
          <div className="flex items-center justify-between border-b p-4">
            <h3 className="text-lg font-semibold text-slate-800">Settings</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 border-b pb-4 space-y-3">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showLotNumbers}
                  onChange={(e) => setShowLotNumbers(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-800">Show Cadastral Lot No.</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoLoadBarangay}
                  onChange={(e) => setAutoLoadBarangay(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-800">Auto-load Current Barangay</span>
              </label>
            </div>
            
            <h4 className="mb-3 text-sm font-semibold text-slate-700">Barangays</h4>
            {barangays.map((b) => (
              <label key={b.file} className="mb-3 flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeFiles.has(b.file)}
                  onChange={() => toggleFile(b.file)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">{b.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
