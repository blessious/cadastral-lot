-- 1. Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Create the lots table
-- We use a generic 'properties' JSONB column because different shapefiles 
-- might have varying attribute columns (like PIN, OWNER, LOT_NO, etc).
CREATE TABLE IF NOT EXISTS public.lots (
    id SERIAL PRIMARY KEY,
    barangay TEXT NOT NULL,
    properties JSONB DEFAULT '{}'::jsonb,
    geom GEOMETRY(MultiPolygon, 4326)
);

-- 3. Create a spatial index for fast bounding point/box queries
CREATE INDEX IF NOT EXISTS lots_geom_idx 
ON public.lots USING GIST (geom);

-- 4. Create an RPC function to fetch lots via Bounding Box
-- This function will be called by our Next.js frontend to grab only 
-- the polygons that fit inside the user's current Leaflet view.
CREATE OR REPLACE FUNCTION get_lots_in_bbox(
    min_lng DOUBLE PRECISION,
    min_lat DOUBLE PRECISION,
    max_lng DOUBLE PRECISION,
    max_lat DOUBLE PRECISION
)
RETURNS TABLE (
    id INTEGER,
    barangay TEXT,
    properties JSONB,
    geojson JSONB
)
LANGUAGE sql
AS $$
    SELECT 
        id, 
        barangay, 
        properties,
        ST_AsGeoJSON(geom)::jsonb AS geojson
    FROM public.lots
    -- The && operator uses our GiST index to rapidly find intersecting geometries
    WHERE geom && ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326);
$$;
