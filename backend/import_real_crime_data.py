"""
Safe, Repeatable Real Crime Data Importer for MH-Crime-Intelligence.

Imports verified National Crime Records Bureau (NCRB) district-wise IPC crime data
(2001-2012) into PostgreSQL database 'ksp_crime'.

STRICT RULES OBSERVED:
1. Never drops, truncates, or resets existing tables.
2. Does NOT invoke synthetic data generator.
3. Does NOT manufacture individual FIR incidents, fake timestamps, or fake coordinates.
4. Parameterized SQL with idempotent ON CONFLICT upsert.
5. Preserves original CSV untouched.
"""

import os
import sys
import argparse
from typing import Dict, Any, List, Tuple
import pandas as pd
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Base paths
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
DEFAULT_CSV_PATH = os.path.join(PROJECT_ROOT, "data", "real_crime", "01_District_wise_crimes_committed_IPC_2001_2012.csv")

# Load environment
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

# Verified District Name Normalization for Maharashtra
DISTRICT_NORMALIZATION_MAP: Dict[str, str] = {
    "AHMEDNAGAR": "Ahilyanagar",
    "AKOLA": "Akola",
    "AMRAVATI COMMR.": "Amravati",
    "AMRAVATI RURAL": "Amravati",
    "AURANGABAD COMMR.": "Chhatrapati Sambhajinagar",
    "AURANGABAD RURAL": "Chhatrapati Sambhajinagar",
    "BEED": "Beed",
    "BHANDARA": "Bhandara",
    "BULDHANA": "Buldhana",
    "CHANDRAPUR": "Chandrapur",
    "DHULE": "Dhule",
    "GADCHIROLI": "Gadchiroli",
    "GONDIA": "Gondia",
    "HINGOLI": "Hingoli",
    "JALGAON": "Jalgaon",
    "JALNA": "Jalna",
    "KOLHAPUR": "Kolhapur",
    "LATUR": "Latur",
    "MUMBAI": "Mumbai City",
    "MUMBAI COMMR.": "Mumbai City",
    "MUMBAI RLY.": "Mumbai City",
    "NAGPUR COMMR.": "Nagpur",
    "NAGPUR RURAL": "Nagpur",
    "NAGPUR RLY.": "Nagpur",
    "NANDED": "Nanded",
    "NANDURBAR": "Nandurbar",
    "NASIK COMMR.": "Nashik",
    "NASIK RURAL": "Nashik",
    "NAVI MUMBAI": "Thane",
    "OSMANABAD": "Dharashiv",
    "PARBHANI": "Parbhani",
    "PUNE COMMR.": "Pune",
    "PUNE RURAL": "Pune",
    "PUNE RLY.": "Pune",
    "RAIGAD": "Raigad",
    "RATNAGIRI": "Ratnagiri",
    "SANGLI": "Sangli",
    "SATARA": "Satara",
    "SINDHUDURG": "Sindhudurg",
    "SOLAPUR COMMR.": "Solapur",
    "SOLAPUR RURAL": "Solapur",
    "THANE COMMR.": "Thane",
    "THANE RURAL": "Thane",
    "WARDHA": "Wardha",
    "WASHIM": "Washim",
    "YAVATMAL": "Yavatmal",
    "TOTAL": "State Total",
}

