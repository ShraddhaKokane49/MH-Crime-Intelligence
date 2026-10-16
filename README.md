\# Maharashtra Crime Intelligence Platform



An intelligent crime analytics dashboard focused on Maharashtra, India, designed to support crime-data exploration, geographic analysis, hotspot identification, and data-driven insights.



\## Overview



The Maharashtra Crime Intelligence Platform brings crime data and analytical tools together in one dashboard. It helps users explore crime trends, compare districts, identify patterns, and understand risk indicators through interactive visualizations.



\## Key Features



\- \*\*Crime Analytics Dashboard:\*\* View crime statistics and explore incident trends.

\- \*\*Geographic Analysis:\*\* Explore crime distribution across districts and locations.

\- \*\*Crime Hotspot Analysis:\*\* Identify areas with comparatively higher recorded incident counts.

\- \*\*District Analytics:\*\* Compare available crime statistics across districts.

\- \*\*Criminal Network Analysis:\*\* Explore relationships represented in the available dataset.

\- \*\*Risk Analysis:\*\* Examine model-based risk indicators and supporting analytical outputs.

\- \*\*Interactive Visualizations:\*\* Explore crime patterns through charts, graphs, and maps.

\- \*\*Reports:\*\* Review and export supported analytical results.

\- \*\*AI Assistant:\*\* Ask natural-language questions about supported crime data and analytics.



\## Technology Stack



\- \*\*Frontend:\*\* React, Vite, JavaScript, CSS

\- \*\*Backend:\*\* Python, FastAPI

\- \*\*Database:\*\* PostgreSQL

\- \*\*Data Analysis:\*\* Pandas, NumPy, Scikit-learn

\- \*\*Visualization:\*\* Interactive charts and geographic visualizations



\## Data Sources



The project includes historical district-wise crime statistics attributed to the National Crime Records Bureau (NCRB), covering 2001–2012, along with incident-level records generated for application testing and analysis.



Historical statistics and simulated incident records are different data sources and should be interpreted separately. Simulated records must not be treated as verified real-world incidents.



See \[DATASET\_SOURCE.md](DATASET\_SOURCE.md) for dataset details and source information.



\## Running the Project



\### Prerequisites



\- Python

\- Node.js and npm

\- PostgreSQL



\### Backend



Configure the database connection using your local environment settings and ensure the required database and tables are available.



From the project root, activate your existing Python virtual environment if needed, then run:



```bash

cd backend

python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000

```



\### Frontend



Open a separate terminal:



```bash

cd frontend

npm install

npm run dev

```



Open the local URL displayed by Vite in your terminal.



\*\*Note:\*\* Follow the project's database configuration and dependency requirements before starting the application. The dashboard requires a working backend and database for data-dependent features.



\## Project Objective



The objective is to apply data warehousing, data analysis, visualization, and analytical techniques to crime-related data, making trends and geographic patterns easier to explore.



\## Limitations



\- Historical statistics and simulated incident records have different coverage and meanings.

\- Analytical outputs depend on data quality and model assumptions.

\- Risk indicators and hotspot visualizations are analytical aids, not proof of criminal activity.



\## Future Scope



\- Integrate additional verified Maharashtra-specific datasets.

\- Improve district-level comparisons and geographic coverage.

\- Enhance model evaluation and explainability.

\- Expand reporting and analytical capabilities.



\---



\*\*Project:\*\* Maharashtra Crime Intelligence Platform  

\*\*Purpose:\*\* Crime-data analytics and visualization for Maharashtra, India



