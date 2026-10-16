# Data Source Documentation: MH-Crime-Intelligence

**Project:** Maharashtra Crime Intelligence & Analytics Platform (MH-Crime-Intelligence)  
**Evaluation:** Data Warehousing and Data Mining (DWM) Practical Project  
**Author / Student Submission:** MH-Crime-Intelligence  

---

## 1. Verified Real Dataset Information

* **Dataset Title:** District-wise Crimes Committed Under the Indian Penal Code (IPC)
* **Authoritative Source:** National Crime Records Bureau (NCRB), Ministry of Home Affairs, Government of India
* **Public Portals:**
  * Official Open Government Data Platform: [https://data.gov.in/](https://data.gov.in/)
  * National Crime Records Bureau Portal: [https://ncrb.gov.in/](https://ncrb.gov.in/)
  * Kaggle Verified Open Repository: [https://www.kaggle.com/datasets/rajanand/crime-in-india](https://www.kaggle.com/datasets/rajanand/crime-in-india)
* **Direct Download Mirror:** [https://raw.githubusercontent.com/KshitiAnilKumar/Crime-Trend-Analysis-India/main/Dataset/01_District_wise_crimes_committed_IPC_2001_2012.csv](https://raw.githubusercontent.com/KshitiAnilKumar/Crime-Trend-Analysis-India/main/Dataset/01_District_wise_crimes_committed_IPC_2001_2012.csv)
* **Local Dataset File:** `data/real_crime/01_District_wise_crimes_committed_IPC_2001_2012.csv`
* **File Size:** 1,054,043 bytes (~1.05 MB)
* **License:** Open Government Data (OGD) License - India / Public Academic Research

---

## 2. Dataset Metrics & Scope

| Metric | Official NCRB Value |
| :--- | :--- |
| **Total Nationwide Records** | 9,017 records across 35 States & Union Territories |
| **Target State** | **Maharashtra** |
| **Maharashtra Records** | **552 rows** (34 reporting units across 12 years) |
| **Temporal Range** | **2001 to 2012** (12 consecutive years) |
| **Total Maharashtra IPC Crimes** | **2,273,436 official registered offenses** |
| **Columns** | 34 columns (Murder, Attempt to Murder, Robbery, Burglary, Theft, Auto Theft, Riots, Cheating, Hurt, Total IPC, etc.) |
| **Missing Values in Target State** | **0 null values** across all columns |

---

## 3. Data Warehouse Pipeline & Preprocessing

The authentic dataset was ingested through the custom, safe importer script:
`backend/import_real_crime_data.py`

### Key Ingestion Rules & Data Mining Transformation Steps:
1. **Zero Data Destruction:** Existing operational tables (`stations`, `incidents`, `suspects`, `victims`) were preserved intact.
2. **Selective State Filtering:** Filtered for `STATE/UT == 'MAHARASHTRA'` while preserving the downloaded CSV untouched.
3. **District Name Normalization:**
   * Mapped historical names to current Maharashtra nomenclature:
     * `AHMEDNAGAR` → `Ahilyanagar`
     * `OSMANABAD` → `Dharashiv`
     * `AURANGABAD COMMR.` & `AURANGABAD RURAL` → `Chhatrapati Sambhajinagar`
     * `MUMBAI` & `MUMBAI COMMR.` & `MUMBAI RLY.` → `Mumbai City`
     * `PUNE COMMR.` & `PUNE RURAL` & `PUNE RLY.` → `Pune`
   * Retained raw source reporting units in `raw_district` for complete auditability.
4. **Separation of Aggregate Rollups:** Annual statewide sum rows (`DISTRICT == 'TOTAL'`) are tagged with `is_state_total = TRUE` to eliminate double-counting.
5. **Idempotent Storage:** Populated the dedicated analytical table `real_district_crimes` in PostgreSQL with parameterized SQL and `ON CONFLICT (state_ut, raw_district, year) DO UPDATE`.

---

## 4. Application Integration Matrix

```
+---------------------------------------------------------------------------------------+
|                               MH-CRIME-INTELLIGENCE                                   |
+---------------------------------------------------------------------------------------+
        |                                                       |
        v                                                       v
+------------------------------------+          +------------------------------------+
|    AUTHENTIC NCRB GOVERNMENT DATA  |          |      HIGH-RESOLUTION SIMULATION    |
|   (PostgreSQL real_district_crimes)|          |     (PostgreSQL incidents table)   |
+------------------------------------+          +------------------------------------+
        |                                                       |
        +--> District Comparison & Rankings                     +--> Station GPS Map Deck
        +--> 12-Year Historical Crime Trends                    +--> Station-level Heatmaps
        +--> Crime Category Distributions                       +--> Weekly Station XGBoost Risk
        +--> Intelligence Reports & Export                      +--> Repeat Offender Network Graph
        +--> AI Assistant Natural Language Q&A                  +--> Modus Operandi Clusters
```

### Module Utilization Summary:
* **District Analytics (`/api/district-comparison?source=real`):** Displays genuine district totals, dominant crime categories, and 2001–2012 trend trajectories directly from official NCRB data. A data-source toggle allows switching to the simulation model for comparison.
* **Dedicated Real Crime API Endpoints:**
  * `GET /api/real-crime/summary`: High-level metrics and statewide totals
  * `GET /api/real-crime/districts`: District-level crime breakdown and annual averages
  * `GET /api/real-crime/trends`: 12-year longitudinal crime trends
  * `GET /api/real-crime/records`: Filterable, paginated query of the real government records
  * `GET /api/real-crime/metadata`: Machine-readable metadata for academic evaluation
* **Intelligence Reports:** Users can export the official NCRB dataset directly to CSV.
* **AI Crime Assistant:** Answers natural language queries citing official NCRB figures.
* **Privacy & Granularity Transparency:**
  * Official public crime datasets do **not** disclose citizen names, suspect FIR identities, or exact street coordinates under Indian privacy laws.
  * Modules requiring suspect identities (Offender Networks and MO Clustering) or weekly timestamps (Station-level Weekly Risk) operate in explicitly declared **Simulation Demo Mode**, preventing false representation of synthetic identities as real individuals.

---

## 5. Instructions to Verify and Run

### Step 1: Run Idempotent Importer in Windows PowerShell
```powershell
backend\venv\Scripts\python.exe backend/import_real_crime_data.py
```

### Step 2: Start the Backend Server (FastAPI)
```powershell
backend\venv\Scripts\python.exe backend/start.py
```
*API docs available at: `http://localhost:8000/docs`*

### Step 3: Start the Frontend Application (Vite + React)
```powershell
cd frontend
npm run dev
```
*Platform available at: `http://localhost:5173`*
