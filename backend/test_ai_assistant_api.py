import json
import urllib.request
import sys

sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://127.0.0.1:8000"

def test_api():
    print("--- 1. Testing /api/health ---")
    res = urllib.request.urlopen(f"{BASE_URL}/api/health")
    print("Health Status:", res.status, json.loads(res.read().decode()))

    print("\n--- 2. Testing /api/ai-assistant/query with Benchmark Questions ---")
    test_questions = [
        "Which district has the highest number of incidents?",
        "Which stations have the highest vehicle theft?",
        "What are the top crime categories in Pune?",
        "Compare Pune and Nagpur.",
        "What crimes happen most frequently at night?",
        "Which stations are currently high risk?",
        "What is the crime rate per 100,000 people?",
        "Tell me about alien abductions in space",  # Unsupported / fallback question
    ]

    for idx, q in enumerate(test_questions, 1):
        req_data = json.dumps({"question": q}).encode("utf-8")
        req = urllib.request.Request(
            f"{BASE_URL}/api/ai-assistant/query",
            data=req_data,
            headers={"Content-Type": "application/json"},
        )
        r = urllib.request.urlopen(req)
        res_json = json.loads(r.read().decode())
        print(f"\n==========================================")
        print(f"QUESTION {idx}: {q}")
        print(f"STATUS: {r.status} OK")
        print(f"QUERY TYPE: {res_json.get('query_type')}")
        print(f"SOURCE: {res_json.get('source')}")
        print(f"ACTION: {res_json.get('action')}")
        print(f"ANSWER:\n{res_json.get('answer')}")
        print(f"DATA RECORDS: {len(res_json.get('data') or [])}")

    print("\n--- 3. Testing Regression Endpoints ---")
    endpoints = [
        "/api/health",
        "/api/districts",
        "/api/stations",
        "/api/station-stats",
        "/api/incidents?limit=10",
        "/api/redzones",
        "/api/network?top_n_suspects=12&max_incidents_per_suspect=8",
        "/api/risk-score",
        "/api/ground-truth-recovery",
        "/api/district-comparison",
    ]
    for ep in endpoints:
        r = urllib.request.urlopen(f"{BASE_URL}{ep}")
        body = json.loads(r.read().decode())
        print(f"ENDPOINT {ep}: status={r.status}, keys={list(body.keys()) if isinstance(body, dict) else len(body)}")

if __name__ == "__main__":
    test_api()
