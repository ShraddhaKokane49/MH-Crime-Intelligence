import sys
import os

# Prepend the directory containing this script to sys.path
# This ensures Python imports our bundled Linux dependencies first
current_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(current_dir)
sys.path.insert(0, current_dir)

# Run precomputation if the precomputed JSON files do not exist
if not os.path.exists(os.path.join(current_dir, "precomputed_risk_scores.json")):
    print("Precomputed risk scores not found. Running precomputation script...")
    try:
        from generate_precomputed import precompute
        precompute()
    except Exception as e:
        print(f"WARNING: Precomputation failed: {e}. Servicing requests normally.")

import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("X_ZOHO_CATALYST_LISTEN_PORT", 8000))
    print(f"Starting uvicorn server on port {port}...")
    uvicorn.run("main:app", host="0.0.0.0", port=port, workers=1)
