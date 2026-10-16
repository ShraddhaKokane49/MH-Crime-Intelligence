import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { api } from "../api";
import { formatNumber } from "../utils";

// Distinct color tokens for comparing up to 3 districts
const DISTRICT_COLORS = {
  distA: {
    primary: "#06b6d4",
    secondary: "rgba(6, 182, 212, 0.15)",
    border: "#0891b2",
    glow: "0 0 15px rgba(6, 182, 212, 0.3)",
    name: "Cyan",
  },
  distB: {
    primary: "#f59e0b",
    secondary: "rgba(245, 158, 11, 0.15)",
    border: "#d97706",
    glow: "0 0 15px rgba(245, 158, 11, 0.3)",
    name: "Amber",
  },
  distC: {
    primary: "#a855f7",
    secondary: "rgba(168, 85, 247, 0.15)",
    border: "#9333ea",
    glow: "0 0 15px rgba(168, 85, 247, 0.3)",
    name: "Purple",
  },
};

const CRIME_TYPE_PALETTE = {
  Theft: "#3b82f6",
  Burglary: "#6366f1",
  "Vehicle Theft": "#ec4899",
  Assault: "#ef4444",
  Robbery: "#f97316",
  Cybercrime: "#10b981",
  "Chain Snatching": "#eab308",
  Riots: "#8b5cf6",
  Cheating: "#06b6d4",
  Murder: "#dc2626",
};

