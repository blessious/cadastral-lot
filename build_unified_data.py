"""
build_unified_data.py
-----------------------
A unified script that acts as the SINGLE SOURCE OF TRUTH for data processing.
It directly connects to the ETRACS SQL Server to fetch property ownership
and merges it instantly into the GeoJSON files, eliminating the need for
intermediate CSV files.

After enrichment, it also re-runs the search index so the SearchBar picks up owners.

Usage:
    python build_unified_data.py
"""

import json
import subprocess
import sys
from pathlib import Path

try:
    import pyodbc
except ImportError:
    print("[ERROR] pyodbc not installed. Run:  pip install pyodbc")
    sys.exit(1)

# ── CONFIG ────────────────────────────────────────────────────────────────────
DB_CONFIG = {
    "server":   "192.168.1.93,1433",
    "database": "etracs_boac",
    "username": "etracs_user",
    "password": "Etracs@2025!",
}

GEOJSON_SRC_DIR = Path(r"C:\Users\admin\Videos\CADASTRAL LOT MAP\output\geojson")
GEOJSON_OUT_DIR = Path(r"C:\Users\admin\Videos\CADASTRAL LOT MAP\boac-gis\public\geojson")
SEARCH_IDX      = Path(r"C:\Users\admin\Videos\CADASTRAL LOT MAP\generate_search_index.py")
# ─────────────────────────────────────────────────────────────────────────────

def connect():
    """Try ODBC Driver 17 first, fall back to 18 or SQL Server driver."""
    drivers = [
        "ODBC Driver 17 for SQL Server",
        "ODBC Driver 18 for SQL Server",
        "SQL Server",
    ]
    last_err = None
    for drv in drivers:
        try:
            conn_str = (
                f"DRIVER={{{drv}}};"
                f"SERVER={DB_CONFIG['server']};"
                f"DATABASE={DB_CONFIG['database']};"
                f"UID={DB_CONFIG['username']};"
                f"PWD={DB_CONFIG['password']};"
                "TrustServerCertificate=yes;"
            )
            conn = pyodbc.connect(conn_str, timeout=10)
            print(f"[OK] Connected using driver: {drv}")
            return conn
        except pyodbc.Error as e:
            last_err = e
    raise ConnectionError(f"All drivers failed. Last error: {last_err}")


def fetch_owner_map(conn) -> tuple[dict, dict]:
    """
    Returns (pin_map, cln_map) based directly on the ETRACS Database.
    """
    query = """
        SELECT
            rp.pin,
            rp.cadastralLotNo as cln,
            td.tdno,
            COALESCE(
                NULLIF(LTRIM(RTRIM(ppl.declaredOwnerName)),                    ''),
                NULLIF(LTRIM(RTRIM(CAST(td.taxpayerName AS nvarchar(max)))),   ''),
                ''
            ) AS ownerName,
            rpu.classTitle as landClass
        FROM RealProperty rp
        JOIN RPU rpu ON rpu.realpropertyid = rp.objid
        JOIN TaxDeclaration td ON td.rpuid = rpu.objid
        LEFT JOIN PropertyPayerLedger ppl ON ppl.tdno = td.tdno
        WHERE td.state NOT IN ('CANCELLED')
          AND td.tdno IS NOT NULL
    """
    cursor = conn.cursor()
    print("[...] Fetching live ownership records from ETRACS SQL Server...")
    cursor.execute(query)

    pin_map = {}
    cln_map = {}

    for row in cursor.fetchall():
        pin   = (row.pin or "").strip()
        cln   = (row.cln or "").strip()
        tdno  = (row.tdno or "").strip()
        owner = (row.ownerName or "").strip()
        land_class = (row.landClass or "").strip()

        if not owner and not land_class:
            continue
            
        payload = {"ownerName": owner, "tdno": tdno, "landClass": land_class}
        
        if pin:
            pin_map[pin] = payload
            
        if cln:
            # Normalize CLN just in case it has weird spacing or 'PT.' suffixes
            cln_key = cln.split()[0].strip()
            cln_map[cln_key] = payload

    print(f"[OK] Fetched {len(pin_map):,} PIN entries, {len(cln_map):,} CLN entries directly from DB.")
    return pin_map, cln_map


def enrich_file(src_path: Path, out_path: Path, pin_map: dict, cln_map: dict) -> tuple[int, int]:
    """
    Reads the base GeoJSON, enriches it with Owner/TaxDecNo, and writes directly to public/.
    """
    with open(src_path, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)

    features = data.get("features", [])
    matched = 0

    for feature in features:
        props = feature.get("properties") or {}

        pin = str(props.get("PIN") or "").strip()
        cln_parts = str(props.get("CLN") or "").strip().split()
        cln = cln_parts[0] if cln_parts else ""

        payload = pin_map.get(pin) or cln_map.get(cln)

        if payload:
            if payload["ownerName"]:
                props["Owner"]     = payload["ownerName"]
            if payload["tdno"]:
                props["TaxDecNo"]  = payload["tdno"]
            if payload["landClass"]:
                props["Land_Class"] = payload["landClass"]
                
            feature["properties"] = props
            matched += 1

    # Ensure output directory exists
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)

    return matched, len(features)


def main():
    try:
        conn = connect()
        pin_map, cln_map = fetch_owner_map(conn)
        conn.close()
    except Exception as e:
        print(f"\n[FATAL] Database connection failed: {e}")
        sys.exit(1)

    geojson_files = sorted(GEOJSON_SRC_DIR.glob("*.geojson"))
    geojson_files = [f for f in geojson_files if f.stem not in ("boac_all", "search_index", "index")]

    total_matched = 0
    total_features = 0

    print(f"\nEnriching {len(geojson_files)} GeoJSON files and saving to public/geojson...\n")
    for i, gf in enumerate(geojson_files, 1):
        out_file = GEOJSON_OUT_DIR / gf.name
        try:
            matched, total = enrich_file(gf, out_file, pin_map, cln_map)
            total_matched   += matched
            total_features  += total
            pct = f"{matched/total*100:.0f}%" if total else "0%"
            print(f"  [{i:02d}/{len(geojson_files)}] {gf.name:<40} {matched:>4}/{total} lots enriched ({pct})")
        except Exception as e:
            print(f"  [{i:02d}/{len(geojson_files)}] [ERROR] Failed to process {gf.name}: {e}")

    print(f"\n[OK] Total: {total_matched:,} / {total_features:,} features enriched with live DB data.")

    # Re-generate search index 
    print(f"\n[...] Re-generating search_index.json using {SEARCH_IDX.name} ...")
    if SEARCH_IDX.exists():
        result = subprocess.run([sys.executable, str(SEARCH_IDX)], capture_output=True, text=True)
        if result.returncode == 0:
            print("[OK] Search index updated.")
        else:
            print(f"[WARN] search_index.py error:\n{result.stderr}")
    else:
        print(f"[WARN] Search index script not found at {SEARCH_IDX}")

    print("\n[DONE] The app is updated. You can safely delete Cadastral_Data.csv if it's no longer needed.")


if __name__ == "__main__":
    main()
