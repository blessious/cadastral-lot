import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

const scripts = [
  ["run-migrations.mjs"],
  ["map-data-lifecycle.mjs", "stage", ...process.argv.slice(2)],
  ["map-data-lifecycle.mjs", "activate", ...process.argv.slice(2)],
];

for (const args of scripts) {
  const result = spawnSync(process.execPath, [path.join(scriptDirectory, ...args)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
