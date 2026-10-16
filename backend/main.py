"""
KSP Crime Intelligence Platform — Phase 1 API
Serves incidents (filterable) and station jurisdictions as GeoJSON.
"""

from datetime import datetime
from typing import Optional
from collections import defaultdict

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ai_assistant import process_ai_query

CRIME_TYPES = ["Assault", "Burglary", "Chain Snatching", "Cybercrime", "Robbery", "Theft", "Vehicle Theft"]
FEATURE_COLS = [
    "lag1_total", "roll4_total", "roll8_total", "roll4_prev4_ratio",
    "lag_night_share", "lag_weekend_share", "is_festival_season",
] + [f"mix_{ct}" for ct in CRIME_TYPES]

import os

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

db_password = os.environ.get("DB_PASSWORD")
if not db_password:
    raise RuntimeError("DB_PASSWORD environment variable is required")

DB_CONFIG = dict(
    dbname=os.environ.get("DB_NAME", "ksp_crime"),
    user=os.environ.get("DB_USER", "postgres"),
    password=db_password,
    host=os.environ.get("DB_HOST", "localhost"),
    port=int(os.environ.get("DB_PORT", "5432")),
)

app = FastAPI(title="Maharashtra Crime Intelligence & Analytics API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the risk model once at startup rather than per-request. If risk_model.json
# is missing (e.g. someone runs the API without having run the ml/ notebook first),
# we degrade gracefully rather than crashing the whole API on import.
_risk_model = None
_shap_explainer = None
_model_loaded = False

def load_model_lazy():
    global _risk_model, _shap_explainer, _model_loaded
    if _model_loaded:
        return
    try:
        from xgboost import XGBRegressor
        model_path = os.path.join(BASE_DIR, "risk_model.json")
        if os.path.exists(model_path):
            _risk_model = XGBRegressor()
            _risk_model.load_model(model_path)
            try:
                import shap
                _shap_explainer = shap.TreeExplainer(_risk_model)
            except Exception as se:
                print(f"SHAP TreeExplainer note: {se}")
            print("XGBoost model loaded successfully.")
        _model_loaded = True
    except Exception as e:
        print(f"WARNING: risk model not loaded ({e}).")
        _model_loaded = True


# CORS is managed automatically by Zoho Catalyst's API gateway for components in the same project.



def get_conn():
    import psycopg2
    import psycopg2.extras
    return psycopg2.connect(**DB_CONFIG, cursor_factory=psycopg2.extras.RealDictCursor)


@app.get("/api/health")
def health():
    import socket
    try:
        ip = socket.gethostbyname("aws-0-ap-south-1.pooler.supabase.com")
        dns = f"resolved to {ip}"
    except Exception as e:
        dns = f"failed to resolve: {e}"
    return {"status": "ok", "dns": dns}


@app.get("/api/run-precompute")
def run_precompute_endpoint():
    import subprocess
    import sys
    try:
        res = subprocess.run(
            [sys.executable, "generate_precomputed.py"],
            capture_output=True,
            text=True,
            timeout=180
        )
        return {
            "returncode": res.returncode,
            "stdout": res.stdout,
            "stderr": res.stderr
        }
    except Exception as e:
        import traceback
        return {"error": str(e), "traceback": traceback.format_exc()}


@app.get("/api/incidents")
def get_incidents(
    station_id: Optional[int] = None,
    district: Optional[str] = None,
    crime_type: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    time_of_day: Optional[str] = Query(default=None, regex="^(day|night)$"),
    day_type: Optional[str] = Query(default=None, regex="^(weekday|weekend)$"),
    limit: int = Query(default=5000, le=20000),
):
    """Return incidents as a filterable list. Frontend renders these as map/heatmap points.

    time_of_day: 'night' = 22:00-04:59, 'day' = 05:00-21:59
    day_type: 'weekend' = Sat/Sun, 'weekday' = Mon-Fri
    """
    clauses, params = [], []

    if station_id is not None:
        clauses.append("i.station_id = %s")
        params.append(station_id)
    if district is not None:
        clauses.append("s.district = %s")
        params.append(district)
    if crime_type is not None:
        clauses.append("i.crime_type = %s")
        params.append(crime_type)
    if date_from is not None:
        clauses.append('i."timestamp" >= %s')
        params.append(date_from)
    if date_to is not None:
        clauses.append('i."timestamp" <= %s')
        params.append(date_to)
    if time_of_day == "night":
        clauses.append('(EXTRACT(HOUR FROM i."timestamp") >= 22 OR EXTRACT(HOUR FROM i."timestamp") < 5)')
    elif time_of_day == "day":
        clauses.append('(EXTRACT(HOUR FROM i."timestamp") >= 5 AND EXTRACT(HOUR FROM i."timestamp") < 22)')
    if day_type == "weekend":
        clauses.append('EXTRACT(DOW FROM i."timestamp") IN (0, 6)')
    elif day_type == "weekday":
        clauses.append('EXTRACT(DOW FROM i."timestamp") NOT IN (0, 6)')

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"""
        SELECT i.id, i.station_id, s.name AS station_name, s.district,
               i.lat, i.long, i.crime_type, i."timestamp",
               i.weapon_or_method, i.target_type, i.escape_pattern
        FROM incidents i
        JOIN stations s ON s.id = i.station_id
        {where_sql}
        ORDER BY i."timestamp" DESC
        LIMIT %s
    """
    params.append(limit)

    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
        conn.close()
        return {"count": len(rows), "incidents": rows}
    except Exception as e:
        import traceback
        return {"error": repr(e), "traceback": traceback.format_exc()}


@app.get("/api/station-stats")
def get_station_stats(
    crime_type: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
):
    """Per-station incident counts, for choropleth coloring of station catchments.

    Note: we don't have real district administrative boundary polygons (no shapefile
    for this hackathon), so 'choropleth' here colors each station's jurisdiction
    catchment circle by its incident density rather than filling true district
    borders. This is disclosed in the README/pitch — it's an honest approximation,
    not a claim of real administrative boundaries.
    """
    clauses, params = [], []
    if crime_type is not None:
        clauses.append("i.crime_type = %s")
        params.append(crime_type)
    if date_from is not None:
        clauses.append('i."timestamp" >= %s')
        params.append(date_from)
    if date_to is not None:
        clauses.append('i."timestamp" <= %s')
        params.append(date_to)
    where_sql = f"AND {' AND '.join(clauses)}" if clauses else ""

    query = f"""
        SELECT s.id, s.name, s.district, s.lat, s.long,
               COUNT(i.id) AS incident_count
        FROM stations s
        LEFT JOIN incidents i ON i.station_id = s.id {where_sql}
        GROUP BY s.id, s.name, s.district, s.lat, s.long
        ORDER BY incident_count DESC
    """
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
    conn.close()
    return {"stations": rows}


@app.get("/api/redzones")
def get_redzones(z_threshold: float = 2.0, current_window_weeks: int = 3):
    """Red-zone alerting: for each (station, crime_type) pair, bucket incidents into
    weekly counts. Compare the average weekly count over the most recent
    `current_window_weeks` weeks against the mean/std of all earlier weeks (the
    baseline). Flag the pair if the recent average exceeds baseline by more than
    z_threshold standard deviations.

    Important design note: we deliberately compare a recent WINDOW (not a single
    latest week) against a baseline that EXCLUDES that whole window. An earlier
    version compared only the single most recent week against "all other weeks" —
    but a real trend spike spans multiple weeks, so those spike weeks ended up
    inside their own baseline and diluted the z-score, hiding the anomaly. Comparing
    windows to a cleanly separated baseline avoids that.

    Requires at least current_window_weeks + 5 weeks of total history to establish a
    meaningful baseline.
    """
    try:
        conn = get_conn()
        with conn.cursor() as cur:
            cur.execute("""
                SELECT s.id AS station_id, s.name AS station_name, s.district,
                       i.crime_type,
                       date_trunc('week', i."timestamp") AS week,
                       COUNT(*) AS incident_count
                FROM incidents i
                JOIN stations s ON s.id = i.station_id
                GROUP BY s.id, s.name, s.district, i.crime_type, week
                ORDER BY s.id, i.crime_type, week
            """)
            rows = cur.fetchall()
        conn.close()

        import numpy as np
        from collections import defaultdict

        grouped = defaultdict(list)
        for r in rows:
            key = (r["station_id"], r["station_name"], r["district"], r["crime_type"])
            grouped[key].append((r["week"], r["incident_count"]))

        redzones = []
        for (station_id, station_name, district, crime_type), weeks in grouped.items():
            weeks.sort(key=lambda w: w[0])
            min_weeks_needed = current_window_weeks + 5
            if len(weeks) < min_weeks_needed:
                continue  # not enough history to establish a baseline

            current_weeks = weeks[-current_window_weeks:]
            baseline_weeks = weeks[:-current_window_weeks]

            baseline_counts = [w[1] for w in baseline_weeks]
            mean = float(np.mean(baseline_counts))
            std = float(np.std(baseline_counts))
            if std == 0:
                continue  # no variance to compute a meaningful z-score against

            current_avg = float(np.mean([w[1] for w in current_weeks]))
            z = (current_avg - mean) / std
            if z > z_threshold:
                redzones.append({
                    "station_id": station_id,
                    "station_name": station_name,
                    "district": district,
                    "crime_type": crime_type,
                    "current_window_weeks": current_window_weeks,
                    "current_avg_weekly_count": round(current_avg, 2),
                    "baseline_mean": round(mean, 2),
                    "baseline_std": round(std, 2),
                    "z_score": round(z, 2),
                })

        redzones.sort(key=lambda r: r["z_score"], reverse=True)
        return {"threshold": z_threshold, "current_window_weeks": current_window_weeks, "redzones": redzones}
    except Exception as e:
        import traceback
        return {"error": repr(e), "traceback": traceback.format_exc()}


@app.get("/api/mo-clusters")
def get_mo_clusters(min_incidents: int = 1):
    """MO clustering: groups suspects by cosine similarity of their weapon/target/
    escape-pattern/time-of-day pattern across their linked incidents. See
    mo_clustering.py for the threshold-validation note.
    """
    from mo_clustering import compute_mo_clusters
    conn = get_conn()
    clusters = compute_mo_clusters(conn, min_incidents=min_incidents)

    # Pull suspect names for display
    with conn.cursor() as cur:
        cur.execute("SELECT id, name FROM suspects WHERE id = ANY(%s)", (list(clusters.keys()),))
        names = {r["id"]: r["name"] for r in cur.fetchall()}
    conn.close()

    out = []
    for sid, info in clusters.items():
        out.append({"suspect_id": sid, "name": names.get(sid, f"Suspect {sid}"), **info})
    out.sort(key=lambda r: (r["cluster_id"], -r["incident_count"]))

    # Only surface clusters with more than one member — a cluster of size 1 isn't a
    # pattern, it's just an individual with no one to compare against.
    cluster_sizes = {}
    for r in out:
        cluster_sizes[r["cluster_id"]] = cluster_sizes.get(r["cluster_id"], 0) + 1
    multi_member_clusters = [r for r in out if cluster_sizes[r["cluster_id"]] > 1]

    return {
        "data_source": "simulation_demo",
        "source_notice": "Modus Operandi clustering is evaluated on high-resolution synthetic FIR pattern simulations. Official NCRB public crime records provide district-level statistics without individual suspect MO details to protect citizen privacy.",
        "total_suspects_clustered": len(out),
        "clusters_found": len(set(r["cluster_id"] for r in out)),
        "multi_member_clusters": multi_member_clusters,
    }


@app.get("/api/network")
def get_network(top_n_suspects: int = 12, max_incidents_per_suspect: int = 8, district: Optional[str] = None):
    """Returns a suspect/victim/station graph as nodes+links for react-force-graph.

    FILTERING DESIGN NOTE — this was changed after testing surfaced a real problem:
    an earlier version filtered by an absolute `min_suspect_incidents` threshold
    (e.g. >= 3 incidents). But this dataset has only 150 suspects across ~21,700
    incidents, so EVERY suspect has 100+ linked incidents — an absolute threshold
    filters out nobody, and the endpoint returned 458 nodes / 24,151 edges, which is
    unreadable in any force-directed graph. Fixed by switching to relative filtering:
    (1) `top_n_suspects` selects only the N most active suspects by incident count,
    which scales regardless of dataset size, and (2) `max_incidents_per_suspect`
    samples a bounded number of each suspect's incidents for edges, so the graph
    stays visually tractable even if a suspect has hundreds of linked incidents.
    This means the graph shows a representative sample of each top suspect's
    connections, not their full edge list — stated here and in the frontend legend.
    """
    from mo_clustering import compute_mo_clusters
    conn = get_conn()

    clusters = compute_mo_clusters(conn, min_incidents=1)

    clauses = []
    params = []
    if district:
        clauses.append("s.district = %s")
        params.append(district)
    where_sql = f"AND {' AND '.join(clauses)}" if clauses else ""

    with conn.cursor() as cur:
        # Pick the top N most active suspects (optionally within a district)
        cur.execute(f"""
            SELECT isx.suspect_id, COUNT(*) AS incident_count
            FROM incident_suspects isx
            JOIN incidents i ON i.id = isx.incident_id
            JOIN stations s ON s.id = i.station_id
            WHERE 1=1 {where_sql}
            GROUP BY isx.suspect_id
            ORDER BY incident_count DESC
            LIMIT %s
        """, params + [top_n_suspects])
        top_suspects = [r["suspect_id"] for r in cur.fetchall()]

        if not top_suspects:
            conn.close()
            return {"nodes": [], "links": [], "top_n_suspects": top_n_suspects}

        # For each top suspect, sample up to max_incidents_per_suspect incidents
        cur.execute("""
            SELECT isx.suspect_id, sus.name AS suspect_name,
                   i.id AS incident_id, i.crime_type, i.station_id, s.name AS station_name,
                   ivx.victim_id, vic.name AS victim_name,
                   ROW_NUMBER() OVER (PARTITION BY isx.suspect_id ORDER BY i."timestamp" DESC) AS rn
            FROM incident_suspects isx
            JOIN suspects sus ON sus.id = isx.suspect_id
            JOIN incidents i ON i.id = isx.incident_id
            JOIN stations s ON s.id = i.station_id
            LEFT JOIN incident_victims ivx ON ivx.incident_id = i.id
            LEFT JOIN victims vic ON vic.id = ivx.victim_id
            WHERE isx.suspect_id = ANY(%s)
        """, (top_suspects,))
        all_rows = cur.fetchall()
    conn.close()

    # Apply the per-suspect incident cap in Python (simplest correct way to combine
    # "top N distinct incidents per suspect" with "may have multiple victim rows
    # per incident" from the LEFT JOIN)
    seen_incidents_per_suspect = defaultdict(set)
    rows = []
    for r in all_rows:
        key = (r["suspect_id"], r["incident_id"])
        if r["incident_id"] not in seen_incidents_per_suspect[r["suspect_id"]]:
            if len(seen_incidents_per_suspect[r["suspect_id"]]) >= max_incidents_per_suspect:
                continue
            seen_incidents_per_suspect[r["suspect_id"]].add(r["incident_id"])
        rows.append(r)

    nodes = {}
    edges = {}

    def add_node(node_id, node_type, label, extra=None):
        if node_id not in nodes:
            nodes[node_id] = {"id": node_id, "type": node_type, "label": label, **(extra or {})}

    def add_edge(source, target, relation):
        key = (source, target, relation)
        if key not in edges:
            edges[key] = {"source": source, "target": target, "relation": relation, "weight": 0}
        edges[key]["weight"] += 1

    for r in rows:
        suspect_node = f"suspect-{r['suspect_id']}"
        station_node = f"station-{r['station_id']}"
        cluster_info = clusters.get(r["suspect_id"], {})
        add_node(suspect_node, "suspect", r["suspect_name"], {
            "cluster_id": cluster_info.get("cluster_id"),
            "dominant_weapon": cluster_info.get("dominant_weapon"),
            "total_incident_count": cluster_info.get("incident_count"),
        })
        add_node(station_node, "station", r["station_name"])
        add_edge(suspect_node, station_node, "occurred_at")

        if r["victim_id"] is not None:
            victim_node = f"victim-{r['victim_id']}"
            add_node(victim_node, "victim", r["victim_name"])
            add_edge(suspect_node, victim_node, "victim_of")

    return {
        "data_source": "simulation_demo",
        "source_notice": "Offender network and repeat suspect linkages are displayed in simulation demo mode. Official NCRB public datasets provide district-level aggregates and omit individual FIR suspect identities to safeguard privacy under Indian law.",
        "nodes": list(nodes.values()),
        "links": list(edges.values()),
        "top_n_suspects": top_n_suspects,
        "max_incidents_per_suspect": max_incidents_per_suspect,
    }


@app.get("/api/ground-truth-recovery")
def get_ground_truth_recovery():
    """Compares observed data patterns and model-predicted patterns against the
    known ground-truth multipliers injected in generate_data.py. See
    ground_truth_recovery.py for why data-level and model-level recovery are kept
    honestly separate rather than blurred together.
    """
    import json
    gtr_path = os.path.join(BASE_DIR, "precomputed_gtr.json")
    if os.path.exists(gtr_path):
        with open(gtr_path, "r") as f:
            gtr_data = json.load(f)
            gtr_data["evaluation_benchmark"] = "simulation_ground_truth_validation"
            gtr_data["data_notice"] = "Evaluates algorithmic pattern recovery against known synthetic ground-truth benchmarks. The authentic NCRB government dataset serves as the real-world historical baseline."
            return gtr_data

    load_model_lazy()
    if _risk_model is None:
        return {"error": "Risk model not loaded."}

    from ground_truth_recovery import compute_data_level_recovery, compute_model_level_recovery
    conn = get_conn()
    data_level = compute_data_level_recovery(conn)
    conn.close()

    import pandas as pd
    df_path = os.path.join(BASE_DIR, "model_df.pkl")
    model_df = pd.read_pickle(df_path)
    model_level = compute_model_level_recovery(_risk_model, model_df, FEATURE_COLS)

    return {"data_level": data_level, "model_level": model_level}


@app.get("/api/risk-score")
def get_risk_scores():
    """Latest predicted weekly risk score for every station, with SHAP-based
    explanation grouped into human-readable categories. See ml/risk_scoring.ipynb
    for how this model was trained and validated against known injected patterns
    before being wired in here.
    """
    import json
    scores_path = os.path.join(BASE_DIR, "precomputed_risk_scores.json")
    if os.path.exists(scores_path):
        with open(scores_path, "r") as f:
            risk_data = json.load(f)
            risk_data["model_scope"] = "station_level_xgboost_simulation"
            risk_data["data_notice"] = "Trained on high-resolution station-week simulation features. Public NCRB datasets provide annual district aggregates without weekly timestamps or station geocodes."
            return risk_data

    load_model_lazy()
    if _risk_model is None:
        return {"error": "Risk model not loaded. Run the ml/ notebook first and copy risk_model.json, feature_cols.json into backend/."}

    from risk_features import build_model_features
    from risk_explain import aggregate_shap_to_groups, generate_explanation_sentence
    conn = get_conn()
    df = build_model_features(conn)
    conn.close()

    if df.empty:
        return {"stations": []}

    df["predicted"] = _risk_model.predict(df[FEATURE_COLS])
    shap_values = _shap_explainer.shap_values(df[FEATURE_COLS])
    exp_val = _shap_explainer.expected_value
    import numpy as np
    base_value = float(np.ravel(exp_val)[0]) if hasattr(exp_val, "__iter__") else float(exp_val)

    # Take the most recent week per station as the "current" risk score
    latest = df.sort_values("week").groupby("station_id").tail(1)

    results = []
    for idx, row in latest.iterrows():
        pos = df.index.get_loc(idx)
        grouped = aggregate_shap_to_groups(shap_values[pos], FEATURE_COLS)
        sentence = generate_explanation_sentence(row["station_name"], row["predicted"], base_value, grouped)
        results.append({
            "station_id": int(row["station_id"]),
            "station_name": row["station_name"],
            "district": row["district"],
            "week": row["week"].isoformat(),
            "predicted_weekly_risk": round(float(row["predicted"]), 1),
            "baseline": round(base_value, 1),
            "shap_groups": grouped,
            "explanation": sentence,
        })

    results.sort(key=lambda r: r["predicted_weekly_risk"], reverse=True)
    return {"baseline": round(base_value, 1), "stations": results}


@app.get("/api/stations")
def get_stations():
    """Return station jurisdictions as GeoJSON FeatureCollection."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, name, district, lat, long,
                   ST_AsGeoJSON(jurisdiction_polygon) AS geom
            FROM stations
        """)
        rows = cur.fetchall()
    conn.close()

    features = []
    for r in rows:
        import json
        features.append({
            "type": "Feature",
            "geometry": json.loads(r["geom"]),
            "properties": {
                "id": r["id"], "name": r["name"], "district": r["district"],
                "lat": r["lat"], "long": r["long"],
            },
        })
    return {"type": "FeatureCollection", "features": features}


