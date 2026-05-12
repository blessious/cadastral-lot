"""
extract_owner_name.py
Connects to ETRACS SQL Server, fetches the declared owner name for each
TaxDeclaration tdno, then replaces the 'taxpayerNa' column in
Cadastral_Data.csv with 'ownerName' sourced from the DB.

Priority order for owner name:
  1. PropertyPayerLedger.declaredOwnerName  (explicit ownership label)
  2. TaxDeclaration.taxpayerName            (fallback)
  3. Original Cadastral_Data taxpayerNa     (last resort if no DB match)
"""

import csv
import sys
import os

try:
    import pyodbc
except ImportError:
    print("[ERROR] pyodbc not installed. Run:  pip install pyodbc")
    sys.exit(1)

# â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DB_CONFIG = {
    "server":   "192.168.1.93,1433",
    "database": "etracs_boac",
    "username": "etracs_user",
    "password": "Etracs@2025!",
}

INPUT_CSV  = r"c:\Users\admin\Videos\CADASTRAL LOT MAP\Cadastral - Barangay\Cadastral_Data.csv"
OUTPUT_CSV = r"c:\Users\admin\Videos\CADASTRAL LOT MAP\Cadastral - Barangay\Cadastral_Data_WithOwner.csv"
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


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


def fetch_owner_map(conn):
    """
    Returns a dict: { tdno (str) -> ownerName (str) }

    Query joins TaxDeclaration â†’ PropertyPayerLedger so we prefer
    declaredOwnerName; falls back to taxpayerName if no ledger row exists.
    """
    query = """
        SELECT
            td.tdno,
            COALESCE(
                NULLIF(LTRIM(RTRIM(ppl.declaredOwnerName)),                    ''),
                NULLIF(LTRIM(RTRIM(CAST(td.taxpayerName AS nvarchar(max)))),   ''),
                ''
            ) AS ownerName,
            rpu.classTitle as landClass
        FROM TaxDeclaration td
        LEFT JOIN PropertyPayerLedger ppl
               ON ppl.tdno = td.tdno
        LEFT JOIN RPU rpu
               ON rpu.objid = td.rpuid
        WHERE td.tdno IS NOT NULL
          AND td.state NOT IN ('CANCELLED')
    """
    cursor = conn.cursor()
    print("[...] Fetching owner names from ETRACS (this may take a moment)...")
    cursor.execute(query)

    owner_map = {}
    for row in cursor.fetchall():
        tdno = (row.tdno or "").strip()
        owner = (row.ownerName or "").strip()
        land_class = (row.landClass or "").strip()
        if tdno:
            # If multiple ledger rows per tdno, last non-empty wins
            if tdno not in owner_map:
                owner_map[tdno] = {"ownerName": owner, "landClass": land_class}
            else:
                if owner:
                    owner_map[tdno]["ownerName"] = owner
                if land_class:
                    owner_map[tdno]["landClass"] = land_class

    print(f"[OK] Fetched {len(owner_map):,} unique tdno -> ownerName/landClass mappings.")
    return owner_map


def process_csv(owner_map):
    matched   = 0
    unmatched = 0
    rows_out  = []

    with open(INPUT_CSV, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames[:]  # copy

        # Replace 'taxpayerNa' with 'ownerName' in header
        if "taxpayerNa" in fieldnames:
            idx = fieldnames.index("taxpayerNa")
            fieldnames[idx] = "ownerName"
        else:
            print("[WARN] 'taxpayerNa' column not found in CSV header.")

        # Ensure Land_Class exists
        if "Land_Class" not in fieldnames and "LAND_CLASS" not in fieldnames:
            fieldnames.append("Land_Class")

        for row in reader:
            tdno = (row.get("tdno") or "").strip()
            original_name = row.pop("taxpayerNa", None) or ""

            if tdno in owner_map:
                data = owner_map[tdno]
                row["ownerName"] = data["ownerName"] if data["ownerName"] else original_name
                if data["landClass"]:
                    row["Land_Class"] = data["landClass"]
                elif "Land_Class" not in row:
                    row["Land_Class"] = ""
                matched += 1
            else:
                # Keep original as fallback so no data is lost
                row["ownerName"] = original_name
                if "Land_Class" not in row:
                    row["Land_Class"] = ""
                unmatched += 1

            rows_out.append(row)

    print(f"[OK] Matched:   {matched:,} rows")
    print(f"[OK] Unmatched (kept original): {unmatched:,} rows")
    return fieldnames, rows_out


def write_csv(fieldnames, rows):
    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"[OK] Output saved -> {OUTPUT_CSV}")


if __name__ == "__main__":
    try:
        conn = connect()
        owner_map = fetch_owner_map(conn)
        conn.close()

        fieldnames, rows = process_csv(owner_map)
        write_csv(fieldnames, rows)

        print("\nâœ… Done! Open 'Cadastral_Data_WithOwner.csv' for the result.")

    except Exception as e:
        print(f"\n[FATAL] {e}")
        sys.exit(1)

