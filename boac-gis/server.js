const fs = require("fs");
const http = require("http");
const https = require("https");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

function readIfExists(filePath) {
  if (!filePath) return undefined;
  return fs.readFileSync(filePath);
}

function getHttpsOptions() {
  const pfxFile = process.env.SSL_PFX_FILE;
  if (pfxFile) {
    return {
      pfx: readIfExists(pfxFile),
      passphrase: process.env.SSL_PFX_PASSPHRASE || undefined,
    };
  }

  const keyFile = process.env.SSL_KEY_FILE;
  const certFile = process.env.SSL_CERT_FILE;
  if (keyFile && certFile) {
    return {
      key: readIfExists(keyFile),
      cert: readIfExists(certFile),
      ca: readIfExists(process.env.SSL_CA_FILE),
    };
  }

  return null;
}

async function main() {
  const app = next({ dev, hostname: host, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpsOptions = getHttpsOptions();
  const server = httpsOptions
    ? https.createServer(httpsOptions, (req, res) => handle(req, res))
    : http.createServer((req, res) => handle(req, res));

  server.listen(port, host, () => {
    const protocol = httpsOptions ? "https" : "http";
    console.log(`> Ready on ${protocol}://${host}:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
