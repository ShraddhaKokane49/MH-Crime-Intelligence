"""Test suite verifying AI Assistant queries across real NCRB and simulation data sources."""
import urllib.request
import json
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

API_URL = "http://localhost:8000/api/ai-assistant/query"

test_cases = [
    {
        "name": "Real NCRB District Ranking",
        "question": "Which district has the highest crime in the official NCRB data?",
        "expected_source": "real_district_crimes",
        "expected_in_answer": "NCRB",
    },
    {
        "name": "Real NCRB District Comparison",
        "question": "Compare Pune and Nagpur in the real dataset.",
        "expected_source": "real_district_crimes",
        "expected_in_answer": "Official NCRB",
    },
    {
        "name": "Real NCRB Historical Trends",
        "question": "Show historical crime trends from 2001 to 2012 in Pune in NCRB records.",
        "expected_source": "real_district_crimes",
        "expected_in_answer": "2001",
    },
    {
        "name": "Real NCRB Exact Murder Count",
        "question": "How many murder cases were recorded in Pune in the NCRB dataset?",
        "expected_source": "real_district_crimes",
        "expected_in_answer": "Official NCRB",
    },
    {
        "name": "Dataset Architecture & Overview",
        "question": "What dataset is this project using?",
        "expected_source": "real_district_crimes",
        "expected_in_answer": "National Crime Records Bureau",
    },
    {
        "name": "Simulation Risk Forecast",
        "question": "Which police stations have the highest risk?",
        "expected_source": "XGBoost",
        "expected_in_answer": "Simulation",
    },
    {
        "name": "Simulation Time-of-Day",
        "question": "What crimes happen most frequently at night?",
        "expected_source": "Simulation",
        "expected_in_answer": "simulation",
    },
    {
        "name": "Real Data Granularity Limitation on Time-of-Day",
        "question": "What crimes happen at night in the NCRB real data?",
        "expected_source": "Hourly Timestamps",
        "expected_in_answer": "Limitation Notice",
    },
    {
        "name": "Hybrid General Overview",
        "question": "Give me an overview of the crime intelligence system.",
        "expected_source": "Hybrid",
        "expected_in_answer": "dual data architecture",
    }
]

failed = 0
print("=" * 70)
print("TESTING AI ASSISTANT REAL & SIMULATION SOURCE DISCRIMINATION")
print("=" * 70)

for tc in test_cases:
    try:
        req = urllib.request.Request(
            API_URL,
            data=json.dumps({"question": tc["question"]}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        source = data.get("source", "")
        answer = data.get("answer", "")

        source_ok = tc["expected_source"].lower() in source.lower()
        answer_ok = tc["expected_in_answer"].lower() in answer.lower()

        if source_ok and answer_ok:
            print(f"[PASS] {tc['name']}")
            print(f"       Source: {source}")
            print(f"       Answer snippet: {answer[:120].replace(chr(10), ' ')}...")
        else:
            print(f"[FAIL] {tc['name']}")
            print(f"       Expected Source substring: {tc['expected_source']} | Got: {source}")
            print(f"       Expected Answer substring: {tc['expected_in_answer']}")
            print(f"       Full answer:\n{answer}")
            failed += 1

    except Exception as e:
        print(f"[ERROR] {tc['name']}: {str(e)}")
        failed += 1
    print("-" * 70)

print(f"\nFinal Result: {len(test_cases) - failed}/{len(test_cases)} tests passed.")
if failed > 0:
    sys.exit(1)
print("All source discrimination tests succeeded!")