export default function DistrictAnalyticsView({ defaultDistrict = "Pune" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Selected comparison slots
  const [districtA, setDistrictA] = useState("Pune");
  const [districtB, setDistrictB] = useState("Mumbai City");
  const [districtC, setDistrictC] = useState("Nagpur");
  const [showDistrictC, setShowDistrictC] = useState(true);

  // Data source toggle: "real" (NCRB Official Government Statistics) | "synthetic" (Simulation FIR Model)
  const [dataSource, setDataSource] = useState("real");

  // Ranking table search and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("rank"); // "rank" | "incidents" | "density" | "risk"
  const [sortOrder, setSortOrder] = useState("asc");

  // Chart view toggle
  const [chartTab, setChartTab] = useState("categories"); // "categories" | "trends" | "radar" | "stations"

  useEffect(() => {
    setLoading(true);
    if (dataSource === "real" && chartTab === "stations") {
      setChartTab("categories");
    }
    api
      .districtComparison(dataSource)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [dataSource]);

  const districtList = useMemo(() => {
    if (!data?.rankings) return [];
    return data.rankings.map((r) => r.district).sort();
  }, [data]);

  const activeDistricts = useMemo(() => {
    if (!data?.districts) return [];
    const list = [];
    if (data.districts[districtA]) list.push({ key: "distA", ...data.districts[districtA], color: DISTRICT_COLORS.distA });
    if (data.districts[districtB]) list.push({ key: "distB", ...data.districts[districtB], color: DISTRICT_COLORS.distB });
    if (showDistrictC && data.districts[districtC]) {
      list.push({ key: "distC", ...data.districts[districtC], color: DISTRICT_COLORS.distC });
    }
    return list;
  }, [data, districtA, districtB, districtC, showDistrictC]);

  // Generate dynamic contextual analysis summary from real data or simulation benchmark
  const dynamicSummary = useMemo(() => {
    if (activeDistricts.length < 2) return "";
    const sortedByVolume = [...activeDistricts].sort((a, b) => b.total_incidents - a.total_incidents);
    const highestVol = sortedByVolume[0];
    const secondVol = sortedByVolume[1];
    const diff = highestVol.total_incidents - secondVol.total_incidents;

    if (data?.data_source === "real_ncrb") {
      const summaries = [];
      const annualAvgStr = formatNumber(highestVol.annual_average || Math.round(highestVol.total_incidents / 12));
      const statePct = data.total_state_incidents > 0
        ? Math.round((highestVol.total_incidents / data.total_state_incidents) * 1000) / 10
        : 0;

      summaries.push(
        `🏛 Official NCRB Government Summary (2001–2012): ${highestVol.district} recorded the highest cumulative crime volume among compared districts with ${formatNumber(highestVol.total_incidents)} registered IPC cases (annual average: ${annualAvgStr} cases/year), comprising ${statePct}% of all authentic Maharashtra IPC records.`
      );

      activeDistricts.forEach((d) => {
        const topCrime = d.dominant_crime?.crime_type || "Theft";
        const topCount = d.dominant_crime?.count || 0;
        const topPct = d.dominant_crime?.percentage || 0;
        const traj = d.historical_trajectory;
        let trendDesc = "";
        if (traj && traj.start_year && traj.end_year) {
          const sign = traj.net_change >= 0 ? "+" : "";
          trendDesc = ` Between ${traj.start_year} and ${traj.end_year}, registered cases in ${d.district} moved from ${formatNumber(traj.start_count)} to ${formatNumber(traj.end_count)} (${sign}${traj.pct_change}% trajectory).`;
        }
        summaries.push(
          `${d.district} was predominantly characterized by ${topCrime} (${topPct}% of district total, ${formatNumber(topCount)} official cases).${trendDesc}`
        );
      });

      summaries.push(
        `Comparative finding: ${highestVol.district} recorded ${formatNumber(diff)} more official IPC cases than ${secondVol.district} across the 12-year NCRB reporting window.`
      );

      summaries.push(
        `(Source Attribution: National Crime Records Bureau, Ministry of Home Affairs, Government of India. Historical records cover 2001–2012 at district reporting unit resolution.)`
      );

      return summaries.join(" ");
    }

    // Simulation mode
    const highestDensity = [...activeDistricts].sort((a, b) => b.incident_density - a.incident_density)[0];
    const summaries = [];
    summaries.push(
      `⚙ FIR Simulation Model Analysis (2024–2025): ${highestVol.district} currently records the highest incident volume (${formatNumber(highestVol.total_incidents)} incidents across ${highestVol.station_count} stations) with an incident density of ${highestVol.incident_density} per station.`
    );

    activeDistricts.forEach((d) => {
      const topCrime = d.dominant_crime?.crime_type || "Theft";
      const topPct = d.dominant_crime?.percentage || 0;
      const topStation = d.top_station ? `${d.top_station.name} (${formatNumber(d.top_station.incident_count)} incidents)` : "N/A";
      summaries.push(
        `${d.district} is predominantly characterized by ${topCrime} (${topPct}% of local volume) with ${topStation} as its primary incident cluster.`
      );
    });

    if (highestDensity && highestDensity.district !== highestVol.district) {
      summaries.push(
        `Note: ${highestDensity.district} exhibits the highest per-station incident density (${highestDensity.incident_density} incidents/station) despite a lower total volume.`
      );
    }

    return summaries.join(" ");
  }, [activeDistricts, data]);

  // Prepare chart dataset: Category Comparison
  const categoryChartData = useMemo(() => {
    if (!data?.crime_types || activeDistricts.length === 0) return [];
    return data.crime_types.map((crime) => {
      const row = { crime };
      activeDistricts.forEach((d) => {
        row[d.district] = d.crime_breakdown?.[crime] || 0;
      });
      return row;
    });
  }, [data, activeDistricts]);

  // Prepare chart dataset: Monthly Trend Comparison
  const monthlyTrendData = useMemo(() => {
    if (activeDistricts.length === 0) return [];
    const allMonths = activeDistricts[0]?.monthly_trends?.map((m) => m.month) || [];
    return allMonths.map((m) => {
      const row = { month: m };
      activeDistricts.forEach((d) => {
        const found = d.monthly_trends?.find((x) => x.month === m);
        row[d.district] = found ? found.count : 0;
      });
      return row;
    });
  }, [activeDistricts]);

  // Prepare chart dataset: Radar Profile (Proportional crime mix %)
  const radarChartData = useMemo(() => {
    if (!data?.crime_types || activeDistricts.length === 0) return [];
    return data.crime_types.map((crime) => {
      const row = { crime };
      activeDistricts.forEach((d) => {
        const count = d.crime_breakdown?.[crime] || 0;
        const pct = d.total_incidents > 0 ? (count / d.total_incidents) * 100 : 0;
        row[d.district] = Math.round(pct * 10) / 10;
      });
      return row;
    });
  }, [data, activeDistricts]);

  // Prepare chart dataset: Station Breakdown comparison
  const stationCompareData = useMemo(() => {
    const list = [];
    activeDistricts.forEach((d) => {
      (d.stations || []).forEach((st) => {
        list.push({
          district: d.district,
          stationName: `${st.name} (${d.district})`,
          incidents: st.incident_count,
          risk: st.predicted_weekly_risk,
        });
      });
    });
    return list.sort((a, b) => b.incidents - a.incidents).slice(0, 12);
  }, [activeDistricts]);

  // Filtered and Sorted Ranking Table Data
  const sortedRankings = useMemo(() => {
    if (!data?.rankings) return [];
    let list = data.rankings.filter(
      (r) =>
        (r.district && r.district.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.dominant_crime && r.dominant_crime.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.top_station && r.top_station.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    list.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (typeof valA === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortOrder === "asc" ? valA - valB : valB - valA;
    });

    return list;
  }, [data, searchQuery, sortBy, sortOrder]);

  const handleApplyPreset = (dA, dB, dC = null) => {
    setDistrictA(dA);
    setDistrictB(dB);
    if (dC) {
      setDistrictC(dC);
      setShowDistrictC(true);
    } else {
      setShowDistrictC(false);
    }
  };

  const handleSelectToCompare = (districtName) => {
    if (districtA === districtName || districtB === districtName || (showDistrictC && districtC === districtName)) {
      return; // already selected
    }
    if (!showDistrictC) {
      setDistrictC(districtName);
      setShowDistrictC(true);
    } else {
      setDistrictB(districtName);
    }
  };

  if (loading) {
    return (
      <div className="ops-loading-container">
        <div className="ops-spinner"></div>
        <p>Loading Maharashtra District Intelligence & Aggregated Analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ops-error-banner">
        <span>⚠ Failed to load District Analytics: {error}</span>
      </div>
    );
  }

  return (
    <div className="district-analytics-layout">
      {/* Top Header & Selector Deck */}
      <div className="dist-analytics-header-card">
        <div className="dist-header-title-row">
          <div>
            <h2 className="dist-page-title">
              <span className="dist-title-icon">⚖</span> DISTRICT COMPARISON & STATE-WIDE RANKING
            </h2>
            <p className="dist-page-subtitle">
              {dataSource === "real"
                ? "Multi-district comparative intelligence, longitudinal trend trajectories, crime profile breakdowns, and state-wide incident rankings across all 34 NCRB reporting units (2001–2012)."
                : "Multi-district comparative intelligence, temporal trend trajectories, crime profile breakdowns, and state-wide incident density rankings across all 36 Maharashtra districts."}
            </p>
          </div>

          <div className="dist-source-toggle-group">
            <div className="dist-source-pills">
              <button
                className={`dist-source-pill ${dataSource === "real" ? "active" : ""}`}
                onClick={() => setDataSource("real")}
                title="Official National Crime Records Bureau (NCRB) Government Statistics"
              >
                🏛 Official NCRB Dataset (Real)
              </button>
              <button
                className={`dist-source-pill ${dataSource === "synthetic" ? "active" : ""}`}
                onClick={() => setDataSource("synthetic")}
                title="Synthetic High-Resolution FIR Simulation Model"
              >
                ⚙ FIR Simulation Model
              </button>
            </div>
            <div className="dist-source-attribution">
              {data.data_source === "real_ncrb" ? (
                <span className="source-verified-tag">
                  ✓ Verified Source: <strong>NCRB Govt of India (2001–2012)</strong> • 552 Official Records
                </span>
              ) : (
                <span className="source-sim-tag">
                  ℹ Source: Synthetic FIR Simulation Pipeline (Benchmark / Anomaly Demo)
                </span>
              )}
            </div>
          </div>

          <div className="dist-state-badge">
            <span className="dist-badge-label">
              {dataSource === "real" ? "NCRB STATE TOTAL (2001-2012)" : "SIMULATED STATE TOTAL"}
            </span>
            <span className="dist-badge-val">{formatNumber(data.total_state_incidents)} Incidents</span>
            <span className="dist-badge-sub">
              {dataSource === "real" ? "34 NCRB Reporting Units • 12 Years" : "36 Districts • 83 Police Stations"}
            </span>
          </div>
        </div>

        {/* District Selector Controls */}
        <div className="dist-selector-ribbon">
          <div className="dist-slot-box slot-a">
            <span className="slot-indicator" style={{ background: DISTRICT_COLORS.distA.primary }}></span>
            <label>DISTRICT A (PRIMARY)</label>
            <select
              className="dist-select"
              value={districtA}
              onChange={(e) => setDistrictA(e.target.value)}
            >
              {districtList.map((d) => (
                <option key={`a-${d}`} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="dist-vs-pill">VS</div>

          <div className="dist-slot-box slot-b">
            <span className="slot-indicator" style={{ background: DISTRICT_COLORS.distB.primary }}></span>
            <label>DISTRICT B (COMPARATOR)</label>
            <select
              className="dist-select"
              value={districtB}
              onChange={(e) => setDistrictB(e.target.value)}
            >
              {districtList.map((d) => (
                <option key={`b-${d}`} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {showDistrictC ? (
            <>
              <div className="dist-vs-pill">VS</div>
              <div className="dist-slot-box slot-c">
                <span className="slot-indicator" style={{ background: DISTRICT_COLORS.distC.primary }}></span>
                <div className="slot-c-header">
                  <label>DISTRICT C (OPTIONAL)</label>
                  <button
                    className="dist-remove-c-btn"
                    onClick={() => setShowDistrictC(false)}
                    title="Remove District C"
                  >
                    ✕
                  </button>
                </div>
                <select
                  className="dist-select"
                  value={districtC}
                  onChange={(e) => setDistrictC(e.target.value)}
                >
                  {districtList.map((d) => (
                    <option key={`c-${d}`} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <button className="dist-add-c-btn" onClick={() => setShowDistrictC(true)}>
              + Add 3rd District
            </button>
          )}

          {/* Preset Quick Actions */}
          <div className="dist-presets-container">
            <span className="preset-label">QUICK COMPARISONS:</span>
            <button
              className="preset-pill"
              onClick={() => handleApplyPreset("Pune", "Mumbai City", "Nagpur")}
            >
              Metros (Pune / Mumbai / Nagpur)
            </button>
            <button
              className="preset-pill"
              onClick={() => handleApplyPreset("Thane", "Nashik", "Chhatrapati Sambhajinagar")}
            >
              Industrial Hubs
            </button>
            <button
              className="preset-pill"
              onClick={() => handleApplyPreset("Kolhapur", "Solapur", "Satara")}
            >
              Southern Region
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Intelligence Summary Alert */}
      <div className="dist-summary-banner">
        <div className="summary-icon-box">💡</div>
        <div className="summary-content">
          <div className="summary-tag">AUTOMATED DISTRICT INTELLIGENCE SUMMARY</div>
          <p className="summary-text">{dynamicSummary}</p>
        </div>
      </div>

      {/* Comparison Metric Cards Grid */}
      <div className={`dist-cards-grid grid-${activeDistricts.length}`}>
        {activeDistricts.map((dist, idx) => {
          const colorToken = dist.color;
          return (
            <div
              key={dist.district}
              className="dist-card"
              style={{
                borderColor: colorToken.border,
                boxShadow: colorToken.glow,
              }}
            >
              <div className="dist-card-header">
                <div>
                  <div className="dist-card-sub">
                    <span className="dist-card-slot-tag" style={{ color: colorToken.primary }}>
                      DISTRICT {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="dist-rank-badge">State Rank #{dist.rank}</span>
                  </div>
                  <h3 className="dist-card-name" style={{ color: colorToken.primary }}>
                    {dist.district}
                  </h3>
                </div>

                <div className={`dist-risk-pill risk-${dist.risk_level.toLowerCase()}`}>
                  {dist.risk_level.toUpperCase()} RISK
                </div>
              </div>

              {data.data_source === "real_ncrb" ? (
                <div className="dist-card-metrics-grid">
                  <div className="dist-card-metric">
                    <span className="metric-label">TOTAL IPC CRIMES</span>
                    <span className="metric-val">{formatNumber(dist.total_incidents)}</span>
                    <span className="metric-sub">
                      {Math.round((dist.total_incidents / data.total_state_incidents) * 1000) / 10}% of State (2001–2012)
                    </span>
                  </div>

                  <div className="dist-card-metric">
                    <span className="metric-label">ANNUAL AVERAGE</span>
                    <span className="metric-val">
                      {formatNumber(dist.annual_average || Math.round(dist.total_incidents / 12))}
                    </span>
                    <span className="metric-sub">Cases / Year (12 Yrs)</span>
                  </div>

                  <div className="dist-card-metric">
                    <span className="metric-label">12-YR TRAJECTORY</span>
                    <span
                      className="metric-val"
                      style={{
                        color:
                          (dist.historical_trajectory?.pct_change || 0) >= 0
                            ? "#ef4444"
                            : "#22c55e",
                      }}
                    >
                      {(dist.historical_trajectory?.pct_change || 0) >= 0 ? "+" : ""}
                      {dist.historical_trajectory?.pct_change || 0}%
                    </span>
                    <span className="metric-sub">
                      2001: {formatNumber(dist.historical_trajectory?.start_count || 0)} → 2012: {formatNumber(dist.historical_trajectory?.end_count || 0)}
                    </span>
                  </div>

                  <div className="dist-card-metric">
                    <span className="metric-label">DOMINANT CRIME</span>
                    <span className="metric-val highlight">{dist.dominant_crime?.crime_type}</span>
                    <span className="metric-sub">
                      {dist.dominant_crime?.percentage}% of District ({formatNumber(dist.dominant_crime?.count || 0)})
                    </span>
                  </div>
                </div>
              ) : (
                <div className="dist-card-metrics-grid">
                  <div className="dist-card-metric">
                    <span className="metric-label">TOTAL INCIDENTS</span>
                    <span className="metric-val">{formatNumber(dist.total_incidents)}</span>
                    <span className="metric-sub">
                      {Math.round((dist.total_incidents / data.total_state_incidents) * 1000) / 10}% of State
                    </span>
                  </div>

                  <div className="dist-card-metric">
                    <span className="metric-label">ACTIVE STATIONS</span>
                    <span className="metric-val">{dist.station_count}</span>
                    <span className="metric-sub">Jurisdictions</span>
                  </div>

                  <div className="dist-card-metric">
                    <span className="metric-label">INCIDENT DENSITY</span>
                    <span className="metric-val">{dist.incident_density}</span>
                    <span className="metric-sub">Incidents / Station</span>
                  </div>

                  <div className="dist-card-metric">
                    <span className="metric-label">DOMINANT CRIME</span>
                    <span className="metric-val highlight">{dist.dominant_crime?.crime_type}</span>
                    <span className="metric-sub">{dist.dominant_crime?.percentage}% of District</span>
                  </div>
                </div>
              )}

              {/* Station Hotspot / Dataset Detail Strip */}
              <div className="dist-hotspot-strip">
                {data.data_source === "real_ncrb" ? (
                  <>
                    <span className="hotspot-label">DATASET ATTRIBUTION:</span>
                    <span className="hotspot-station-name">NCRB Annual District Statistics (2001–2012)</span>
                    <span className="hotspot-count">552 Official Records</span>
                  </>
                ) : (
                  <>
                    <span className="hotspot-label">TOP CLUSTER STATION:</span>
                    <span className="hotspot-station-name">{dist.top_station?.name || "N/A"}</span>
                    <span className="hotspot-count">
                      {formatNumber(dist.top_station?.incident_count || 0)} incidents
                    </span>
                  </>
                )}
              </div>

              {/* Temporal Split Indicators */}
              <div className="dist-temporal-split">
                {dist.day_night_split?.available !== false ? (
                  <>
                    <div className="temporal-item">
                      <span className="temp-label">Day vs Night:</span>
                      <span className="temp-val">
                        ☀ {100 - dist.day_night_split.night_pct}% / 🌙 {dist.day_night_split.night_pct}% Night
                      </span>
                    </div>
                    <div className="temporal-item">
                      <span className="temp-label">Weekday vs Weekend:</span>
                      <span className="temp-val">
                        📅 {100 - dist.weekend_split.weekend_pct}% / ⚡ {dist.weekend_split.weekend_pct}% Weekend
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="temporal-item" style={{ flex: 1 }}>
                    <span className="temp-label">Temporal Resolution:</span>
                    <span className="temp-val" style={{ color: "#94a3b8", fontStyle: "italic", fontSize: "11px" }}>
                      Annual District Aggregate • Hourly/Day splits not reported in NCRB tables
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Visual Comparisons Panel */}
      <div className="dist-visual-panel">
        <div className="dist-panel-top-nav">
          <div className="panel-title-group">
            <span className="panel-icon">📊</span>
            <span className="panel-title">COMPARATIVE VISUAL INTELLIGENCE</span>
          </div>

          <div className="chart-tabs-group">
            <button
              className={`chart-tab-btn ${chartTab === "categories" ? "active" : ""}`}
              onClick={() => setChartTab("categories")}
            >
              Crime Category Breakdown
            </button>
            <button
              className={`chart-tab-btn ${chartTab === "trends" ? "active" : ""}`}
              onClick={() => setChartTab("trends")}
            >
              {data.data_source === "real_ncrb" ? "Annual Historical Trends (2001–2012)" : "Monthly Trajectory Trend"}
            </button>
            <button
              className={`chart-tab-btn ${chartTab === "radar" ? "active" : ""}`}
              onClick={() => setChartTab("radar")}
            >
              Crime Mix Radar (%)
            </button>
            {data.data_source !== "real_ncrb" && (
              <button
                className={`chart-tab-btn ${chartTab === "stations" ? "active" : ""}`}
                onClick={() => setChartTab("stations")}
              >
                Station-Level Clusters
              </button>
            )}
          </div>
        </div>

        <div className="chart-render-container">
          {/* 1. Category Breakdown Grouped Bar Chart */}
          {chartTab === "categories" && (
            <div className="chart-wrapper">
              <div className="chart-caption">
                {data.data_source === "real_ncrb"
                  ? "Distribution of registered crime volume across IPC categories from authentic NCRB records (2001–2012)."
                  : "Comparative distribution of incident volume across all 7 crime categories in selected districts."}
              </div>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={categoryChartData} margin={{ top: 20, right: 30, left: 20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="crime" stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <YAxis stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.95)",
                      borderColor: "rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: "15px" }} />
                  {activeDistricts.map((d) => (
                    <Bar
                      key={d.district}
                      dataKey={d.district}
                      name={d.district}
                      fill={d.color.primary}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 2. Monthly Trend Trajectory Multi-Line Chart */}
          {chartTab === "trends" && (
            <div className="chart-wrapper">
              <div className="chart-caption">
                {data.data_source === "real_ncrb"
                  ? "12-Year historical crime trend trajectory (2001–2012) from authentic National Crime Records Bureau records."
                  : "Chronological monthly incident volume (2024–2025). Notice the seasonal festival spike in Oct-Nov and recent spikes."}
              </div>
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={monthlyTrendData} margin={{ top: 20, right: 30, left: 20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="month" stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.95)",
                      borderColor: "rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                    }}
                  />
                  <Legend wrapperStyle={{ paddingTop: "15px" }} />
                  {activeDistricts.map((d) => (
                    <Line
                      key={d.district}
                      type="monotone"
                      dataKey={d.district}
                      name={d.district}
                      stroke={d.color.primary}
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 6 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 3. Crime Mix Radar Chart */}
          {chartTab === "radar" && (
            <div className="chart-wrapper">
              <div className="chart-caption">
                Proportional crime fingerprint (% of district total). Compares operational crime specialization patterns.
              </div>
              <ResponsiveContainer width="100%" height={360}>
                <RadarChart data={radarChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <PolarGrid stroke="rgba(255,255,255,0.1)" />
                  <PolarAngleAxis dataKey="crime" stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <PolarRadiusAxis stroke="#64748b" angle={30} domain={[0, 40]} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.95)",
                      borderColor: "rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                    }}
                  />
                  <Legend />
                  {activeDistricts.map((d) => (
                    <Radar
                      key={d.district}
                      name={d.district}
                      dataKey={d.district}
                      stroke={d.color.primary}
                      fill={d.color.primary}
                      fillOpacity={0.25}
                    />
                  ))}
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 4. Station-Level Comparison Bar Chart (Simulation mode only) */}
          {chartTab === "stations" && data.data_source !== "real_ncrb" && (
            <div className="chart-wrapper">
              <div className="chart-caption">
                {data.data_source === "real_ncrb"
                  ? "Representative police station catchments (FIR Simulation Benchmark model). Official NCRB government records are reported at annual district level."
                  : "Top police stations across selected districts by incident volume and predictive risk intensity."}
              </div>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={stationCompareData}
                  layout="vertical"
                  margin={{ top: 20, right: 30, left: 140, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" stroke="#94a3b8" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                  <YAxis
                    dataKey="stationName"
                    type="category"
                    stroke="#94a3b8"
                    tick={{ fill: "#cbd5e1", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.95)",
                      borderColor: "rgba(255,255,255,0.15)",
                      borderRadius: "8px",
                      color: "#f8fafc",
                    }}
                  />
                  <Bar dataKey="incidents" name="Incidents" radius={[0, 4, 4, 0]}>
                    {stationCompareData.map((entry, index) => {
                      const matchDist = activeDistricts.find((d) => d.district === entry.district);
                      const fill = matchDist ? matchDist.color.primary : "#38bdf8";
                      return <Cell key={`cell-${index}`} fill={fill} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Maharashtra District Crime Ranking Table */}
      <div className="dist-ranking-card">
        <div className="dist-ranking-header">
          <div>
            <h3 className="ranking-title">
              <span className="ranking-icon">🏆</span> MAHARASHTRA DISTRICT CRIME RANKING
            </h3>
            <p className="ranking-subtitle">
              {data?.data_source === "real_ncrb"
                ? "Comprehensive statewide ranking across all 34 Maharashtra reporting units based on official National Crime Records Bureau (NCRB) IPC records (2001–2012)."
                : "Comprehensive statewide ranking across all 36 Maharashtra administrative districts based on total incident volume, jurisdictional density, and predictive risk tier."}
            </p>
          </div>

          <div className="ranking-controls">
            <input
              type="text"
              placeholder={data?.data_source === "real_ncrb" ? "Search district or dominant crime..." : "Search district, dominant crime, or station..."}
              className="ranking-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <div className="ranking-sort-group">
              <label>SORT BY:</label>
              <select
                className="ranking-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="rank">State Rank</option>
                <option value="total_incidents">
                  {data?.data_source === "real_ncrb" ? "Total IPC Volume" : "Incident Volume"}
                </option>
                {data?.data_source === "real_ncrb" ? (
                  <>
                    <option value="annual_average">Annual Average</option>
                    <option value="trajectory_pct">12-Yr Trajectory</option>
                  </>
                ) : (
                  <>
                    <option value="incident_density">Incident Density</option>
                    <option value="avg_predicted_risk">Predicted Risk</option>
                  </>
                )}
                <option value="district">District Name</option>
              </select>
              <button
                className="sort-order-btn"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                title="Toggle Sort Order"
              >
                {sortOrder === "asc" ? "▲ ASC" : "▼ DESC"}
              </button>
            </div>
          </div>
        </div>

        <div className="ranking-table-wrapper">
          <table className="ranking-table">
            <thead>
              {data?.data_source === "real_ncrb" ? (
                <tr>
                  <th style={{ width: "70px" }}>RANK</th>
                  <th>DISTRICT</th>
                  <th>TOTAL IPC CRIMES (2001–2012)</th>
                  <th>ANNUAL AVERAGE</th>
                  <th>STATE SHARE</th>
                  <th>DOMINANT CRIME</th>
                  <th>12-YR TRAJECTORY</th>
                  <th>RISK LEVEL</th>
                  <th style={{ textAlign: "center" }}>ACTION</th>
                </tr>
              ) : (
                <tr>
                  <th style={{ width: "70px" }}>RANK</th>
                  <th>DISTRICT</th>
                  <th>ACTIVE STATIONS</th>
                  <th>INCIDENT VOLUME</th>
                  <th>INCIDENT DENSITY</th>
                  <th>DOMINANT CRIME</th>
                  <th>TOP HOTSPOT STATION</th>
                  <th>RISK LEVEL</th>
                  <th style={{ textAlign: "center" }}>ACTION</th>
                </tr>
              )}
            </thead>
            <tbody>
              {sortedRankings.map((row) => {
                const isSelectedA = districtA === row.district;
                const isSelectedB = districtB === row.district;
                const isSelectedC = showDistrictC && districtC === row.district;
                const isSelected = isSelectedA || isSelectedB || isSelectedC;

                const maxVolume = data.rankings[0]?.total_incidents || 5000;
                const progressPct = Math.round((row.total_incidents / maxVolume) * 100);

                return (
                  <tr key={row.district} className={isSelected ? "row-selected" : ""}>
                    <td className="rank-cell">
                      <span className={`rank-number rank-${row.rank <= 3 ? "top3" : "normal"}`}>
                        #{row.rank}
                      </span>
                    </td>
                    <td className="district-cell">
                      <strong>{row.district}</strong>
                      {isSelected && (
                        <span
                          className="selected-slot-tag"
                          style={{
                            color: isSelectedA
                              ? DISTRICT_COLORS.distA.primary
                              : isSelectedB
                              ? DISTRICT_COLORS.distB.primary
                              : DISTRICT_COLORS.distC.primary,
                          }}
                        >
                          {isSelectedA ? "Slot A" : isSelectedB ? "Slot B" : "Slot C"}
                        </span>
                      )}
                    </td>

                    {data?.data_source === "real_ncrb" ? (
                      <>
                        <td>
                          <div className="volume-bar-cell">
                            <span className="volume-text">{formatNumber(row.total_incidents)}</span>
                            <div className="volume-bar-bg">
                              <div
                                className="volume-bar-fill"
                                style={{
                                  width: `${progressPct}%`,
                                  backgroundColor: row.rank <= 3 ? "#ef4444" : "#38bdf8",
                                }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong>{formatNumber(row.annual_average || Math.round(row.total_incidents / 12))}</strong>{" "}
                          <span className="sub-unit">/ year</span>
                        </td>
                        <td>
                          <strong>{row.state_percentage}%</strong> <span className="sub-unit">of state</span>
                        </td>
                        <td>
                          <span
                            className="crime-tag"
                            style={{
                              backgroundColor: `${CRIME_TYPE_PALETTE[row.dominant_crime] || "#3b82f6"}22`,
                              color: CRIME_TYPE_PALETTE[row.dominant_crime] || "#3b82f6",
                              border: `1px solid ${CRIME_TYPE_PALETTE[row.dominant_crime] || "#3b82f6"}66`,
                            }}
                          >
                            {row.dominant_crime} ({row.dominant_crime_pct}%)
                          </span>
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: "600",
                              color: (row.trajectory_pct || 0) >= 0 ? "#ef4444" : "#22c55e",
                            }}
                          >
                            {(row.trajectory_pct || 0) >= 0 ? "+" : ""}
                            {row.trajectory_pct || 0}%
                          </span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{row.station_count} PS</td>
                        <td>
                          <div className="volume-bar-cell">
                            <span className="volume-text">{formatNumber(row.total_incidents)}</span>
                            <div className="volume-bar-bg">
                              <div
                                className="volume-bar-fill"
                                style={{
                                  width: `${progressPct}%`,
                                  backgroundColor: row.rank <= 3 ? "#ef4444" : "#38bdf8",
                                }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong>{row.incident_density}</strong> <span className="sub-unit">/ PS</span>
                        </td>
                        <td>
                          <span
                            className="crime-tag"
                            style={{
                              backgroundColor: `${CRIME_TYPE_PALETTE[row.dominant_crime] || "#3b82f6"}22`,
                              color: CRIME_TYPE_PALETTE[row.dominant_crime] || "#3b82f6",
                              border: `1px solid ${CRIME_TYPE_PALETTE[row.dominant_crime] || "#3b82f6"}66`,
                            }}
                          >
                            {row.dominant_crime} ({row.dominant_crime_pct}%)
                          </span>
                        </td>
                        <td>
                          <div className="hotspot-text">
                            <span className="station-name">{row.top_station || "N/A"}</span>
                            <span className="station-sub">{formatNumber(row.top_station_incidents || 0)} inc.</span>
                          </div>
                        </td>
                      </>
                    )}
                    <td>
                      <span className={`rank-risk-badge risk-${row.risk_level.toLowerCase()}`}>
                        {row.risk_level}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        className={`compare-action-btn ${isSelected ? "active" : ""}`}
                        onClick={() => handleSelectToCompare(row.district)}
                      >
                        {isSelected ? "Comparing" : "⚡ Compare"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
