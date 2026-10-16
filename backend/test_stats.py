import psycopg2, os
from dotenv import load_dotenv

load_dotenv('backend/.env')
conn = psycopg2.connect(
    dbname=os.environ.get('DB_NAME', 'ksp_crime'),
    user=os.environ.get('DB_USER', 'postgres'),
    password=os.environ.get('DB_PASSWORD'),
    host='localhost',
    port=5432
)
cur = conn.cursor()

# 1. Monthly
cur.execute("SELECT TO_CHAR(timestamp, 'YYYY-MM') as ym, COUNT(*) as cnt FROM incidents GROUP BY ym ORDER BY ym")
monthly = cur.fetchall()
print("MONTHLY:")
for row in monthly:
    print(row)

# 2. Day vs Night
cur.execute("""
    SELECT crime_type,
           COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM timestamp) >= 5 AND EXTRACT(HOUR FROM timestamp) < 22) as day_cnt,
           COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM timestamp) >= 22 OR EXTRACT(HOUR FROM timestamp) < 5) as night_cnt,
           COUNT(*) as total
    FROM incidents
    GROUP BY crime_type
    ORDER BY crime_type
""")
day_night = cur.fetchall()
print("\nDAY VS NIGHT:")
for row in day_night:
    day_pct = round(row[1] * 100.0 / row[3], 1)
    night_pct = round(row[2] * 100.0 / row[3], 1)
    print(f"{row[0]}: Day={row[1]} ({day_pct}%), Night={row[2]} ({night_pct}%), Total={row[3]}")

# 3. Weekday vs Weekend
cur.execute("""
    SELECT crime_type,
           COUNT(*) FILTER (WHERE EXTRACT(DOW FROM timestamp) NOT IN (0, 6)) as weekday_cnt,
           COUNT(*) FILTER (WHERE EXTRACT(DOW FROM timestamp) IN (0, 6)) as weekend_cnt,
           COUNT(*) as total
    FROM incidents
    GROUP BY crime_type
    ORDER BY crime_type
""")
wk = cur.fetchall()
print("\nWEEKDAY VS WEEKEND:")
for row in wk:
    # weekday is 5 days, weekend is 2 days. Normalized per-day rates or raw counts:
    raw_wk_pct = round(row[1] * 100.0 / row[3], 1)
    raw_we_pct = round(row[2] * 100.0 / row[3], 1)
    # per day rate:
    rate_wk = row[1] / 5.0
    rate_we = row[2] / 2.0
    norm_wk_pct = round(rate_wk * 100.0 / (rate_wk + rate_we), 1)
    norm_we_pct = round(rate_we * 100.0 / (rate_wk + rate_we), 1)
    print(f"{row[0]}: Weekday={row[1]} (raw {raw_wk_pct}%, norm {norm_wk_pct}%), Weekend={row[2]} (raw {raw_we_pct}%, norm {norm_we_pct}%)")

# 4. Heatmap Day of week (0=Sun, 1=Mon, ..., 6=Sat) x Hour (0..23)
cur.execute("""
    SELECT EXTRACT(DOW FROM timestamp)::int as dow,
           EXTRACT(HOUR FROM timestamp)::int as hr,
           COUNT(*) as cnt
    FROM incidents
    GROUP BY dow, hr
    ORDER BY dow, hr
""")
hm = cur.fetchall()
print(f"\nHEATMAP CELLS: {len(hm)}")

# 5. Crime distribution
cur.execute("""
    SELECT crime_type, COUNT(*) as cnt, ROUND(COUNT(*)*100.0/90305, 1) as pct
    FROM incidents
    GROUP BY crime_type
    ORDER BY cnt DESC
""")
dist = cur.fetchall()
print("\nCRIME DISTRIBUTION:")
for row in dist:
    print(row)

conn.close()
