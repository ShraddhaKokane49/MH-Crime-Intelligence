import psycopg2, os, json
from dotenv import load_dotenv
load_dotenv('backend/.env')

def compute_crime_intel(district=None):
    conn = psycopg2.connect(
        dbname=os.environ.get('DB_NAME', 'ksp_crime'),
        user=os.environ.get('DB_USER', 'postgres'),
        password=os.environ.get('DB_PASSWORD'),
        host='localhost',
        port=5432
    )
    cur = conn.cursor()

    clauses = []
    params = []
    if district:
        clauses.append("s.district = %s")
        params.append(district)
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    # 1. Monthly (24 months)
    cur.execute(f"""
        SELECT TO_CHAR(i."timestamp", 'YYYY-MM') as ym,
               TO_CHAR(i."timestamp", 'Mon ''YY') as label,
               COUNT(*) as total
        FROM incidents i
        JOIN stations s ON s.id = i.station_id
        {where_sql}
        GROUP BY ym, label
        ORDER BY ym
    """, params)
    monthly_rows = cur.fetchall()
    totals = [r[2] for r in monthly_rows]
    if totals:
        sorted_totals = sorted(totals)
        n = len(sorted_totals)
        median = sorted_totals[n // 2] if n % 2 != 0 else (sorted_totals[n // 2 - 1] + sorted_totals[n // 2]) / 2.0
        typical = int(round(median / 50.0) * 50) if median >= 100 else int(round(median))
    else:
        median = 0
        typical = 0

    monthly_data = []
    for ym, label, tot in monthly_rows:
        is_spike = tot > (median * 1.12) if median > 0 else False
        spike_diff = int(round(((tot - typical) / typical) * 100)) if typical > 0 else 0
        spike_label = None
        if is_spike:
            month_num = int(ym.split('-')[1])
            if month_num in (10, 11):
                spike_label = f"Festival period spike (+{spike_diff}% vs typical)"
            else:
                spike_label = f"Spike (+{spike_diff}% vs typical)"
        monthly_data.append({
            "month": label,
            "ym": ym,
            "total": tot,
            "typical": typical,
            "isSpike": is_spike,
            "spikeLabel": spike_label
        })

    # 2. Day vs Night
    cur.execute(f"""
        SELECT i.crime_type,
               COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM i."timestamp") >= 5 AND EXTRACT(HOUR FROM i."timestamp") < 22) as day_cnt,
               COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM i."timestamp") >= 22 OR EXTRACT(HOUR FROM i."timestamp") < 5) as night_cnt,
               COUNT(*) as total
        FROM incidents i
        JOIN stations s ON s.id = i.station_id
        {where_sql}
        GROUP BY i.crime_type
        ORDER BY total DESC
    """, params)
    day_night_rows = cur.fetchall()
    day_night_data = []
    for ct, day_c, night_c, tot in day_night_rows:
        if tot > 0:
            dp = round(day_c * 100.0 / tot, 1)
            np = round(100.0 - dp, 1)
        else:
            dp, np = 0, 0
        day_night_data.append({
            "crime": ct,
            "day": dp,
            "night": np,
            "dayCount": day_c,
            "nightCount": night_c,
            "total": tot
        })

    # 3. Weekday vs Weekend
    cur.execute(f"""
        SELECT i.crime_type,
               COUNT(*) FILTER (WHERE EXTRACT(DOW FROM i."timestamp") NOT IN (0, 6)) as weekday_cnt,
               COUNT(*) FILTER (WHERE EXTRACT(DOW FROM i."timestamp") IN (0, 6)) as weekend_cnt,
               COUNT(*) as total
        FROM incidents i
        JOIN stations s ON s.id = i.station_id
        {where_sql}
        GROUP BY i.crime_type
        ORDER BY total DESC
    """, params)
    wk_rows = cur.fetchall()
    weekend_data = []
    for ct, wk_c, we_c, tot in wk_rows:
        rate_wk = wk_c / 5.0
        rate_we = we_c / 2.0
        tot_rate = rate_wk + rate_we
        if tot_rate > 0:
            norm_wk = round(rate_wk * 100.0 / tot_rate, 1)
            norm_we = round(100.0 - norm_wk, 1)
        else:
            norm_wk, norm_we = 50.0, 50.0
        weekend_data.append({
            "crime": ct,
            "weekday": norm_wk,
            "weekend": norm_we,
            "weekdayCount": wk_c,
            "weekendCount": we_c,
            "total": tot
        })

    # 4. Heatmap: 7 days x 24 hours
    cur.execute(f"""
        SELECT EXTRACT(DOW FROM i."timestamp")::int as dow,
               EXTRACT(HOUR FROM i."timestamp")::int as hr,
               COUNT(*) as cnt
        FROM incidents i
        JOIN stations s ON s.id = i.station_id
        {where_sql}
        GROUP BY dow, hr
        ORDER BY dow, hr
    """, params)
    hm_rows = cur.fetchall()
    # Map Postgres DOW (0=Sun, 1=Mon...6=Sat) to Mon=0..Sun=6
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    dow_to_row = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6}
    
    heatmap_matrix = [[0 for _ in range(24)] for _ in range(7)]
    for dow, hr, cnt in hm_rows:
        row_idx = dow_to_row.get(dow, 0)
        heatmap_matrix[row_idx][hr] = cnt

    max_cell = max(max(r) for r in heatmap_matrix) if heatmap_matrix else 1
    min_cell = min(min(r) for r in heatmap_matrix) if heatmap_matrix else 0

    heatmap_data = {
        "days": day_names,
        "hours": list(range(24)),
        "matrix": heatmap_matrix,
        "min": min_cell,
        "max": max_cell
    }

    # 5. Crime category distribution
    cur.execute(f"""
        SELECT i.crime_type, COUNT(*) as cnt
        FROM incidents i
        JOIN stations s ON s.id = i.station_id
        {where_sql}
        GROUP BY i.crime_type
        ORDER BY cnt DESC
    """, params)
    cat_rows = cur.fetchall()
    total_incidents = sum(r[1] for r in cat_rows)
    cat_distribution = []
    for ct, cnt in cat_rows:
        pct = round(cnt * 100.0 / total_incidents, 1) if total_incidents > 0 else 0
        cat_distribution.append({
            "name": ct,
            "count": cnt,
            "share": pct
        })

    top2_share = round(sum(c["share"] for c in cat_distribution[:2]), 1) if len(cat_distribution) >= 2 else 0
    top2_names = " and ".join(c["name"] for c in cat_distribution[:2]) if len(cat_distribution) >= 2 else ""

    conn.close()

    return {
        "district": district or "Entire Maharashtra State",
        "totalIncidents": total_incidents,
        "typicalMonthly": typical,
        "monthlyTrend": monthly_data,
        "dayNight": day_night_data,
        "weekdayWeekend": weekend_data,
        "heatmap": heatmap_data,
        "categoryDistribution": cat_distribution,
        "insights": {
            "top2Categories": top2_names,
            "top2Share": top2_share,
            "typicalMonthlyFormatted": f"{typical:,}",
            "totalIncidentsFormatted": f"{total_incidents:,}"
        }
    }

if __name__ == "__main__":
    res = compute_crime_intel()
    print("Total:", res["totalIncidents"])
    print("Typical:", res["typicalMonthly"])
    print("Categories:", [(c["name"], c["count"], c["share"]) for c in res["categoryDistribution"]])
    print("Heatmap shape:", len(res["heatmap"]["matrix"]), "x", len(res["heatmap"]["matrix"][0]), "min:", res["heatmap"]["min"], "max:", res["heatmap"]["max"])
