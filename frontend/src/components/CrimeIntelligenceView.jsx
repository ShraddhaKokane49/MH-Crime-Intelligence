import { useState, useEffect, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  ReferenceLine,
  PieChart,
  Pie,
} from "recharts";
import { api } from "../api";
import { formatNumber } from "../utils";

export default function CrimeIntelligenceView({ stations, districts }) {
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredHeatmapCell, setHoveredHeatmapCell] = useState(null);

  const fetchStats = (district) => {
    setLoading(true);
    setError(null);
    api
      .crimeIntelligenceStats(district)
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load crime intelligence statistics");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStats(selectedDistrict);
  }, [selectedDistrict]);

  const filteredStationsCount = useMemo(() => {
    if (!selectedDistrict) return stations?.length || 83;
    return stations?.filter((s) => s.district === selectedDistrict).length || 0;
  }, [stations, selectedDistrict]);

  // Color generator for Heatmap cells based on count
  const getHeatmapColor = (count, min, max) => {
    if (max === 0 || count === 0) return "#082448";
    const range = max - min || 1;
    const ratio = Math.max(0, Math.min(1, (count - min) / range));
    if (ratio < 0.25) {
      // Deep Navy to Medium Navy
      return "#0D315C";
    } else if (ratio < 0.55) {
      // Medium Navy to Steel Cyan
      return "#174675";
    } else if (ratio < 0.8) {
      // Vivid Cyan
      return "#20C8F4";
    } else {
      // High Peak Orange
      return "#FF8A24";
    }
  };

  // Custom Tooltip for Monthly Bar Chart
  const CustomMonthlyTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const avg = stats?.averageMonthly || 0;
      const diff = avg > 0 ? Math.round(((data.total - avg) / avg) * 100) : 0;
      return (
        <div className="intel-custom-tooltip">
          <div className="tooltip-title">{data.month}</div>
          <div className="tooltip-row">
            <span className="tooltip-label">Incident Count:</span>
            <span className="tooltip-val cyan">{formatNumber(data.total)}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">24-Mo Avg:</span>
            <span className="tooltip-val">{formatNumber(Math.round(avg))}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Deviation:</span>
            <span className={`tooltip-val ${diff >= 0 ? (diff > 12 ? "orange" : "cyan") : "muted"}`}>
              {diff >= 0 ? `+${diff}%` : `${diff}%`}
            </span>
          </div>
          {data.isSpike && (
            <div className="tooltip-badge-spike">
              ⚡ {data.spikeLabel || `Elevated Volume (+${diff}% vs avg)`}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for Day vs Night Chart
  const CustomDiurnalTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="intel-custom-tooltip">
          <div className="tooltip-title">{data.crime}</div>
          <div className="tooltip-row">
            <span className="tooltip-dot" style={{ backgroundColor: "#20C8F4" }}></span>
            <span className="tooltip-label">Daytime (05:00–21:59):</span>
            <span className="tooltip-val cyan">
              {formatNumber(data.dayCount)} ({data.day}%)
            </span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-dot" style={{ backgroundColor: "#9257F6" }}></span>
            <span className="tooltip-label">Nighttime (22:00–04:59):</span>
            <span className="tooltip-val purple">
              {formatNumber(data.nightCount)} ({data.night}%)
            </span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Total Volume:</span>
            <span className="tooltip-val">{formatNumber(data.total)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for Weekday vs Weekend Grouped Chart
  const CustomWeekendTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="intel-custom-tooltip">
          <div className="tooltip-title">{data.crime}</div>
          <div className="tooltip-row">
            <span className="tooltip-dot" style={{ backgroundColor: "#3987F5" }}></span>
            <span className="tooltip-label">Weekday (Mon–Fri):</span>
            <span className="tooltip-val blue">
              {formatNumber(data.weekdayCount)} cases ({data.weekdayRate}/day • {data.weekday}%)
            </span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-dot" style={{ backgroundColor: "#F0444D" }}></span>
            <span className="tooltip-label">Weekend (Sat–Sun):</span>
            <span className="tooltip-val red">
              {formatNumber(data.weekendCount)} cases ({data.weekendRate}/day • {data.weekend}%)
            </span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">Total Volume:</span>
            <span className="tooltip-val">{formatNumber(data.total)}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom Tooltip for Donut Chart
  const CustomCategoryTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="intel-custom-tooltip">
          <div className="tooltip-title">{data.name}</div>
          <div className="tooltip-row">
            <span className="tooltip-label">Incidents:</span>
            <span className="tooltip-val cyan">{formatNumber(data.count)}</span>
          </div>
          <div className="tooltip-row">
            <span className="tooltip-label">State/District Share:</span>
            <span className="tooltip-val saffron">{data.share}%</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="intelligence-view-layout">
      {/* 1. TOP FILTER & METRIC RIBBON */}
      <div className="intel-top-bar">
        <div className="intel-filter-group">
          <label htmlFor="intel-district-select">FILTER BY DISTRICT:</label>
          <select
            id="intel-district-select"
            className="intel-select-dropdown"
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
          >
            <option value="">All 36 Maharashtra Districts</option>
            {districts &&
              districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
          </select>
        </div>

        <div className="intel-stat-pills">
          <div className="intel-pill">
            <span className="pill-label">ACTIVE SCOPE:</span>
            <span className="pill-val">{selectedDistrict || "Entire Maharashtra State"}</span>
          </div>
          <div className="intel-pill">
            <span className="pill-label">SIMULATED INCIDENTS:</span>
            <span className="pill-val saffron">
              {stats ? formatNumber(stats.totalIncidents) : "..."}
            </span>
          </div>
          <div className="intel-pill">
            <span className="pill-label">24-MO MONTHLY AVG:</span>
            <span className="pill-val cyan">
              {stats ? formatNumber(Math.round(stats.averageMonthly)) : "..."}
            </span>
          </div>
          <div className="intel-pill">
            <span className="pill-label">STATIONS ANALYZED:</span>
            <span className="pill-val">{filteredStationsCount}</span>
          </div>
          <button
            className="intel-refresh-btn"
            onClick={() => fetchStats(selectedDistrict)}
            title="Refresh statistics directly from PostgreSQL"
          >
            ⟳ Refresh
          </button>
        </div>
      </div>

      {/* ERROR STATE */}
      {error && (
        <div className="intel-error-card">
          <div className="error-icon">⚠</div>
          <div className="error-body">
            <h4>Failed to Load Crime Intelligence Statistics</h4>
            <p>{error}</p>
          </div>
          <button className="error-retry-btn" onClick={() => fetchStats(selectedDistrict)}>
            Retry Connection
          </button>
        </div>
      )}

      {/* LOADING STATE */}
      {loading && !stats && (
        <div className="intel-loading-card">
          <div className="intel-spinner"></div>
          <p>Querying PostgreSQL Crime Intelligence Repository...</p>
        </div>
      )}

      {/* STATS CONTENT */}
      {stats && (
        <>
          {/* ==============================================================
              CHART 1: MONTHLY CRIME INCIDENTS (24-MONTH FULL-WIDTH BAR CHART)
              ============================================================== */}
          <div className="intel-panel-card intel-full-card">
            <div className="intel-card-header">
              <div className="intel-card-title">
                <span className="title-icon cyan">📊</span>
                <span>24-MONTH CRIME INCIDENT TIMELINE &amp; VOLUME ANOMALIES (2024–2025)</span>
              </div>
              <div className="intel-legend-pills">
                <span className="legend-badge cyan-badge">
                  <span className="badge-swatch cyan"></span> Standard Volume
                </span>
                <span className="legend-badge orange-badge">
                  <span className="badge-swatch orange"></span> High Anomaly (&gt;12% vs avg)
                </span>
                <span className="legend-badge dashed-badge">
                  <span className="badge-line dashed"></span> Monthly Average (
                  {Math.round(stats.averageMonthly).toLocaleString()})
                </span>
              </div>
            </div>

            <div className="intel-chart-wrapper" style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stats.monthlyTrend}
                  margin={{ top: 20, right: 30, left: 10, bottom: 25 }}
                >
                  <XAxis
                    dataKey="month"
                    stroke="#A7C0DF"
                    tick={{ fontSize: 11, fill: "#A7C0DF" }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    stroke="#A7C0DF"
                    tick={{ fontSize: 11, fill: "#A7C0DF" }}
                    tickFormatter={(v) => formatNumber(v)}
                  />
                  <Tooltip content={<CustomMonthlyTooltip />} />
                  <ReferenceLine
                    y={stats.averageMonthly}
                    stroke="#FF8A24"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    label={{
                      value: `Avg: ${Math.round(stats.averageMonthly)}`,
                      fill: "#FF8A24",
                      fontSize: 11,
                      position: "top",
                    }}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {stats.monthlyTrend.map((entry, index) => (
                      <Cell
                        key={`cell-month-${index}`}
                        fill={entry.isSpike ? "#FF8A24" : "#20C8F4"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="intel-card-takeaway">
              <span className="takeaway-icon">💡</span>
              <div className="takeaway-text">
                <strong>Empirical Observation:</strong> {stats.insights.monthlyTakeaway}
              </div>
            </div>
          </div>

          {/* ==============================================================
              ROW 2: DUAL COMPARATIVE CHARTS (DAY VS NIGHT & WEEKDAY VS WEEKEND)
              ============================================================== */}
          <div className="intel-dual-grid">
            {/* CHART 2: DAY VS NIGHT */}
            <div className="intel-panel-card">
              <div className="intel-card-header">
                <div className="intel-card-title">
                  <span className="title-icon purple">🌙</span>
                  <span>DAY VS. NIGHT DIURNAL DISTRIBUTION (%)</span>
                </div>
                <div className="intel-sub-badge">
                  <span>Day: 05:00–21:59 | Night: 22:00–04:59</span>
                </div>
              </div>

              <div className="intel-chart-wrapper" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={stats.dayNight}
                    margin={{ top: 10, right: 30, left: 20, bottom: 10 }}
                  >
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      stroke="#A7C0DF"
                      tick={{ fontSize: 11, fill: "#A7C0DF" }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <YAxis
                      type="category"
                      dataKey="crime"
                      stroke="#A7C0DF"
                      tick={{ fontSize: 11, fill: "#A7C0DF" }}
                      width={100}
                    />
                    <Tooltip content={<CustomDiurnalTooltip />} />
                    <Legend
                      verticalAlign="top"
                      wrapperStyle={{ paddingBottom: 10, fontSize: 11 }}
                    />
                    <Bar
                      dataKey="day"
                      name="Daytime (05:00–21:59)"
                      fill="#20C8F4"
                      stackId="diurnal"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="night"
                      name="Nighttime (22:00–04:59)"
                      fill="#9257F6"
                      stackId="diurnal"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="intel-card-takeaway">
                <span className="takeaway-icon">🌙</span>
                <div className="takeaway-text">
                  <strong>Diurnal Pattern:</strong> {stats.insights.diurnalTakeaway}
                </div>
              </div>
            </div>

            {/* CHART 3: WEEKDAY VS WEEKEND GROUPED BARS */}
            <div className="intel-panel-card">
              <div className="intel-card-header">
                <div className="intel-card-title">
                  <span className="title-icon blue">📅</span>
                  <span>WEEKDAY VS. WEEKEND PATTERN DIVERGENCE (%)</span>
                </div>
                <div className="intel-sub-badge">
                  <span>Normalized Daily Rate: (Mon–Fri vs Sat–Sun)</span>
                </div>
              </div>

              <div className="intel-chart-wrapper" style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.weekdayWeekend}
                    margin={{ top: 10, right: 20, left: 0, bottom: 25 }}
                  >
                    <XAxis
                      dataKey="crime"
                      stroke="#A7C0DF"
                      tick={{ fontSize: 11, fill: "#A7C0DF", angle: -20, textAnchor: "end" }}
                    />
                    <YAxis
                      stroke="#A7C0DF"
                      tick={{ fontSize: 11, fill: "#A7C0DF" }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip content={<CustomWeekendTooltip />} />
                    <Legend
                      verticalAlign="top"
                      wrapperStyle={{ paddingBottom: 10, fontSize: 11 }}
                    />
                    <Bar
                      dataKey="weekday"
                      name="Weekday Rate (Mon–Fri)"
                      fill="#3987F5"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="weekend"
                      name="Weekend Rate (Sat–Sun)"
                      fill="#F0444D"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="intel-card-takeaway">
                <span className="takeaway-icon">📅</span>
                <div className="takeaway-text">
                  <strong>Weekend Divergence:</strong> {stats.insights.weekendTakeaway}
                </div>
              </div>
            </div>
          </div>

          {/* ==============================================================
              ROW 3: HEATMAP (7 DAYS X 24 HOURS) & CATEGORY DONUT CHART
              ============================================================== */}
          <div className="intel-dual-grid">
            {/* CHART 4: HOUR-WISE CRIME HEATMAP */}
            <div className="intel-panel-card">
              <div className="intel-card-header">
                <div className="intel-card-title">
                  <span className="title-icon orange">🔥</span>
                  <span>HOURLY CRIME HEATMAP (7 DAYS × 24 HOURS)</span>
                </div>
                <div className="intel-sub-badge">
                  <span>
                    Peak: {stats.heatmap.peakDay} {stats.heatmap.peakHour} (
                    {formatNumber(stats.heatmap.peakCount)} cases)
                  </span>
                </div>
              </div>

              <div className="intel-heatmap-container">
                {/* Heatmap Grid Table */}
                <div className="intel-heatmap-scroll">
                  <div className="intel-heatmap-grid">
                    {/* Header Row: Hours */}
                    <div className="heatmap-header-row">
                      <div className="heatmap-corner-label">DAY \ HR</div>
                      {stats.heatmap.hours.map((h) => (
                        <div key={`hr-${h}`} className="heatmap-hour-header">
                          {String(h).padStart(2, "0")}
                        </div>
                      ))}
                    </div>

                    {/* Data Rows: 7 Days */}
                    {stats.heatmap.days.map((day, dIdx) => (
                      <div key={`day-row-${day}`} className="heatmap-data-row">
                        <div className="heatmap-day-label">{day}</div>
                        {stats.heatmap.matrix[dIdx].map((cnt, hIdx) => {
                          const bg = getHeatmapColor(cnt, stats.heatmap.min, stats.heatmap.max);
                          const isHovered =
                            hoveredHeatmapCell &&
                            hoveredHeatmapCell.day === day &&
                            hoveredHeatmapCell.hour === hIdx;
                          return (
                            <div
                              key={`cell-${dIdx}-${hIdx}`}
                              className={`heatmap-cell ${isHovered ? "cell-hovered" : ""}`}
                              style={{ backgroundColor: bg }}
                              onMouseEnter={() =>
                                setHoveredHeatmapCell({
                                  day,
                                  hour: hIdx,
                                  count: cnt,
                                })
                              }
                              onMouseLeave={() => setHoveredHeatmapCell(null)}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Heatmap Hover Inspector / Details */}
                <div className="heatmap-hover-inspector">
                  {hoveredHeatmapCell ? (
                    <div className="hover-active-info">
                      <span className="hover-tag">INSPECTING:</span>
                      <strong>{hoveredHeatmapCell.day}</strong> at{" "}
                      <strong>{String(hoveredHeatmapCell.hour).padStart(2, "0")}:00</strong>
                      {" ➔ "}
                      <span className="hover-count saffron">
                        {formatNumber(hoveredHeatmapCell.count)} Incidents
                      </span>
                      <span className="hover-ratio muted">
                        ({Math.round((hoveredHeatmapCell.count / (stats.heatmap.max || 1)) * 100)}% of peak)
                      </span>
                    </div>
                  ) : (
                    <div className="hover-placeholder muted">
                      Hover over any 1-hour grid cell to inspect exact temporal incidence density.
                    </div>
                  )}

                  {/* Heatmap Scale Legend */}
                  <div className="heatmap-scale-legend">
                    <span className="scale-label">Low ({stats.heatmap.min})</span>
                    <div className="scale-bar">
                      <div className="bar-stop" style={{ background: "#0D315C" }}></div>
                      <div className="bar-stop" style={{ background: "#174675" }}></div>
                      <div className="bar-stop" style={{ background: "#20C8F4" }}></div>
                      <div className="bar-stop" style={{ background: "#FF8A24" }}></div>
                    </div>
                    <span className="scale-label">Peak ({stats.heatmap.max})</span>
                  </div>
                </div>
              </div>

              <div className="intel-card-takeaway">
                <span className="takeaway-icon">🔥</span>
                <div className="takeaway-text">
                  <strong>Temporal Density:</strong> {stats.insights.heatmapTakeaway}
                </div>
              </div>
            </div>

            {/* CHART 5: CRIME CATEGORY DONUT CHART */}
            <div className="intel-panel-card">
              <div className="intel-card-header">
                <div className="intel-card-title">
                  <span className="title-icon cyan">🍩</span>
                  <span>CRIME CATEGORY VOLUME DISTRIBUTION</span>
                </div>
                <div className="intel-sub-badge">
                  <span>Total: {formatNumber(stats.totalIncidents)} Incidents</span>
                </div>
              </div>

              <div className="intel-donut-layout">
                <div className="intel-donut-chart-box">
                  <div className="donut-center-metric">
                    <span className="center-number cyan">
                      {formatNumber(stats.totalIncidents)}
                    </span>
                    <span className="center-sublabel">INCIDENTS</span>
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Tooltip content={<CustomCategoryTooltip />} />
                      <Pie
                        data={stats.categoryDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="count"
                      >
                        {stats.categoryDistribution.map((entry, index) => (
                          <Cell
                            key={`pie-cell-${index}`}
                            fill={entry.color}
                            stroke="#0A2A50"
                            strokeWidth={2}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Donut Legend Breakdown Table */}
                <div className="intel-donut-legend-table">
                  {stats.categoryDistribution.map((cat) => (
                    <div key={`legend-${cat.name}`} className="donut-legend-row">
                      <div className="legend-name-group">
                        <span
                          className="legend-color-dot"
                          style={{ backgroundColor: cat.color }}
                        ></span>
                        <span className="legend-crime-name">{cat.name}</span>
                      </div>
                      <div className="legend-num-group">
                        <span className="legend-count">{formatNumber(cat.count)}</span>
                        <span className="legend-share saffron">{cat.share}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="intel-card-takeaway">
                <span className="takeaway-icon">🍩</span>
                <div className="takeaway-text">
                  <strong>Category Profile:</strong> {stats.insights.top2Categories} dominate the
                  distribution, accounting for <strong>{stats.insights.top2Share}%</strong> of all
                  represented crime volume.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
