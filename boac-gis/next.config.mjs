/** @type {import('next').NextConfig} */
import fs from "node:fs";
import path from "node:path";

function readRootEnv() {
  const envPath = path.resolve(process.cwd(), "..", "server_config.env");
  if (!fs.existsSync(envPath)) {
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
    // The SQL driver relies on runtime class methods that webpack cannot safely bundle.
    serverComponentsExternalPackages: ["mssql"],
  },
};

export default nextConfig;
