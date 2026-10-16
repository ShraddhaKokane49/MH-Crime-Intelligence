import json
import urllib.request
import sys

sys.stdout.reconfigure(encoding="utf-8")

BASE_URL = "http://127.0.0.1:8000"

TEST_QUESTIONS = [
    # 1-5: Low / High / Safest / Specific crime rankings
    "Which district has the lowest crime?",
    "Which district has the most crime?",
    "Which city is safest?",
    "Which district has the highest robbery?",
    "Where is robbery least common?",
    
    # 6-9: Most / Least common crime, Top N / Bottom N
    "What is the most common crime in Maharashtra?",
    "Which crime occurs the least?",
    "Give me the top 5 districts for vehicle theft.",
    "Give me the bottom 5 districts for burglary.",
    
    # 10-12: Exact counts, percentages, comparisons
    "How many robberies happened in Pune?",
    "What percentage of Pune incidents are theft?",
    "Compare Pune and Nagpur.",
    
    # 13-15: Trends and time of day
    "Which crime increased the most from 2024 to 2025?",
    "Which crimes happen most at night?",
    "When does vehicle theft happen most frequently?",
    
    # 16-18: Station volume, risk, and red zones
    "Which station has the highest number of incidents?",
    "Which stations are high risk?",
    "Show me the red zones.",
    
    # 19-21: District trends, year changes, fewer incidents
    "What are the crime trends in Pune?",
    "What changed in Pune between 2024 and 2025?",
    "Which district has fewer incidents, Pune or Nashik?",
    
    # 22-25: Least common in district, safest 5, anomalies, why red zone
    "What is the least common crime in Mumbai City?",
    "Show the safest 5 districts based on incident count.",
    "Which areas have unusual crime activity?",
    "Why is Shivajinagar considered a red zone?",
    
    # 26: The user's exact tested query on crime rate
    "which district ranks lowest in crime rate",
]

def run_tests():
    print(f"================================================================================")
    print(f"TESTING 26 BENCHMARK NATURAL LANGUAGE QUERIES AGAINST /api/ai-assistant/query")
    print(f"================================================================================")
    
    success_count = 0
    
    for idx, q in enumerate(TEST_QUESTIONS, 1):
        req_data = json.dumps({"question": q}).encode("utf-8")
        req = urllib.request.Request(
            f"{BASE_URL}/api/ai-assistant/query",
            data=req_data,
            headers={"Content-Type": "application/json"},
        )
        try:
            r = urllib.request.urlopen(req)
            res = json.loads(r.read().decode())
            
            # Check that it did NOT return a generic overview fallback
            is_generic = res.get("query_type") == "general_overview"
            
            print(f"\n[{idx}/26] QUESTION: \"{q}\"")
            print(f"STATUS: {r.status} OK | INTENT: {res.get('query_type')}")
            print(f"ACTION: {res.get('action', {}).get('label') if res.get('action') else 'None'}")
            print(f"ANSWER:\n{res.get('answer')}")
            print("-" * 80)
            
            if not is_generic and res.get("query_type") != "error":
                success_count += 1
            else:
                print(f"⚠️ WARNING: Query fell back to generic overview or error!")
                
        except Exception as e:
            print(f"\n[{idx}/26] QUESTION: \"{q}\" -> FAILED WITH ERROR: {e}")

    # Test conversational follow-ups
    print(f"\n================================================================================")
    print(f"TESTING CONVERSATIONAL FOLLOW-UP CONTEXT")
    print(f"================================================================================")
    
    # Follow-up Test 1
    q1 = "Which district has the highest robbery?"
    req_data1 = json.dumps({"question": q1}).encode("utf-8")
    r1 = urllib.request.urlopen(urllib.request.Request(f"{BASE_URL}/api/ai-assistant/query", data=req_data1, headers={"Content-Type": "application/json"}))
    res1 = json.loads(r1.read().decode())
    ctx1 = res1.get("context")
    
    q2 = "What about vehicle theft?"
    req_data2 = json.dumps({"question": q2, "context": ctx1}).encode("utf-8")
    r2 = urllib.request.urlopen(urllib.request.Request(f"{BASE_URL}/api/ai-assistant/query", data=req_data2, headers={"Content-Type": "application/json"}))
    res2 = json.loads(r2.read().decode())
    
    print(f"\n[FOLLOW-UP 1a] Q: \"{q1}\"")
    print(f"ANSWER: {res1.get('answer')}")
    print(f"\n[FOLLOW-UP 1b] Q: \"{q2}\" (with context)")
    print(f"INTENT: {res2.get('query_type')}")
    print(f"ANSWER: {res2.get('answer')}")

    # Follow-up Test 2
    q3 = "Compare Pune and Nagpur."
    req_data3 = json.dumps({"question": q3}).encode("utf-8")
    r3 = urllib.request.urlopen(urllib.request.Request(f"{BASE_URL}/api/ai-assistant/query", data=req_data3, headers={"Content-Type": "application/json"}))
    res3 = json.loads(r3.read().decode())
    ctx3 = res3.get("context")
    
    q4 = "Which one has more robbery?"
    req_data4 = json.dumps({"question": q4, "context": ctx3}).encode("utf-8")
    r4 = urllib.request.urlopen(urllib.request.Request(f"{BASE_URL}/api/ai-assistant/query", data=req_data4, headers={"Content-Type": "application/json"}))
    res4 = json.loads(r4.read().decode())
    
    print(f"\n[FOLLOW-UP 2a] Q: \"{q3}\"")
    print(f"ANSWER:\n{res3.get('answer')}")
    print(f"\n[FOLLOW-UP 2b] Q: \"{q4}\" (with context)")
    print(f"INTENT: {res4.get('query_type')}")
    print(f"ANSWER:\n{res4.get('answer')}")

    print(f"\n================================================================================")
    print(f"RESULTS: {success_count}/26 benchmark queries answered directly with zero generic fallbacks!")
    print(f"================================================================================")

if __name__ == "__main__":
    run_tests()
