This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### Server PC setup

From the repository root, run:

```bat
setup_server.bat
```

If `server_config.env` does not exist, the setup script creates it from `server_config.example.env` and stops so you can edit the server-only values. Keep `server_config.env` local to each PC; it is intentionally ignored by Git.

Required values:

- `DB_HOST`, `DB_PORT`: login MySQL host and port, usually `127.0.0.1` and `3306`
- `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`: login MySQL database settings. The app creates the database and `gis_users` table if they do not exist.
- `APP_HOST`, `APP_PORT`, `PUBLIC_URL`: local bind address, local port, and public URL
- `NEXT_ALLOWED_DEV_ORIGINS`: comma-separated hosts allowed to access the dev server
- `AUTH_SECRET`: random 32+ character session signing secret

Start the app with:

```bat
boac-gis\run.bat
```

### Update map taxpayer data

Map and search data do not query ETRACS at runtime. To rebuild static GeoJSON owner data from `CLN with taxpayerName.csv`, run this from the repository root:

```bat
python build_unified_data.py
```

The script embeds `Owner`, `TaxDecNo`, and `Land_Class` into `boac-gis\public\geojson` and regenerates `search_index.json`.

### Configure administrator login

Authentication fails closed until the user table and session-signing secret are configured. Create or update a MySQL-backed user:

```bash
npm run auth:setup
```

The command creates the configured MySQL database and `gis_users` table if missing, then stores only a scrypt password hash. If it prints an `AUTH_SECRET`, copy that value into `../server_config.env`. Sessions are signed, HTTP-only, SameSite cookies and expire after eight hours. Five failed login attempts from the same client and username are blocked for 15 minutes.

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

For LAN or port-forwarded access, this project is configured to run on:

- [http://lguboacnas.myqnapcloud.com:3005](http://lguboacnas.myqnapcloud.com:3005)

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
