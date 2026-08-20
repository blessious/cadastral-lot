import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getDatasetVersion, loadAndValidateDataset, normalizeSearchText } from "../lib/map-dataset.mjs";

test("normalizes searchable values consistently", () => {
  assert.equal(normalizeSearchText("  LOT   123  "), "lot 123");
});

test("the checked-in dataset has unique stable IDs and valid geometry references", async () => {
  const dataset = await loadAndValidateDataset(path.join(process.cwd(), "public", "geojson"));
  assert.ok(dataset.diagnostics.barangayCount >= 60);
  assert.ok(dataset.diagnostics.searchRowCount > 20_000);
  assert.equal(dataset.diagnostics.searchRowCount, dataset.diagnostics.stableIdCount);
});

test("dataset versions change when authoritative geometry changes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "geolgu-version-"));
  try {
    await fs.writeFile(path.join(directory, "index.json"), "[]");
    await fs.writeFile(path.join(directory, "search_index.json"), "[]");
    await fs.writeFile(path.join(directory, "Sample.geojson"), '{"type":"FeatureCollection","features":[]}');
    const before = await getDatasetVersion(directory);
    await fs.writeFile(path.join(directory, "Sample.geojson"), '{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":null}]}');
    const after = await getDatasetVersion(directory);
    assert.notEqual(after, before);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