@app.get("/api/districts")
def get_districts():
    """Distinct districts and crime types — for populating frontend filter dropdowns."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT district FROM stations ORDER BY district")
        districts = [r["district"] for r in cur.fetchall()]
        cur.execute("SELECT DISTINCT crime_type FROM incidents ORDER BY crime_type")
        crime_types = [r["crime_type"] for r in cur.fetchall()]
    conn.close()
    return {"districts": districts, "crime_types": crime_types}


@app.get("/api/crime-intelligence-stats")
def get_crime_intelligence_stats(district: Optional[str] = None):
    """
    Returns aggregated metrics computed from authentic incident timestamps and records
    specifically for the redesigned Criminal Intelligence dashboard view:
    1. Monthly incident volume (Jan 2024–Dec 2025) with dynamic typical level and spike callouts.
    2. Day vs Night percentage share per crime category (05:00–21:59 vs 22:00–04:59).
    3. Weekday vs Weekend pattern divergence per crime category (Mon–Fri vs Sat–Sun).
    4. Hour-wise heatmap matrix across all days of the week (Mon–Sun) and hours (0–23).
    5. Crime category distribution with counts and percentage shares.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            clauses = []
            params = []
            if district and district.strip() and district.strip().lower() not in (
                "all", "all districts", "all 36 maharashtra districts", "entire maharashtra state", "all maharashtra districts"
            ):
                clauses.append("s.district = %s")
                params.append(district.strip())
            where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

            # 1. Monthly (24 months Jan 2024 - Dec 2025)
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
            
            # Map of queried rows
            row_by_ym = {r["ym"]: (r["label"], r["total"]) for r in monthly_rows}
            
            # Standard 24 months sequence from 2024-01 to 2025-12
            all_yms = []
            for yr in (2024, 2025):
                for mo in range(1, 13):
                    all_yms.append(f"{yr}-{mo:02d}")
            
            month_names = {
                "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr",
                "05": "May", "06": "Jun", "07": "Jul", "08": "Aug",
                "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec"
            }
            
            totals = [row_by_ym[ym][1] for ym in all_yms if ym in row_by_ym]
            if totals:
                sorted_totals = sorted(totals)
                n = len(sorted_totals)
                median = sorted_totals[n // 2] if n % 2 != 0 else (sorted_totals[n // 2 - 1] + sorted_totals[n // 2]) / 2.0
                avg_monthly = round(sum(totals) / len(totals), 1)
                typical = int(round(avg_monthly))
            else:
                median = 0
                avg_monthly = 0
                typical = 0

            monthly_data = []
            highest_month = None
            lowest_month = None
            
            for ym in all_yms:
                yr_part, mo_part = ym.split("-")
                label = f"{month_names[mo_part]} '{yr_part[2:]}"
                tot = row_by_ym.get(ym, (label, 0))[1]
                
                is_spike = tot > (typical * 1.12) if typical > 0 else False
                spike_diff = int(round(((tot - typical) / typical) * 100)) if typical > 0 else 0
                spike_label = f"Elevated volume (+{spike_diff}% vs avg)" if is_spike else None
                
                m_obj = {
                    "month": label,
                    "ym": ym,
                    "total": tot,
                    "typical": typical,
                    "average": avg_monthly,
                    "isSpike": is_spike,
                    "spikeLabel": spike_label
                }
                monthly_data.append(m_obj)
                
                if tot > 0:
                    if highest_month is None or tot > highest_month["total"]:
                        highest_month = m_obj
                    if lowest_month is None or tot < lowest_month["total"]:
                        lowest_month = m_obj

            # 2. Day vs Night (Day: 05:00-21:59, Night: 22:00-04:59)
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
            total_day_all = sum(r["day_cnt"] for r in day_night_rows)
            total_night_all = sum(r["night_cnt"] for r in day_night_rows)
            total_diurnal = total_day_all + total_night_all

            top_night_crime = None
            for r in day_night_rows:
                tot = r["total"]
                day_c = r["day_cnt"]
                night_c = r["night_cnt"]
                if tot > 0:
                    dp = round(day_c * 100.0 / tot, 1)
                    np = round(100.0 - dp, 1)
                else:
                    dp, np = 0, 0
                
                item = {
                    "crime": r["crime_type"],
                    "day": dp,
                    "night": np,
                    "dayCount": day_c,
                    "nightCount": night_c,
                    "total": tot
                }
                day_night_data.append(item)
                if top_night_crime is None or np > top_night_crime["night"]:
                    if tot >= 50:  # meaningful sample threshold
                        top_night_crime = item

            # 3. Weekday vs Weekend (Mon-Fri vs Sat-Sun)
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
            top_weekend_surge = None

            for r in wk_rows:
                tot = r["total"]
                wk_c = r["weekday_cnt"]
                we_c = r["weekend_cnt"]
                rate_wk = round(wk_c / 5.0, 1)
                rate_we = round(we_c / 2.0, 1)
                tot_rate = rate_wk + rate_we
                if tot_rate > 0:
                    norm_wk = round(rate_wk * 100.0 / tot_rate, 1)
                    norm_we = round(100.0 - norm_wk, 1)
                else:
                    norm_wk, norm_we = 50.0, 50.0

                item = {
                    "crime": r["crime_type"],
                    "weekday": norm_wk,
                    "weekend": norm_we,
                    "weekdayCount": wk_c,
                    "weekendCount": we_c,
                    "weekdayRate": rate_wk,
                    "weekendRate": rate_we,
                    "total": tot
                }
                weekend_data.append(item)
                if top_weekend_surge is None or norm_we > top_weekend_surge["weekend"]:
                    if tot >= 50:
                        top_weekend_surge = item

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
            day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            dow_to_row = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6}
            heatmap_matrix = [[0 for _ in range(24)] for _ in range(7)]
            
            peak_val = 0
            peak_day = "Mon"
            peak_hr = 0
            
            for r in hm_rows:
                row_idx = dow_to_row.get(r["dow"], 0)
                hr = r["hr"]
                cnt = r["cnt"]
                heatmap_matrix[row_idx][hr] = cnt
                if cnt > peak_val:
                    peak_val = cnt
                    peak_day = day_names[row_idx]
                    peak_hr = hr

            all_cell_counts = [cnt for row in heatmap_matrix for cnt in row]
            max_cell = max(all_cell_counts) if all_cell_counts else 0
            min_cell = min(all_cell_counts) if all_cell_counts else 0
            avg_cell = round(sum(all_cell_counts) / len(all_cell_counts), 1) if all_cell_counts else 0

            heatmap_data = {
                "days": day_names,
                "hours": list(range(24)),
                "matrix": heatmap_matrix,
                "min": min_cell,
                "max": max_cell,
                "average": avg_cell,
                "peakDay": peak_day,
                "peakHour": f"{peak_hr:02d}:00",
                "peakCount": peak_val
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
            total_incidents = sum(r["cnt"] for r in cat_rows)
            cat_distribution = []
            
            # Palette matching theme
            cat_colors = {
                "Theft": "#20C8F4",
                "Vehicle Theft": "#3987F5",
                "Assault": "#F0444D",
                "Burglary": "#9257F6",
                "Chain Snatching": "#FF8A24",
                "Cybercrime": "#06B6D4",
                "Robbery": "#E11D48"
            }
            default_colors = ["#20C8F4", "#3987F5", "#9257F6", "#FF8A24", "#F0444D", "#10B981", "#EAB308"]
            
            for idx, r in enumerate(cat_rows):
                pct = round(r["cnt"] * 100.0 / total_incidents, 1) if total_incidents > 0 else 0
                cat_distribution.append({
                    "name": r["crime_type"],
                    "count": r["cnt"],
                    "share": pct,
                    "color": cat_colors.get(r["crime_type"], default_colors[idx % len(default_colors)])
                })

            top2_share = round(sum(c["share"] for c in cat_distribution[:2]), 1) if len(cat_distribution) >= 2 else 0
            top2_names = " and ".join(c["name"] for c in cat_distribution[:2]) if len(cat_distribution) >= 2 else ""

            # Construct transparent, data-grounded insights
            monthly_diff_pct = 0
            if highest_month and avg_monthly > 0:
                monthly_diff_pct = round(((highest_month["total"] - avg_monthly) / avg_monthly) * 100, 1)

            insights = {
                "top2Categories": top2_names,
                "top2Share": top2_share,
                "typicalMonthlyFormatted": f"{typical:,}",
                "averageMonthlyFormatted": f"{avg_monthly:,.1f}",
                "totalIncidentsFormatted": f"{total_incidents:,}",
                "highestMonth": highest_month["month"] if highest_month else "N/A",
                "highestMonthCount": highest_month["total"] if highest_month else 0,
                "highestMonthDiffPct": monthly_diff_pct,
                "monthlyTakeaway": (
                    f"Peak volume was recorded in {highest_month['month']} ({highest_month['total']:,} incidents, +{monthly_diff_pct}% compared to the 24-month average of {avg_monthly:,.0f})."
                    if highest_month and avg_monthly > 0 else "Incident data evenly distributed across the 24-month horizon."
                ),
                "diurnalTakeaway": (
                    f"{top_night_crime['crime']} exhibits highest nocturnal concentration ({top_night_crime['night']}% night vs {top_night_crime['day']}% day), whereas overall daytime volume accounts for {round(total_day_all*100.0/total_diurnal, 1) if total_diurnal > 0 else 0}% of all incidents."
                    if top_night_crime else "Standard diurnal distribution across reporting periods."
                ),
                "weekendTakeaway": (
                    f"{top_weekend_surge['crime']} records highest normalized surge on weekends ({top_weekend_surge['weekend']}% weekend rate vs {top_weekend_surge['weekday']}% weekday rate)."
                    if top_weekend_surge else "Daily crime incidence rates remain consistent across weekdays and weekends."
                ),
                "heatmapTakeaway": (
                    f"Highest concentration occurs on {peak_day} at {peak_hr:02d}:00 with {peak_val:,} logged incidents. Daytime hours (05:00–21:00) maintain consistently elevated activity."
                    if peak_val > 0 else "Heatmap reflects distributed incidence pattern."
                )
            }

            return {
                "status": "ok",
                "district": district or "Entire Maharashtra State",
                "totalIncidents": total_incidents,
                "typicalMonthly": typical,
                "averageMonthly": avg_monthly,
                "diurnalTotals": {
                    "dayCount": total_day_all,
                    "nightCount": total_night_all,
                    "dayPct": round(total_day_all * 100.0 / total_diurnal, 1) if total_diurnal > 0 else 0,
                    "nightPct": round(total_night_all * 100.0 / total_diurnal, 1) if total_diurnal > 0 else 0
                },
                "monthlyTrend": monthly_data,
                "dayNight": day_night_data,
                "weekdayWeekend": weekend_data,
                "heatmap": heatmap_data,
                "categoryDistribution": cat_distribution,
                "insights": insights
            }
    finally:
        conn.close()



@app.get("/api/district-comparison")
def get_district_comparison(source: str = Query(default="real", regex="^(real|synthetic)$")):
    """Aggregated district comparison and ranking metrics across Maharashtra districts.
    source='real' uses authentic National Crime Records Bureau (NCRB) government data (2001-2012).
    source='synthetic' uses the demonstration station FIR simulation dataset.
    """
    import json
    risk_scores_by_station = {}
    risk_scores_by_district = defaultdict(list)
    risk_path = os.path.join(os.path.dirname(__file__), "precomputed_risk_scores.json")
    if os.path.exists(risk_path):
        try:
            with open(risk_path, "r") as f:
                risk_data = json.load(f)
                for s in risk_data.get("stations", []):
                    risk_scores_by_station[s["station_id"]] = s["predicted_weekly_risk"]
                    risk_scores_by_district[s["district"]].append(s["predicted_weekly_risk"])
        except Exception:
            pass

    conn = get_conn()
    with conn.cursor() as cur:
        # Station details per district (for station cards in both modes)
        cur.execute("""
            SELECT s.district, s.id, s.name, s.lat, s.long, COUNT(i.id) AS incident_count
            FROM stations s
            LEFT JOIN incidents i ON i.station_id = s.id
            GROUP BY s.district, s.id, s.name, s.lat, s.long
            ORDER BY s.district, incident_count DESC;
        """)
        station_rows = cur.fetchall()

        stations_by_dist = defaultdict(list)
        for r in station_rows:
            sid = r["id"]
            r_score = risk_scores_by_station.get(sid, 0.0)
            stations_by_dist[r["district"]].append({
                "id": sid,
                "name": r["name"],
                "lat": r["lat"],
                "long": r["long"],
                "incident_count": r["incident_count"],
                "predicted_weekly_risk": r_score,
            })

        if source == "real":
            # --- AUTHENTIC NCRB GOVERNMENT DATA PIPELINE ---
            cur.execute("""
                SELECT 
                    rdc.normalized_district AS district,
                    SUM(rdc.total_ipc_crimes) AS total_incidents,
                    ROUND(SUM(rdc.total_ipc_crimes)::numeric / 12.0, 1) AS annual_average,
                    COUNT(DISTINCT rdc.year) AS reporting_years
                FROM real_district_crimes rdc
                WHERE NOT rdc.is_state_total
                GROUP BY rdc.normalized_district
                ORDER BY total_incidents DESC;
            """)
            dist_rows = cur.fetchall()

            cur.execute("""
                SELECT 
                    normalized_district AS district,
                    SUM(theft) AS theft,
                    SUM(auto_theft) AS auto_theft,
                    SUM(burglary) AS burglary,
                    SUM(robbery) AS robbery,
                    SUM(hurt_grievous_hurt) AS assault,
                    SUM(riots) AS riots,
                    SUM(cheating) AS cheating,
                    SUM(murder) AS murder
                FROM real_district_crimes
                WHERE NOT is_state_total
                GROUP BY normalized_district;
            """)
            crime_rows = cur.fetchall()

            cur.execute("""
                SELECT normalized_district AS district, year::text AS month, SUM(total_ipc_crimes) AS count
                FROM real_district_crimes
                WHERE NOT is_state_total
                GROUP BY normalized_district, year
                ORDER BY normalized_district, year;
            """)
            monthly_rows = cur.fetchall()

            crimes_by_dist = {}
            dominant_by_dist = {}
            for r in crime_rows:
                d = r["district"]
                c_dict = {
                    "Theft": int(r["theft"] or 0),
                    "Vehicle Theft": int(r["auto_theft"] or 0),
                    "Burglary": int(r["burglary"] or 0),
                    "Robbery": int(r["robbery"] or 0),
                    "Assault": int(r["assault"] or 0),
                    "Riots": int(r["riots"] or 0),
                    "Cheating": int(r["cheating"] or 0),
                    "Murder": int(r["murder"] or 0),
                }
                crimes_by_dist[d] = c_dict
                dom_crime = max(c_dict.items(), key=lambda kv: kv[1])
                dominant_by_dist[d] = {"crime_type": dom_crime[0], "count": dom_crime[1]}

            months_by_dist = defaultdict(list)
            for r in monthly_rows:
                months_by_dist[r["district"]].append({"month": r["month"], "count": r["count"]})

            # Calculate 12-year trajectory (2001 vs 2012) for each district
            trajectory_by_dist = {}
            for d, m_list in months_by_dist.items():
                if len(m_list) >= 2:
                    first_val = m_list[0]["count"]
                    last_val = m_list[-1]["count"]
                    net_chg = last_val - first_val
                    pct_chg = round((net_chg / first_val * 100), 1) if first_val > 0 else 0
                    trajectory_by_dist[d] = {
                        "start_year": int(m_list[0]["month"]),
                        "start_count": first_val,
                        "end_year": int(m_list[-1]["month"]),
                        "end_count": last_val,
                        "net_change": net_chg,
                        "pct_change": pct_chg,
                    }
                else:
                    trajectory_by_dist[d] = {
                        "start_year": 2001, "start_count": 0,
                        "end_year": 2012, "end_count": 0,
                        "net_change": 0, "pct_change": 0
                    }

            district_map = {}
            rankings = []
            total_state_incidents = sum(r["total_incidents"] for r in dist_rows)

            for rank_idx, r in enumerate(dist_rows, 1):
                dname = r["district"]
                tot = int(r["total_incidents"] or 0)
                annual_avg = float(r["annual_average"] or round(tot / 12.0, 1))
                c_dict = crimes_by_dist.get(dname, {})
                dom = dominant_by_dist.get(dname, {"crime_type": "Theft", "count": 0})
                dom_pct = round((dom["count"] / tot * 100), 1) if tot > 0 else 0
                traj = trajectory_by_dist.get(dname, {})

                if tot >= 150000:
                    risk_level = "High"
                elif tot >= 80000:
                    risk_level = "Elevated"
                elif tot >= 40000:
                    risk_level = "Moderate"
                else:
                    risk_level = "Standard"

                dist_obj = {
                    "rank": rank_idx,
                    "district": dname,
                    "total_incidents": tot,
                    "annual_average": annual_avg,
                    "reporting_years": int(r["reporting_years"] or 12),
                    "station_count": None,        # Exclusively None in NCRB real data
                    "incident_density": None,     # Exclusively None in NCRB real data
                    "crime_breakdown": c_dict,
                    "dominant_crime": {
                        "crime_type": dom["crime_type"],
                        "count": dom["count"],
                        "percentage": dom_pct
                    },
                    "monthly_trends": months_by_dist.get(dname, []),
                    "historical_trajectory": traj,
                    "stations": [],               # Exclusively empty in NCRB real data
                    "top_station": None,          # Exclusively None in NCRB real data
                    "avg_predicted_risk": None,   # Exclusively None in NCRB real data
                    "risk_level": risk_level,
                    "day_night_split": {
                        "day": 0,
                        "night": 0,
                        "night_pct": 0,
                        "available": False,
                        "note": "NCRB Annual Reports do not record hourly splits"
                    },
                    "weekend_split": {
                        "weekday": 0,
                        "weekend": 0,
                        "weekend_pct": 0,
                        "available": False,
                        "note": "NCRB Annual Reports do not record daily splits"
                    }
                }
                district_map[dname] = dist_obj
                rankings.append({
                    "rank": rank_idx,
                    "district": dname,
                    "total_incidents": tot,
                    "annual_average": annual_avg,
                    "station_count": None,
                    "incident_density": None,
                    "dominant_crime": dom["crime_type"],
                    "dominant_crime_count": dom["count"],
                    "dominant_crime_pct": dom_pct,
                    "top_station": None,
                    "top_station_incidents": None,
                    "avg_predicted_risk": None,
                    "risk_level": risk_level,
                    "state_percentage": round((tot / total_state_incidents) * 100, 1) if total_state_incidents > 0 else 0,
                    "trajectory_pct": traj.get("pct_change", 0),
                })

            conn.close()
            return {
                "status": "ok",
                "data_source": "real_ncrb",
                "source_attribution": "National Crime Records Bureau (NCRB), Ministry of Home Affairs, Government of India",
                "dataset_years": "2001-2012",
                "total_state_incidents": total_state_incidents,
                "total_districts": len(dist_rows),
                "total_stations": None,
                "districts": district_map,
                "rankings": rankings,
                "crime_types": ["Theft", "Vehicle Theft", "Burglary", "Robbery", "Assault", "Riots", "Cheating", "Murder"],
            }

        else:
            # --- SYNTHETIC INCIDENTS BACKWARD COMPATIBILITY MODE ---
            cur.execute("""
                SELECT 
                    s.district,
                    COUNT(i.id) AS total_incidents,
                    COUNT(DISTINCT s.id) AS station_count,
                    ROUND(COUNT(i.id)::numeric / NULLIF(COUNT(DISTINCT s.id), 0), 1) AS incident_density
                FROM stations s
                LEFT JOIN incidents i ON i.station_id = s.id
                GROUP BY s.district
                ORDER BY total_incidents DESC;
            """)
            dist_rows = cur.fetchall()

            cur.execute("""
                SELECT s.district, i.crime_type, COUNT(i.id) AS count
                FROM stations s
                JOIN incidents i ON i.station_id = s.id
                GROUP BY s.district, i.crime_type
                ORDER BY s.district, count DESC;
            """)
            crime_rows = cur.fetchall()

            cur.execute("""
                SELECT s.district, TO_CHAR(i."timestamp", 'YYYY-MM') AS month, COUNT(i.id) AS count
                FROM stations s
                JOIN incidents i ON i.station_id = s.id
                GROUP BY s.district, month
                ORDER BY s.district, month;
            """)
            monthly_rows = cur.fetchall()

            cur.execute("""
                SELECT 
                    s.district,
                    COUNT(CASE WHEN (EXTRACT(HOUR FROM i."timestamp") >= 22 OR EXTRACT(HOUR FROM i."timestamp") < 5) THEN 1 END) AS night_count,
                    COUNT(CASE WHEN (EXTRACT(HOUR FROM i."timestamp") >= 5 AND EXTRACT(HOUR FROM i."timestamp") < 22) THEN 1 END) AS day_count,
                    COUNT(CASE WHEN EXTRACT(DOW FROM i."timestamp") IN (0, 6) THEN 1 END) AS weekend_count,
                    COUNT(CASE WHEN EXTRACT(DOW FROM i."timestamp") NOT IN (0, 6) THEN 1 END) AS weekday_count
                FROM stations s
                JOIN incidents i ON i.station_id = s.id
                GROUP BY s.district;
            """)
            temporal_rows = cur.fetchall()

            conn.close()

            crimes_by_dist = defaultdict(dict)
            dominant_by_dist = {}
            for r in crime_rows:
                d = r["district"]
                ct = r["crime_type"]
                cnt = r["count"]
                crimes_by_dist[d][ct] = cnt
                if d not in dominant_by_dist:
                    dominant_by_dist[d] = {"crime_type": ct, "count": cnt}

            months_by_dist = defaultdict(list)
            for r in monthly_rows:
                months_by_dist[r["district"]].append({"month": r["month"], "count": r["count"]})

            temporal_by_dist = {r["district"]: r for r in temporal_rows}

            district_map = {}
            rankings = []
            total_state_incidents = sum(r["total_incidents"] for r in dist_rows)

            for rank_idx, r in enumerate(dist_rows, 1):
                dname = r["district"]
                tot = r["total_incidents"]
                st_cnt = r["station_count"]
                dens = float(r["incident_density"] or 0)
                c_dict = crimes_by_dist.get(dname, {})
                dom = dominant_by_dist.get(dname, {"crime_type": "N/A", "count": 0})
                dom_pct = round((dom["count"] / tot * 100), 1) if tot > 0 else 0

                st_list = stations_by_dist.get(dname, [])
                top_station = st_list[0] if st_list else None

                r_list = risk_scores_by_district.get(dname, [])
                avg_risk = round(sum(r_list) / len(r_list), 1) if r_list else round(dens / 100.0, 1)

                if avg_risk >= 14.0 or dens >= 1100:
                    risk_level = "High"
                elif avg_risk >= 11.0 or dens >= 900:
                    risk_level = "Elevated"
                elif avg_risk >= 8.0 or dens >= 700:
                    risk_level = "Moderate"
                else:
                    risk_level = "Standard"

                temp = temporal_by_dist.get(dname, {})
                day_cnt = temp.get("day_count", 0)
                night_cnt = temp.get("night_count", 0)
                weekend_cnt = temp.get("weekend_count", 0)
                weekday_cnt = temp.get("weekday_count", 0)

                dist_obj = {
                    "rank": rank_idx,
                    "district": dname,
                    "total_incidents": tot,
                    "station_count": st_cnt,
                    "incident_density": dens,
                    "crime_breakdown": c_dict,
                    "dominant_crime": {
                        "crime_type": dom["crime_type"],
                        "count": dom["count"],
                        "percentage": dom_pct
                    },
                    "monthly_trends": months_by_dist.get(dname, []),
                    "stations": st_list,
                    "top_station": top_station,
                    "avg_predicted_risk": avg_risk,
                    "risk_level": risk_level,
                    "day_night_split": {
                        "day": day_cnt,
                        "night": night_cnt,
                        "night_pct": round(night_cnt / tot * 100, 1) if tot > 0 else 0,
                        "available": True,
                    },
                    "weekend_split": {
                        "weekday": weekday_cnt,
                        "weekend": weekend_cnt,
                        "weekend_pct": round(weekend_cnt / tot * 100, 1) if tot > 0 else 0,
                        "available": True,
                    }
                }
                district_map[dname] = dist_obj
                rankings.append({
                    "rank": rank_idx,
                    "district": dname,
                    "total_incidents": tot,
                    "station_count": st_cnt,
                    "incident_density": dens,
                    "dominant_crime": dom["crime_type"],
                    "dominant_crime_pct": dom_pct,
                    "top_station": top_station["name"] if top_station else "N/A",
                    "top_station_incidents": top_station["incident_count"] if top_station else 0,
                    "avg_predicted_risk": avg_risk,
                    "risk_level": risk_level,
                })

            return {
                "status": "ok",
                "data_source": "synthetic_simulation",
                "source_attribution": "Synthetic FIR Simulation Pipeline (for development/testing)",
                "total_state_incidents": total_state_incidents,
                "total_districts": len(dist_rows),
                "total_stations": sum(r["station_count"] for r in dist_rows),
                "districts": district_map,
                "rankings": rankings,
                "crime_types": CRIME_TYPES,
            }


# -------------------------------------------------------------
# DEDICATED REAL CRIME DATASET ENDPOINTS (NCRB GOVT DATA)
# -------------------------------------------------------------

@app.get("/api/real-crime/summary")
def get_real_crime_summary():
    """Summary metrics of the official NCRB Maharashtra dataset."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                COUNT(*) AS total_rows,
                COUNT(DISTINCT normalized_district) AS total_districts,
                MIN(year) AS min_year,
                MAX(year) AS max_year,
                SUM(total_ipc_crimes) AS total_state_crimes,
                SUM(theft) AS total_theft,
                SUM(auto_theft) AS total_auto_theft,
                SUM(burglary) AS total_burglary,
                SUM(robbery) AS total_robbery,
                SUM(hurt_grievous_hurt) AS total_assault,
                SUM(riots) AS total_riots,
                SUM(cheating) AS total_cheating,
                SUM(murder) AS total_murder
            FROM real_district_crimes
            WHERE NOT is_state_total;
        """)
        row = cur.fetchone()
    conn.close()

    if row:
        crime_totals = {
            "Theft": int(row["total_theft"] or 0),
            "Vehicle Theft": int(row["total_auto_theft"] or 0),
            "Burglary": int(row["total_burglary"] or 0),
            "Assault": int(row["total_assault"] or 0),
            "Riots": int(row["total_riots"] or 0),
            "Cheating": int(row["total_cheating"] or 0),
            "Robbery": int(row["total_robbery"] or 0),
            "Murder": int(row["total_murder"] or 0),
        }
        dom_cat = max(crime_totals.items(), key=lambda kv: kv[1])
        tot_state = int(row["total_state_crimes"] or 1)
        row["dominant_category"] = {
            "name": dom_cat[0],
            "count": dom_cat[1],
            "percentage": round(dom_cat[1] / tot_state * 100, 1),
            "source": "NCRB Official (2001–2012)"
        }

    return {
        "status": "ok",
        "dataset_title": "District-wise Crimes Committed Under the Indian Penal Code (IPC)",
        "source_publisher": "National Crime Records Bureau (NCRB), Ministry of Home Affairs, Government of India",
        "source_url": "https://www.kaggle.com/datasets/rajanand/crime-in-india / data.gov.in",
        "state": "Maharashtra",
        "summary": row,
    }


