"""
Comprehensive Integration Test Suite for Real Dataset Integration
Validates:
1. Database table integrity (no data destruction)
2. All real crime API endpoints
3. Existing API endpoints
4. Transparency notices on simulation modules
5. AI Assistant query handling for real dataset
"""

import sys
import os

import sys
import os

backend_dir = os.path.join(os.path.dirname(__file__), "backend")
sys.path.insert(0, backend_dir)

from main import (
    health,
    get_real_crime_summary,
    get_real_crime_districts,
    get_real_crime_trends,
    get_real_crime_records,
    get_real_crime_metadata,
    get_district_comparison,
    get_network,
    get_mo_clusters,
    get_risk_scores,
    get_station_stats,
    get_incidents,
    query_ai_assistant,
    AIQueryRequest,
)
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(backend_dir, ".env"))

def test_database_integrity():
    print("\n--- 1. Testing Database Integrity ---")
    conn = psycopg2.connect(
        dbname=os.environ.get("DB_NAME", "ksp_crime"),
        user=os.environ.get("DB_USER", "postgres"),
        password=os.environ.get("DB_PASSWORD"),
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "5432")),
    )
    cur = conn.cursor()
    
    cur.execute("SELECT count(*) FROM stations;")
    stations = cur.fetchone()[0]
    print(f"Stations count: {stations} (Expected: 83)")
    assert stations == 83, f"Expected 83 stations, got {stations}"

    cur.execute("SELECT count(*) FROM incidents;")
    incidents = cur.fetchone()[0]
    print(f"Incidents count: {incidents} (Expected: 90305)")
    assert incidents >= 90000, f"Expected >= 90000 incidents, got {incidents}"

    cur.execute("SELECT count(*) FROM suspects;")
    suspects = cur.fetchone()[0]
    print(f"Suspects count: {suspects} (Expected: 250)")
    assert suspects == 250, f"Expected 250 suspects, got {suspects}"

    cur.execute("SELECT count(*) FROM victims;")
    victims = cur.fetchone()[0]
    print(f"Victims count: {victims} (Expected: 500)")
    assert victims == 500, f"Expected 500 victims, got {victims}"

    cur.execute("SELECT count(*) FROM real_district_crimes;")
    real_records = cur.fetchone()[0]
    print(f"Real District Crimes count: {real_records} (Expected: 552)")
    assert real_records == 552, f"Expected 552 records, got {real_records}"

    conn.close()
    print("[PASS] Database integrity verified: No existing tables dropped or corrupted.")


def test_api_endpoints():
    print("\n--- 2. Testing API Endpoints Directly ---")

    # Health
    h = health()
    assert h["status"] == "ok"
    print("[PASS] GET /api/health: OK")

    # Real Crime Summary
    summary_data = get_real_crime_summary()
    assert summary_data["state"] == "Maharashtra"
    assert summary_data["summary"]["total_districts"] == 34
    assert summary_data["summary"]["min_year"] == 2001
    assert summary_data["summary"]["max_year"] == 2012
    print(f"[PASS] GET /api/real-crime/summary: OK ({summary_data['summary']['total_state_crimes']:,} crimes)")

    # Real Crime Districts
    districts = get_real_crime_districts()["districts"]
    assert len(districts) == 34
    top_district = districts[0]
    print(f"[PASS] GET /api/real-crime/districts: OK (Top district: {top_district['district']} with {top_district['total_crimes']:,} crimes)")

    # Real Crime Trends
    trends = get_real_crime_trends(district="Pune")["trends"]
    assert len(trends) == 12
    print(f"[PASS] GET /api/real-crime/trends?district=Pune: OK (12 years of trends from {trends[0]['year']} to {trends[-1]['year']})")

    # Real Crime Records (Paginated)
    records = get_real_crime_records(limit=10, page=1)
    assert records["total_records"] == 552
    assert len(records["records"]) == 10
    print(f"[PASS] GET /api/real-crime/records: OK (Returned 10 of {records['total_records']} records)")

    # Real Crime Metadata
    meta = get_real_crime_metadata()
    assert "NCRB" in meta["publisher"]
    print(f"[PASS] GET /api/real-crime/metadata: OK ({meta['title']})")

    # District Comparison (Real mode)
    dc_real = get_district_comparison(source="real")
    assert dc_real["data_source"] == "real_ncrb"
    assert dc_real["total_state_incidents"] == 2273436
    assert len(dc_real["rankings"]) == 34
    print(f"[PASS] GET /api/district-comparison?source=real: OK ({dc_real['total_state_incidents']:,} incidents across 34 districts)")

    # District Comparison (Synthetic mode)
    dc_synth = get_district_comparison(source="synthetic")
    assert dc_synth["data_source"] == "synthetic_simulation"
    print(f"[PASS] GET /api/district-comparison?source=synthetic: OK (Backward compatibility verified)")

    # Network Graph with simulation notice
    net = get_network(top_n_suspects=5)
    assert net["data_source"] == "simulation_demo"
    assert "source_notice" in net
    print(f"[PASS] GET /api/network: OK (Simulation notice: '{net['data_source']}')")

    # MO Clusters with simulation notice
    mo = get_mo_clusters()
    assert mo["data_source"] == "simulation_demo"
    print(f"[PASS] GET /api/mo-clusters: OK (Simulation notice: '{mo['data_source']}')")

    # Risk Score with simulation notice
    rs = get_risk_scores()
    assert "model_scope" in rs
    print(f"[PASS] GET /api/risk-score: OK (Scope: '{rs['model_scope']}')")

    # Existing station-stats & incidents endpoints
    st = get_station_stats()
    assert len(st["stations"]) == 83
    print("[PASS] GET /api/station-stats: OK (83 stations)")

    inc = get_incidents(limit=10)
    assert len(inc["incidents"]) == 10
    print("[PASS] GET /api/incidents: OK")


def test_ai_assistant():
    print("\n--- 3. Testing AI Assistant on Real Dataset ---")
    req = AIQueryRequest(question="What real crime dataset is used?")
    ans = query_ai_assistant(req)
    assert ans["query_type"] == "dataset_information"
    assert "National Crime Records Bureau" in ans["answer"]
    assert "2,273,436" in ans["answer"]
    print("[PASS] POST /api/ai-assistant/query (dataset question): OK")
    safe_excerpt = ans["answer"][:300].encode("ascii", errors="replace").decode("ascii")
    print("Answer excerpt:\n" + safe_excerpt + "...")


if __name__ == "__main__":
    test_database_integrity()
    test_api_endpoints()
    test_ai_assistant()
    print("\n==============================================")
    print("ALL INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("==============================================")