# Column mappings: CSV column name -> DB column name
COLUMN_MAP = [
    ("MURDER", "murder"),
    ("ATTEMPT TO MURDER", "attempt_to_murder"),
    ("CULPABLE HOMICIDE NOT AMOUNTING TO MURDER", "culpable_homicide"),
    ("RAPE", "rape"),
    ("CUSTODIAL RAPE", "custodial_rape"),
    ("OTHER RAPE", "other_rape"),
    ("KIDNAPPING & ABDUCTION", "kidnapping_abduction"),
    ("KIDNAPPING AND ABDUCTION OF WOMEN AND GIRLS", "kidnapping_women_girls"),
    ("KIDNAPPING AND ABDUCTION OF OTHERS", "kidnapping_others"),
    ("DACOITY", "dacoity"),
    ("PREPARATION AND ASSEMBLY FOR DACOITY", "preparation_dacoity"),
    ("ROBBERY", "robbery"),
    ("BURGLARY", "burglary"),
    ("THEFT", "theft"),
    ("AUTO THEFT", "auto_theft"),
    ("OTHER THEFT", "other_theft"),
    ("RIOTS", "riots"),
    ("CRIMINAL BREACH OF TRUST", "criminal_breach_of_trust"),
    ("CHEATING", "cheating"),
    ("COUNTERFIETING", "counterfeiting"),
    ("ARSON", "arson"),
    ("HURT/GREVIOUS HURT", "hurt_grievous_hurt"),
    ("DOWRY DEATHS", "dowry_deaths"),
    ("ASSAULT ON WOMEN WITH INTENT TO OUTRAGE HER MODESTY", "assault_on_women"),
    ("INSULT TO MODESTY OF WOMEN", "insult_to_modesty_of_women"),
    ("CRUELTY BY HUSBAND OR HIS RELATIVES", "cruelty_by_husband_or_relatives"),
    ("IMPORTATION OF GIRLS FROM FOREIGN COUNTRIES", "importation_of_girls"),
    ("CAUSING DEATH BY NEGLIGENCE", "causing_death_by_negligence"),
    ("OTHER IPC CRIMES", "other_ipc_crimes"),
    ("TOTAL IPC CRIMES", "total_ipc_crimes"),
]

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS real_district_crimes (
    id SERIAL PRIMARY KEY,
    state_ut VARCHAR(80) NOT NULL,
    raw_district VARCHAR(100) NOT NULL,
    normalized_district VARCHAR(100) NOT NULL,
    is_state_total BOOLEAN NOT NULL DEFAULT FALSE,
    year INTEGER NOT NULL,
    murder INTEGER NOT NULL DEFAULT 0,
    attempt_to_murder INTEGER NOT NULL DEFAULT 0,
    culpable_homicide INTEGER NOT NULL DEFAULT 0,
    rape INTEGER NOT NULL DEFAULT 0,
    custodial_rape INTEGER NOT NULL DEFAULT 0,
    other_rape INTEGER NOT NULL DEFAULT 0,
    kidnapping_abduction INTEGER NOT NULL DEFAULT 0,
    kidnapping_women_girls INTEGER NOT NULL DEFAULT 0,
    kidnapping_others INTEGER NOT NULL DEFAULT 0,
    dacoity INTEGER NOT NULL DEFAULT 0,
    preparation_dacoity INTEGER NOT NULL DEFAULT 0,
    robbery INTEGER NOT NULL DEFAULT 0,
    burglary INTEGER NOT NULL DEFAULT 0,
    theft INTEGER NOT NULL DEFAULT 0,
    auto_theft INTEGER NOT NULL DEFAULT 0,
    other_theft INTEGER NOT NULL DEFAULT 0,
    riots INTEGER NOT NULL DEFAULT 0,
    criminal_breach_of_trust INTEGER NOT NULL DEFAULT 0,
    cheating INTEGER NOT NULL DEFAULT 0,
    counterfeiting INTEGER NOT NULL DEFAULT 0,
    arson INTEGER NOT NULL DEFAULT 0,
    hurt_grievous_hurt INTEGER NOT NULL DEFAULT 0,
    dowry_deaths INTEGER NOT NULL DEFAULT 0,
    assault_on_women INTEGER NOT NULL DEFAULT 0,
    insult_to_modesty_of_women INTEGER NOT NULL DEFAULT 0,
    cruelty_by_husband_or_relatives INTEGER NOT NULL DEFAULT 0,
    importation_of_girls INTEGER NOT NULL DEFAULT 0,
    causing_death_by_negligence INTEGER NOT NULL DEFAULT 0,
    other_ipc_crimes INTEGER NOT NULL DEFAULT 0,
    total_ipc_crimes INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_real_district_crimes UNIQUE (state_ut, raw_district, year)
);

