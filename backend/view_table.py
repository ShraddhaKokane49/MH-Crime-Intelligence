r"""
Interactive Table & SQL Data Viewer for MH-Crime-Intelligence.
Directly queries PostgreSQL (localhost:5432 / ksp_crime) and prints clean tabular output.

Usage:
    backend\venv\Scripts\python.exe backend/view_table.py
    backend\venv\Scripts\python.exe backend/view_table.py real_district_crimes
    backend\venv\Scripts\python.exe backend/view_table.py stations
    backend\venv\Scripts\python.exe backend/view_table.py incidents
"""

import os
import sys
import argparse
import warnings
import psycopg2
import pandas as pd
from dotenv import load_dotenv

warnings.filterwarnings('ignore', category=UserWarning)

backend_dir = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(backend_dir, ".env"))

DB_CONFIG = {
    "dbname": os.environ.get("DB_NAME", "ksp_crime"),
    "user": os.environ.get("DB_USER", "postgres"),
    "password": os.environ.get("DB_PASSWORD", "Shraddha123"),
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": int(os.environ.get("DB_PORT", "5432")),
}

def get_connection():
    return psycopg2.connect(**DB_CONFIG)

def show_all_tables():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
    """)
    tables = [row[0] for row in cur.fetchall()]
    
    print("\n" + "=" * 70)
    print(" PostgreSQL Database: ksp_crime (localhost:5432)")
    print("=" * 70)
    
    data = []
    for table in tables:
        cur.execute(f"SELECT COUNT(*) FROM {table};")
        count = cur.fetchone()[0]
        cur.execute(f"""
            SELECT COUNT(*) 
            FROM information_schema.columns 
            WHERE table_name = '{table}';
        """)
        cols = cur.fetchone()[0]
        data.append({"Table Name": table, "Total Rows": f"{count:,}", "Columns": cols})
    
    conn.close()
    df = pd.DataFrame(data)
    print(df.to_string(index=False))
    print("=" * 70)
    print("\nTo view records from any table, run:")
    print("  backend\\venv\\Scripts\\python.exe backend/view_table.py <table_name>")
    print("Examples:")
    print("  backend\\venv\\Scripts\\python.exe backend/view_table.py real_district_crimes")
    print("  backend\\venv\\Scripts\\python.exe backend/view_table.py stations\n")

def view_table(table_name, limit=15):
    conn = get_connection()
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', 1000)
    pd.set_option('display.colheader_justify', 'left')
    
    print("\n" + "=" * 90)
    print(f" LIVE TABLE VIEW: {table_name} (First {limit} Rows)")
    print("=" * 90)
    
    if table_name == "real_district_crimes":
        query = f"""
            SELECT id, raw_district, normalized_district, year, 
                   murder, rape, robbery, burglary, theft, auto_theft, riots, cheating, total_ipc_crimes
            FROM real_district_crimes
            WHERE NOT is_state_total
            ORDER BY year DESC, total_ipc_crimes DESC
            LIMIT {limit};
        """
    elif table_name == "stations":
        query = f"""
            SELECT id, name, district, lat, long
            FROM stations
            ORDER BY id
            LIMIT {limit};
        """
    elif table_name == "incidents":
        query = f"""
            SELECT id, station_id, crime_type, "timestamp", weapon_or_method, target_type
            FROM incidents
            ORDER BY id DESC
            LIMIT {limit};
        """
    else:
        query = f"SELECT * FROM {table_name} LIMIT {limit};"
        
    df = pd.read_sql(query, conn)
    conn.close()
    
    print(df.to_string(index=False))
    print("=" * 90)
    print(f"Displayed {len(df)} rows from '{table_name}' in PostgreSQL database 'ksp_crime'.\n")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target = sys.argv[1].strip()
        view_table(target)
    else:
        show_all_tables()
