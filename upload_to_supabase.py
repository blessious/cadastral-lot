import os
import json
import geopandas as gpd
from sqlalchemy import create_engine
import pyproj
from shapely.geometry import MultiPolygon, Polygon

# ==========================================
# CONFIGURATION
# ==========================================
# Paste your Supabase Postgres connection string here:
# e.g., postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
DB_CONNECTION_STRING = "YOUR_SUPABASE_DB_CONNECTION_STRING_HERE"

BASE_DIR = 'Cadastral - Barangay'
TARGET_CRS = 'EPSG:4326'
TABLE_NAME = 'lots'

# ==========================================

def ensure_multipolygon(geom):
    """Ensure geometries are MultiPolygons to match the DB schema."""
    if geom is None or geom.is_empty:
        return None
    if isinstance(geom, Polygon):
        return MultiPolygon([geom])
    elif isinstance(geom, MultiPolygon):
        return geom
    return None

def upload_shapefiles():
    print(f"Connecting to database...")
    engine = create_engine(DB_CONNECTION_STRING)

    for root, dirs, files in os.walk(BASE_DIR):
        for file in files:
            if file.endswith('.shp'):
                shp_path = os.path.join(root, file)
                barangay_name = os.path.splitext(file)[0].replace(' ', '_').replace('-', '_')
                
                print(f"Processing: {barangay_name} ({shp_path})")
                
                try:
                    # 1. Read shapefile
                    gdf = gpd.read_file(shp_path)
                    
                    if gdf.empty:
                        print("  -> Empty shapefile, skipping.")
                        continue
                        
                    # 2. Handle CRS (Coordinate Reference System)
                    if gdf.crs is None:
                        gdf.set_crs('EPSG:4683', inplace=True) # Assume PRS92 if none
                        
                    if gdf.crs.to_string() != TARGET_CRS:
                        gdf = gdf.to_crs(TARGET_CRS)
                        
                    # 3. Ensure geometries are MultiPolygons
                    gdf['geometry'] = gdf['geometry'].apply(ensure_multipolygon)
                    gdf = gdf.dropna(subset=['geometry'])
                    
                    if gdf.empty:
                        print("  -> No valid polygon geometries, skipping.")
                        continue

                    # 4. Extract properties into a dict column, separate geometry
                    # We drop geometry from the JSONB properties
                    properties_df = gdf.drop(columns=['geometry']).copy()
                    
                    # Convert to JSON records, then parse back to dicts to insert to DB
                    # Fill NaNs with None so it translates cleanly to JSON nulls
                    properties_df = properties_df.where(properties_df.notnull(), None)
                    properties_list = properties_df.to_dict(orient='records')
                    
                    # Prepare final DataFrame for SQL insertion
                    upload_df = gpd.GeoDataFrame({
                        'barangay': [barangay_name] * len(gdf),
                        'properties': [json.dumps(props) for props in properties_list],
                    }, geometry=gdf['geometry'], crs=gdf.crs)

                    # 5. Push to Supabase PostGIS
                    # Using dtype JSON to ensure 'properties' uploads as jsonb
                    from sqlalchemy.dialects.postgresql import JSONB
                    
                    print(f"  -> Uploading {len(upload_df)} features to Supabase...")
                    upload_df.to_postgis(
                        TABLE_NAME, 
                        engine, 
                        if_exists='append', 
                        index=False,
                        dtype={'properties': JSONB}
                    )
                    
                    print(f"  -> Success: {barangay_name}")
                    
                except Exception as e:
                    print(f"  -> Error processing {file}: {e}")

if __name__ == "__main__":
    if DB_CONNECTION_STRING == "YOUR_SUPABASE_DB_CONNECTION_STRING_HERE":
        print("ERROR: Please set your DB_CONNECTION_STRING in the script before running!")
    else:
        upload_shapefiles()
