import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDatasetVersion } from "./lib/map-dataset.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
console.log(await getDatasetVersion(path.join(scriptDirectory, "..", "public", "geojson")));
