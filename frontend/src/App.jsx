import { useEffect, useState, useMemo } from "react";
import "./App.css";
import { api } from "./api";
import Header from "./components/Header";
import OverviewView from "./components/OverviewView";
import GeographicView from "./components/GeographicView";
import CrimeIntelligenceView from "./components/CrimeIntelligenceView";
import DistrictAnalyticsView from "./components/DistrictAnalyticsView";
import RiskDashboard from "./components/RiskDashboard";
import NetworkGraph from "./components/NetworkGraph";
import ReportsView from "./components/ReportsView";
import AiAssistantView from "./components/AiAssistantView";

const OFFICER_ASSIGNED_DISTRICT = "Pune";

export default function App() {
  const [activeTab, setActiveTab] = useState("overview");
  const [role, setRole] = useState("analyst"); // "analyst" | "officer"

  const [districts, setDistricts] = useState([]);
  const [crimeTypes, setCrimeTypes] = useState([]);
  const [stations, setStations] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [redzones, setRedzones] = useState([]);

  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [crimeTypeFilter, setCrimeTypeFilter] = useState("");
  const [viewMode, setViewMode] = useState("density"); // "density" | "heatmap"
  const [timeOfDay, setTimeOfDay] = useState(""); // "" | "day" | "night"
  const [dayType, setDayType] = useState(""); // "" | "weekday" | "weekend"

  const [networkTopN, setNetworkTopN] = useState(12);
  const [networkMaxIncidents, setNetworkMaxIncidents] = useState(8);
  const [networkDistrict, setNetworkDistrict] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const handleAssistantNavigate = (tab, params = {}) => {
    if (params.district) {
      setSelectedDistrict(params.district);
    }
    if (params.crimeType) {
      setCrimeTypeFilter(params.crimeType);
    }
    if (params.timeOfDay) {
      setTimeOfDay(params.timeOfDay);
    }
    if (params.viewMode) {
      setViewMode(params.viewMode);
    }
    if (tab) {
      setActiveTab(tab);
    }
  };

  // Initial load: districts, crime types, red-zones, and station stats
  useEffect(() => {
    Promise.all([api.districts(), api.redzones(), api.stationStats()])
      .then(([d, rz, st]) => {
        setDistricts(d.districts || []);
        setCrimeTypes(d.crime_types || []);
        setRedzones(rz.redzones || []);
        setStations(st.stations || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Update station stats when crime type filter changes
  useEffect(() => {
    if (activeTab === "overview" || activeTab === "geographic") {
      api
        .stationStats(crimeTypeFilter || undefined)
        .then((data) => setStations(data.stations || []))
        .catch((err) => setError(err.message));
    }
  }, [activeTab, crimeTypeFilter]);

  // Incident points for heatmap mode
  useEffect(() => {
    if (activeTab !== "geographic" || viewMode !== "heatmap") return;
    api
      .incidents({
        crimeType: crimeTypeFilter || undefined,
        timeOfDay: timeOfDay || undefined,
        dayType: dayType || undefined,
        district: selectedDistrict || undefined,
        limit: 15000,
      })
      .then((data) => setIncidents(data.incidents || []))
      .catch((err) => setError(err.message));
  }, [activeTab, viewMode, crimeTypeFilter, timeOfDay, dayType, selectedDistrict]);

  // Enforce Officer role boundaries (Locked to Pune)
  useEffect(() => {
    if (role === "officer") {
      if (activeTab === "network" || activeTab === "risk") {
        setActiveTab("geographic");
      }
      setSelectedDistrict(OFFICER_ASSIGNED_DISTRICT);
      setNetworkDistrict(OFFICER_ASSIGNED_DISTRICT);
    }
  }, [role, activeTab]);

  return (
    <div className="ops-app-wrapper">
      {/* Top Operations Center Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        role={role}
        setRole={setRole}
        assignedDistrict={OFFICER_ASSIGNED_DISTRICT}
      />

      {/* Main Content View Container */}
      <main className="ops-view-container">
        {error && (
          <div className="ops-global-error-banner">
            <span>⚠ Connection Alert: {error}</span>
            <button onClick={() => window.location.reload()}>Retry Connection</button>
          </div>
        )}

        {/* 1. Command Overview */}
        {activeTab === "overview" && (
          <OverviewView
            stations={stations}
            redzones={redzones}
            districts={districts}
            crimeTypes={crimeTypes}
            onNavigateToTab={(tab) => setActiveTab(tab)}
            onSelectDistrict={(d) => setSelectedDistrict(d)}
          />
        )}

        {/* 2. Crime Intelligence */}
        {activeTab === "intelligence" && (
          <CrimeIntelligenceView
            stations={stations}
            districts={districts}
            crimeTypes={crimeTypes}
          />
        )}

        {/* 3. District Analytics (Comparison & Ranking) */}
        {activeTab === "districtAnalytics" && (
          <DistrictAnalyticsView defaultDistrict={selectedDistrict || "Pune"} />
        )}

        {/* 4. Geographic Analysis */}
        {activeTab === "geographic" && (
          <GeographicView
            stations={stations}
            incidents={incidents}
            districts={districts}
            crimeTypes={crimeTypes}
            selectedDistrict={selectedDistrict}
            setSelectedDistrict={setSelectedDistrict}
            crimeTypeFilter={crimeTypeFilter}
            setCrimeTypeFilter={setCrimeTypeFilter}
            viewMode={viewMode}
            setViewMode={setViewMode}
            timeOfDay={timeOfDay}
            setTimeOfDay={setTimeOfDay}
            dayType={dayType}
            setDayType={setDayType}
            redzones={redzones}
            loading={loading}
            role={role}
            assignedDistrict={OFFICER_ASSIGNED_DISTRICT}
          />
        )}

        {/* 5. Risk & Prediction (ML) */}
        {activeTab === "risk" && <RiskDashboard />}

        {/* 6. Criminal Network Analysis */}
        {activeTab === "network" && (
          <NetworkGraph
            topN={networkTopN}
            maxIncidentsPerSuspect={networkMaxIncidents}
            district={networkDistrict}
            districts={districts}
            onDistrictChange={(d) => setNetworkDistrict(d)}
            onTopNChange={(n) => setNetworkTopN(n)}
            onMaxIncidentsChange={(m) => setNetworkMaxIncidents(m)}
          />
        )}

        {/* 7. Intelligence Reports */}
        {activeTab === "reports" && (
          <ReportsView
            stations={stations}
            districts={districts}
            crimeTypes={crimeTypes}
            redzones={redzones}
          />
        )}

        {/* 8. AI Crime Intelligence Assistant */}
        {activeTab === "aiAssistant" && (
          <AiAssistantView
            onNavigate={handleAssistantNavigate}
            role={role}
            assignedDistrict={OFFICER_ASSIGNED_DISTRICT}
          />
        )}
      </main>
    </div>
  );
}