CREATE INDEX IF NOT EXISTS idx_rdc_state_norm ON real_district_crimes (state_ut, normalized_district);
CREATE INDEX IF NOT EXISTS idx_rdc_year ON real_district_crimes (year);
CREATE INDEX IF NOT EXISTS idx_rdc_total ON real_district_crimes (total_ipc_crimes);
"""


def get_db_connection():
    db_password = os.environ.get("DB_PASSWORD")
    if not db_password:
        raise RuntimeError("DB_PASSWORD environment variable is required")
    db_config = dict(
        dbname=os.environ.get("DB_NAME", "ksp_crime"),
        user=os.environ.get("DB_USER", "postgres"),
        password=db_password,
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "5432")),
    )
    return psycopg2.connect(**db_config)


def validate_and_transform(csv_path: str, target_state: str = "MAHARASHTRA") -> Tuple[pd.DataFrame, Dict[str, int]]:
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV file not found at: {csv_path}")

    print(f"[1/4] Reading dataset: {csv_path}")
    df = pd.read_csv(csv_path)
    total_rows_read = len(df)

    # Validate essential schema columns
    expected_header = ["STATE/UT", "DISTRICT", "YEAR", "TOTAL IPC CRIMES"]
    missing_cols = [c for c in expected_header if c not in df.columns]
    if missing_cols:
        raise ValueError(f"CSV missing mandatory columns: {missing_cols}")

    # Check crime columns
    for csv_col, _ in COLUMN_MAP:
        if csv_col not in df.columns:
            raise ValueError(f"CSV missing crime category column: {csv_col}")

    # Filter target state
    state_mask = df["STATE/UT"].astype(str).str.strip().str.upper() == target_state.upper()
    df_state = df[state_mask].copy()
    state_rows_count = len(df_state)
    other_state_rows = total_rows_read - state_rows_count

    # Validate data integrity
    rejected_rows = 0
    clean_records = []

    for idx, row in df_state.iterrows():
        try:
            year = int(row["YEAR"])
            if year < 1990 or year > 2030:
                rejected_rows += 1
                continue

            raw_dist = str(row["DISTRICT"]).strip().upper()
            norm_dist = DISTRICT_NORMALIZATION_MAP.get(raw_dist, raw_dist.title())
            is_total = (raw_dist == "TOTAL")

            rec: Dict[str, Any] = {
                "state_ut": str(row["STATE/UT"]).strip().title(),
                "raw_district": raw_dist,
                "normalized_district": norm_dist,
                "is_state_total": is_total,
                "year": year,
            }

            for csv_col, db_col in COLUMN_MAP:
                val = row[csv_col]
                rec[db_col] = int(val) if pd.notnull(val) else 0

            clean_records.append(rec)
        except Exception as e:
            rejected_rows += 1
            print(f"Warning: Rejected row {idx} due to error: {e}")

    df_clean = pd.DataFrame(clean_records)
    metrics = {
        "total_rows_read": total_rows_read,
        "state_rows_count": state_rows_count,
        "other_state_rows": other_state_rows,
        "rejected_rows": rejected_rows,
        "valid_transformed_rows": len(df_clean),
    }
    return df_clean, metrics


def import_to_postgres(df: pd.DataFrame) -> int:
    conn = get_db_connection()
    cur = conn.cursor()

    print("[2/4] Ensuring target PostgreSQL schema exists (additive only)...")
    cur.execute(CREATE_TABLE_SQL)
    conn.commit()

    print(f"[3/4] Performing idempotent upsert for {len(df)} records into 'real_district_crimes'...")
    
    db_cols = ["state_ut", "raw_district", "normalized_district", "is_state_total", "year"] + [db_col for _, db_col in COLUMN_MAP]
    
    cols_str = ", ".join(db_cols)
    update_assignments = [f"{col} = EXCLUDED.{col}" for col in db_cols if col not in ("state_ut", "raw_district", "year")]
    update_assignments.append("updated_at = CURRENT_TIMESTAMP")
    update_str = ", ".join(update_assignments)

    upsert_sql = f"""
        INSERT INTO real_district_crimes ({cols_str})
        VALUES %s
        ON CONFLICT (state_ut, raw_district, year)
        DO UPDATE SET {update_str}
    """

    records_to_insert = [tuple(row[col] for col in db_cols) for _, row in df.iterrows()]

    psycopg2.extras.execute_values(
        cur,
        upsert_sql,
        records_to_insert,
        page_size=200
    )
    conn.commit()

    # Verify count in database
    cur.execute("SELECT count(*) FROM real_district_crimes WHERE state_ut = 'Maharashtra';")
    db_count = cur.fetchone()[0]

    cur.close()
    conn.close()
    return db_count


def main():
    parser = argparse.ArgumentParser(description="Import authentic NCRB district crime data into PostgreSQL.")
    parser.add_argument("--csv-path", default=DEFAULT_CSV_PATH, help="Path to raw NCRB CSV file")
    parser.add_argument("--state", default="MAHARASHTRA", help="Target State/UT filter")
    parser.add_argument("--validate-only", action="store_true", help="Validate and transform without writing to DB")
    args = parser.parse_args()

    print("=" * 75)
    print("MH-CRIME-INTELLIGENCE: REAL DATA IMPORTER (NCRB GOVT DATASET)")
    print("=" * 75)

    df_clean, metrics = validate_and_transform(args.csv_path, target_state=args.state)

    print(f"Dataset Rows Read:        {metrics['total_rows_read']}")
    print(f"Target State ({args.state}):  {metrics['state_rows_count']} rows")
    print(f"Other States Skipped:     {metrics['other_state_rows']} rows")
    print(f"Malformed/Rejected:       {metrics['rejected_rows']} rows")
    print(f"Clean Transformed Rows:   {metrics['valid_transformed_rows']} rows")

    if args.validate_only:
        print("\n[VALIDATION ONLY MODE] Database import skipped.")
        return

    db_count = import_to_postgres(df_clean)
    print(f"[4/4] Import complete! Active records in 'real_district_crimes': {db_count}")
    print("=" * 75)
    print("Import Status: SUCCESSFUL & IDEMPOTENT")
    print("=" * 75)


if __name__ == "__main__":
    main()
