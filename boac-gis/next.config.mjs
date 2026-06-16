/** @type {import('next').NextConfig} */
const allowedDevOrigins = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "192.168.1.93",
  process.env.PUBLIC_HOSTNAME,
  process.env.PUBLIC_IP,
].filter(Boolean);

const nextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
