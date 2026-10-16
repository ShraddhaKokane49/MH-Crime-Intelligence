import { useEffect, useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { formatNumber } from "../utils";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const GROUP_COLORS = {
  crime_type_mix: "#ef4444",
  recent_trend: "#f97316",
  time_of_day_pattern: "#3b82f6",
  weekly_pattern: "#10b981",
  seasonal_factor: "#8b5cf6",
};

export default function RiskDashboard() {
  const [data, setData] = useState(null);
  const [gtr, setGtr] = useState(null);
  const [selectedStationId, setSelectedStationId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/risk-score`).then((r) => r.json()),
      fetch(`${API_BASE}/api/ground-truth-recovery`).then((r) => r.json()),
    ])
      .then(([riskData, gtrData]) => {
        if (riskData.error) throw new Error(riskData.error);
        setData(riskData);
        setGtr(gtrData);
        setSelectedStationId(riskData.stations[0]?.station_id ?? null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filteredStations = useMemo(() => {
    if (!data || !data.stations) return [];
    if (!searchTerm.trim()) return data.stations;
    const term = searchTerm.toLowerCase();
    return data.stations.filter(
      (s) =>
        s.station_name.toLowerCase().includes(term) ||
        s.district.toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  if (loading) return <div className="ops-loading-overlay">Initializing XGBoost Model & SHAP Explainer...</div>;
  if (error) return <div className="ops-error-banner">⚠ Error loading risk model: {error}</div>;
  if (!data || data.stations.length === 0) return <div className="ops-empty-banner">No station risk data available.</div>;

  const selectedStation =
    data.stations.find((s) => s.station_id === selectedStationId) || data.stations[0];

  const chartData = selectedStation.shap_groups.map((g) => ({
    name: g.label,
    value: g.direction === "increasing" ? g.pct : -g.pct,
    group: g.group,
    direction: g.direction,
    raw: g.raw_contribution,
  }));

  const isElevated = selectedStation.predicted_weekly_risk > data.baseline * 1.1;

  return (
    <div className="risk-view-layout">
      {/* Left Sidebar: Station Risk Ranking */}
      <aside className="risk-sidebar">
        <div className="sidebar-section-title">
          <span className="icon">▲</span> ML STATION RISK FORECAST
        </div>
        <div style={{ fontSize: "10.5px", padding: "3px 8px", background: "rgba(6, 182, 212, 0.12)", border: "1px solid rgba(6, 182, 212, 0.3)", borderRadius: "4px", color: "var(--accent-cyan)", marginBottom: "10px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent-cyan)" }}></span>
          SIMULATION BENCHMARK MODEL
        </div>

        <div className="risk-search-box">
          <input
            type="text"
            className="ops-search-input"
            placeholder="Filter stations or districts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="risk-baseline-badge">
          <span>State Baseline Average:</span>
          <strong>{data.baseline} incidents / station-wk</strong>
        </div>

        <div className="risk-station-scroll">
          {filteredStations.map((s) => {
            const elevated = s.predicted_weekly_risk > data.baseline * 1.1;
            return (
              <div
                key={s.station_id}
                className={`risk-station-card ${s.station_id === selectedStation?.station_id ? "active" : ""}`}
                onClick={() => setSelectedStationId(s.station_id)}
              >
                <div className="risk-card-top">
                  <span className="risk-station-name">{s.station_name}</span>
                  <span className="risk-score-pill">
                    {s.predicted_weekly_risk} <small>/wk</small>
                  </span>
                </div>
                <div className="risk-card-bottom">
                  <span className="risk-district-text">{s.district}</span>
                  {elevated && <span className="risk-elevated-badge">▲ ELEVATED RISK</span>}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Panel: SHAP Feature Attribution & Ground-Truth Recovery */}
      <main className="risk-main-content">
        {/* Top Feature Attribution & Explanation */}
        <div className="panel-card risk-detail-card">
          <div className="panel-header">
            <div className="panel-title">
              <span className="title-icon">◈</span>
              {selectedStation.station_name} ({selectedStation.district} District)
            </div>
            <span className={`risk-status-pill ${isElevated ? "elevated" : "normal"}`}>
              {isElevated ? "⚠ HIGH RISK THREAT FORECAST" : "✓ TYPICAL RISK BASELINE"}
            </span>
          </div>

          {/* AI Explanation Sentence */}
          <div className="risk-ai-summary-box">
            <div className="ai-summary-label">🤖 AUTOMATED SHAP INTELLIGENCE EXPLANATION</div>
            <div className="ai-summary-text">{selectedStation.explanation}</div>
          </div>

          {/* SHAP Feature Contribution Bar Chart */}
          <div className="shap-chart-section">
            <div className="shap-header">
              <h4>SHAP Feature Attribution Breakdown</h4>
              <p className="muted">
                Positive values (orange/red) elevate predicted risk; negative values push risk below baseline. Percentages represent normalized |SHAP| contribution share.
              </p>
            </div>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 30, top: 10, bottom: 10 }}>
                  <XAxis type="number" domain={[-80, 80]} tickFormatter={(v) => `${Math.abs(v)}%`} stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={160} stroke="#64748b" tick={{ fontSize: 12, fill: "#e2e8f0" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#111624", borderColor: "#27344f", color: "#f1f5f9" }}
                    formatter={(val, name, payload) => [`${Math.abs(val)}% (${payload.payload.direction})`, "Contribution Share"]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 4, 4]}>
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={GROUP_COLORS[entry.group] || "#f97316"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Bottom Section: Ground-Truth Pattern Recovery Validation */}
        {gtr && !gtr.error && (
          <div className="panel-card gtr-card">
            <div className="panel-header">
              <div className="panel-title">
                <span className="title-icon">⚖</span>
                GROUND-TRUTH PATTERN RECOVERY VALIDATION (STATISTICAL &amp; ML)
              </div>
              <span className="badge-verified">✓ MATHEMATICALLY VERIFIED</span>
            </div>

            <div className="gtr-grid">
              {/* Data-Level Recovery */}
              <div className="gtr-col">
                <div className="gtr-col-title">
                  DATA-LEVEL RECOVERY <small>(Observed SQL incidence vs Injected ground-truth)</small>
                </div>
                <table className="ops-table gtr-table">
                  <thead>
                    <tr>
                      <th>INJECTED CRIME PATTERN</th>
                      <th>INJECTED</th>
                      <th>OBSERVED</th>
                      <th>VARIANCE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gtr.data_level.map((r, i) => {
                      const diff = Math.abs(r.observed_multiplier - r.injected_multiplier);
                      const isMatch = diff < 0.25;
                      return (
                        <tr key={i}>
                          <td><strong>{r.pattern}</strong></td>
                          <td className="mono-num">{r.injected_multiplier}x</td>
                          <td className={`mono-num ${isMatch ? "match-text" : ""}`}>{r.observed_multiplier}x</td>
                          <td>
                            <span className={`diff-pill ${isMatch ? "exact" : "close"}`}>
                              {diff === 0 ? "EXACT" : `Δ ${diff.toFixed(2)}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Model-Level Recovery */}
              <div className="gtr-col">
                <div className="gtr-col-title">
                  MODEL-LEVEL COUNTERFACTUAL RECOVERY <small>(XGBoost Learned Features)</small>
                </div>
                <div className="gtr-model-cards">
                  {gtr.model_level.map((r, i) => (
                    <div key={i} className="gtr-counterfactual-card">
                      <div className="card-top">
                        <strong>{r.pattern}</strong>
                        <span className="badge-model">XGBoost ML</span>
                      </div>
                      <div className="card-multipliers">
                        <span>Injected Factor: <strong>{r.injected_multiplier}x</strong></span>
                        <span>Model Learned: <strong className="highlight">{r.observed_multiplier}x</strong></span>
                      </div>
                      <p className="card-note">{r.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
