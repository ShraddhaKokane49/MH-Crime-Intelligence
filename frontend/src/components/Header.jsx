import { useState, useEffect } from "react";

export default function Header({ activeTab, setActiveTab, role, setRole, assignedDistrict }) {
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }) + " • " +
        now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }) + " IST"
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { id: "overview", label: "Command Overview", icon: "⎈" },
    { id: "intelligence", label: "Crime Intelligence", icon: "◈" },
    { id: "districtAnalytics", label: "District Analytics", icon: "⚖" },
    { id: "geographic", label: "Geographic Analysis", icon: "❖" },
    { id: "risk", label: "Risk & Prediction", icon: "▲" },
    { id: "network", label: "Criminal Network", icon: "☊" },
    { id: "reports", label: "Intelligence Reports", icon: "▤" },
    { id: "aiAssistant", label: "AI Intelligence", icon: "🤖" },
  ];

  const getSourceStatus = () => {
    switch (activeTab) {
      case "districtAnalytics":
        return {
          label: "DATA MODE: HYBRID — NCRB REAL DATA (2001–2012) + SIMULATION",
          tooltip: "District Analytics supports dual querying: Official NCRB 2001-2012 records (552 rows) and Synthetic FIR simulation",
          dotClass: "hybrid-dot",
          pillClass: "hybrid-pill",
        };
      case "geographic":
      case "risk":
      case "network":
        return {
          label: "DATA MODE: SIMULATION — SYNTHETIC FIR & ML BENCHMARK",
          tooltip: "Geographic catchments, XGBoost Risk, and Network models utilize synthetic high-frequency FIR & suspect graphs (90,305 incidents)",
          dotClass: "sim-dot",
          pillClass: "sim-pill",
        };
      case "reports":
        return {
          label: "DATA MODE: HYBRID — NCRB OFFICIAL DOSSIERS + SIMULATION",
          tooltip: "Generates intelligence reports combining official NCRB district data with simulated operational profiles",
          dotClass: "hybrid-dot",
          pillClass: "hybrid-pill",
        };
      case "aiAssistant":
        return {
          label: "DATA MODE: HYBRID — NCRB REAL DATA + SIMULATION QA",
          tooltip: "AI Assistant routes district statistics to authentic NCRB tables and tactical forecasts to simulation",
          dotClass: "hybrid-dot",
          pillClass: "hybrid-pill",
        };
      default:
        return {
          label: "DATA MODE: HYBRID — NCRB REAL DATA + SIMULATION",
          tooltip: "Hybrid Architecture: Authentic NCRB 2001–2012 district statistics integrated alongside synthetic tactical FIR simulation",
          dotClass: "hybrid-dot",
          pillClass: "hybrid-pill",
        };
    }
  };

  const sourceStatus = getSourceStatus();

  return (
    <header className="ops-header">
      <div className="header-top-bar">
        <div className="header-brand">
          <div className="emblem-container">
            <span className="emblem-symbol">🏛</span>
          </div>
          <div className="brand-titles">
            <div className="brand-main-title">
              MAHARASHTRA CRIME INTELLIGENCE & ANALYTICS
              <span className="brand-badge">MAHACRIME-INTEL</span>
            </div>
            <div className="brand-sub-title">
              State Police Operations & Anomaly Detection Center • Analytical Surveillance
            </div>
          </div>
        </div>

        <div className="header-meta">
          <div className={`synthetic-data-pill ${sourceStatus.pillClass}`} title={sourceStatus.tooltip}>
            <span className={`pill-dot ${sourceStatus.dotClass}`}></span>
            {sourceStatus.label}
          </div>

          <div className="live-status-pill">
            <span className="status-indicator-live"></span>
            <span className="status-text">LIVE NODE: CONNECTED</span>
          </div>

          <div className="header-clock">
            <span className="clock-icon">⏱</span>
            <span className="clock-time">{currentTime}</span>
          </div>

          <div className="role-selector-box">
            <div className="role-label">OPERATOR PROFILE</div>
            <div className="role-btn-group">
              <button
                className={`role-btn ${role === "analyst" ? "active" : ""}`}
                onClick={() => setRole("analyst")}
                title="Full state-wide access across all 36 districts"
              >
                🔍 State Analyst
              </button>
              <button
                className={`role-btn ${role === "officer" ? "active" : ""}`}
                onClick={() => setRole("officer")}
                title={`Restricted to assigned district (${assignedDistrict})`}
              >
                👮 Station Officer
              </button>
            </div>
          </div>
        </div>
      </div>

      <nav className="header-nav-bar">
        <div className="nav-tab-list">
          {navItems.map((item) => {
            const isRestricted = role === "officer" && (item.id === "network" || item.id === "risk");
            return (
              <button
                key={item.id}
                className={`nav-tab-btn ${activeTab === item.id ? "active" : ""} ${isRestricted ? "disabled" : ""}`}
                disabled={isRestricted}
                onClick={() => !isRestricted && setActiveTab(item.id)}
                title={isRestricted ? "Restricted: State Analyst clearance required" : item.label}
              >
                <span className="nav-tab-icon">{isRestricted ? "🔒" : item.icon}</span>
                <span className="nav-tab-label">{item.label}</span>
                {item.id === "risk" && <span className="nav-badge ml-badge">ML</span>}
                {item.id === "network" && <span className="nav-badge network-badge">GRAPH</span>}
                {item.id === "aiAssistant" && <span className="nav-badge ai-badge">NLP</span>}
              </button>
            );
          })}
        </div>

        {role === "officer" && (
          <div className="officer-jurisdiction-alert">
            <span className="lock-icon">🔒</span>
            <span>RESTRICTED VIEW: JURISDICTION LOCKED TO <strong>{assignedDistrict.toUpperCase()}</strong></span>
          </div>
        )}
      </nav>
    </header>
  );
}
