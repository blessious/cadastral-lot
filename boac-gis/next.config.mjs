/** @type {import('next').NextConfig} */
import fs from "node:fs";
import path from "node:path";

function readRootEnv() {
  const envPath = ["server_config.env", ".env"]
    .map((file) => path.resolve(process.cwd(), "..", file))
    .find((file) => fs.existsSync(file));

  if (!envPath) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [key, ...valueParts] = line.split("=");
        return [key.trim(), valueParts.join("=").trim()];
      }),
  );
}

const rootEnv = readRootEnv();
for (const [key, value] of Object.entries(rootEnv)) {
  process.env[key] ||= value;
}

const allowedDevOrigins = (
  process.env.NEXT_ALLOWED_DEV_ORIGINS ||
  rootEnv.NEXT_ALLOWED_DEV_ORIGINS ||
  "localhost,127.0.0.1"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const nextConfig = {
  allowedDevOrigins,
  experimental: {
    // The MySQL driver relies on Node runtime APIs and should stay external.
    serverComponentsExternalPackages: ["mysql2"],
  },
};

export default nextConfig;