@app.get("/api/real-crime/districts")
def get_real_crime_districts():
    """District-wise breakdown from the authentic NCRB dataset."""
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                normalized_district AS district,
                SUM(total_ipc_crimes) AS total_crimes,
                ROUND(AVG(total_ipc_crimes), 1) AS annual_average,
                SUM(theft) AS theft,
                SUM(auto_theft) AS auto_theft,
                SUM(burglary) AS burglary,
                SUM(robbery) AS robbery,
                SUM(hurt_grievous_hurt) AS assault,
                SUM(riots) AS riots,
                SUM(cheating) AS cheating,
                SUM(murder) AS murder
            FROM real_district_crimes
            WHERE NOT is_state_total
            GROUP BY normalized_district
            ORDER BY total_crimes DESC;
        """)
        rows = cur.fetchall()
    conn.close()
    return {"districts": rows, "count": len(rows)}


@app.get("/api/real-crime/trends")
def get_real_crime_trends(district: Optional[str] = None):
    """Year-by-year historical crime trends (2001-2012) from NCRB data."""
    conn = get_conn()
    clauses = ["NOT is_state_total"]
    params = []
    if district:
        clauses.append("normalized_district = %s")
        params.append(district)
    where_sql = "WHERE " + " AND ".join(clauses)
    query = f"""
        SELECT 
            year,
            SUM(total_ipc_crimes) AS total_crimes,
            SUM(theft) AS theft,
            SUM(auto_theft) AS auto_theft,
            SUM(burglary) AS burglary,
            SUM(robbery) AS robbery,
            SUM(hurt_grievous_hurt) AS assault,
            SUM(riots) AS riots,
            SUM(cheating) AS cheating,
            SUM(murder) AS murder
        FROM real_district_crimes
        {where_sql}
        GROUP BY year
        ORDER BY year;
    """
    with conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()
    conn.close()
    return {"district": district or "All Maharashtra Districts", "trends": rows}


@app.get("/api/real-crime/records")
def get_real_crime_records(
    district: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = Query(default=50, le=1000),
    page: int = Query(default=1, ge=1),
):
    """Filterable, paginated query of the real government records for demonstration."""
    offset = (page - 1) * limit
    clauses = []
    params = []
    if district:
        clauses.append("(normalized_district = %s OR raw_district ILIKE %s)")
        params.extend([district, f"%{district}%"])
    if year:
        clauses.append("year = %s")
        params.append(year)
    where_sql = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(f"SELECT count(*) FROM real_district_crimes {where_sql}", params)
        total_records = cur.fetchone()["count"]

        cur.execute(
            f"""
            SELECT id, state_ut, raw_district, normalized_district, is_state_total, year,
                   murder, attempt_to_murder, robbery, burglary, theft, auto_theft,
                   riots, cheating, hurt_grievous_hurt, assault_on_women, total_ipc_crimes
            FROM real_district_crimes
            {where_sql}
            ORDER BY year DESC, total_ipc_crimes DESC
            LIMIT %s OFFSET %s
            """,
            params + [limit, offset],
        )
        rows = cur.fetchall()
    conn.close()
    return {
        "total_records": total_records,
        "page": page,
        "limit": limit,
        "records": rows,
    }


@app.get("/api/real-crime/metadata")
def get_real_crime_metadata():
    """Complete metadata for college practical evaluation."""
    return {
        "title": "District-wise Crimes Committed Under the Indian Penal Code (IPC)",
        "publisher": "National Crime Records Bureau (NCRB), Ministry of Home Affairs, Government of India",
        "portal": "Open Government Data (OGD) Platform India (data.gov.in) & Kaggle Crime in India",
        "verified_urls": [
            "https://www.kaggle.com/datasets/rajanand/crime-in-india",
            "https://data.gov.in/",
            "https://raw.githubusercontent.com/KshitiAnilKumar/Crime-Trend-Analysis-India/main/Dataset/01_District_wise_crimes_committed_IPC_2001_2012.csv",
        ],
        "local_csv_path": "data/real_crime/01_District_wise_crimes_committed_IPC_2001_2012.csv",
        "state_covered": "Maharashtra (552 records across 12 years: 2001-2012)",
        "granularity": "District x Year x IPC Crime Category",
        "total_maharashtra_ipc_crimes": 2273436,
        "academic_license": "Open Government Data (OGD) License - India / Public Academic Research",
        "compatible_modules": [
            "District Comparison & State-wide Rankings",
            "Crime Category Profiles & Dominant Offenses",
            "12-Year Historical Crime Trend Trajectories",
            "Intelligence Reports & Data Export Dossiers",
            "AI Assistant Natural Language Intelligence Queries",
        ],
        "simulation_restricted_modules": [
            "Criminal Network Graph (Requires individual suspect identities, omitted in public aggregate datasets)",
            "Modus Operandi Clustering (Requires suspect weapon/escape tracking, omitted in public aggregate datasets)",
            "Weekly Station Risk Forecasting (Requires weekly timestamps & station geocodes; public records are annual district aggregates)",
        ],
    }


class AIQueryRequest(BaseModel):
    question: str
    context: Optional[dict] = None


@app.post("/api/ai-assistant/query")
def query_ai_assistant(req: AIQueryRequest):
    """
    AI Crime Intelligence Assistant endpoint.
    Deterministic, grounded in PostgreSQL ksp_crime and precomputed ML risk analytics.
    """
    return process_ai_query(req.question, context=req.context)
