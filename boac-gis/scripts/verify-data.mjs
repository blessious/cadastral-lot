import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadAndValidateDataset } from "./lib/map-dataset.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataset = await loadAndValidateDataset(path.join(scriptDirectory, "..", "public", "geojson"));
console.log(JSON.stringify({ status: "ok", version: dataset.version, ...dataset.diagnostics }));
