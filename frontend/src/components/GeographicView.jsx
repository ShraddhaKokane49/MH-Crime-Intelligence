import { useState, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import HeatmapLayer from "./HeatmapLayer";
import FlyToBounds from "./FlyToBounds";
import {
  MAHARASHTRA_CENTER,
  MAHARASHTRA_BOUNDS,
  densityColor,
  densityRadius,
  boundsForStations,
  formatNumber,
} from "../utils";

export default function GeographicView({
  stations,
  incidents,
  districts,
  crimeTypes,
  selectedDistrict,
  setSelectedDistrict,
  crimeTypeFilter,
  setCrimeTypeFilter,
  viewMode,
  setViewMode,
  timeOfDay,
  setTimeOfDay,
  dayType,
  setDayType,
  redzones,
  loading,
  role,
  assignedDistrict,
}) {
  const [selectedStation, setSelectedStation] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const redzoneStationIds = useMemo(() => new Set(redzones.map((r) => r.station_id)), [redzones]);

  const visibleStations = useMemo(() => {
    let list = selectedDistrict
      ? stations.filter((s) => s.district === selectedDistrict)
      : stations;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(term) ||
          s.district.toLowerCase().includes(term)
      );
    }
    return list;
  }, [stations, selectedDistrict, searchTerm]);

  const countRange = useMemo(() => {
    const counts = visibleStations.map((s) => s.incident_count || 0);
    if (counts.length === 0) return { min: 0, max: 1 };
    return { min: Math.min(...counts), max: Math.max(...counts) };
  }, [visibleStations]);

  const flyBounds = useMemo(() => {
    if (selectedDistrict) {
      const filtered = stations.filter((s) => s.district === selectedDistrict);
      return boundsForStations(filtered);
    }
    return null;
  }, [selectedDistrict, stations]);

  return (
    <div className="geo-view-layout">
      {/* Sidebar Control Panel */}
      <aside className="geo-sidebar">
        <div className="sidebar-section-title">
          <span className="icon">❖</span> GEOSPATIAL FILTER CONTROLS
        </div>
        <div style={{ fontSize: "10.5px", padding: "3px 8px", background: "rgba(6, 182, 212, 0.12)", border: "1px solid rgba(6, 182, 212, 0.3)", borderRadius: "4px", color: "var(--accent-cyan)", marginBottom: "10px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent-cyan)" }}></span>
          STATION SIMULATION BENCHMARK (83 PS)
        </div>

        {/* View Mode Toggle */}
        <div className="filter-group">
          <label className="field-label">VISUALIZATION LAYER</label>
          <div className="toggle-btn-group">
            <button
              className={`toggle-btn ${viewMode === "density" ? "active" : ""}`}
              onClick={() => setViewMode("density")}
            >
              📍 Station Density
            </button>
            <button
              className={`toggle-btn ${viewMode === "heatmap" ? "active" : ""}`}
              onClick={() => setViewMode("heatmap")}
            >
              🔥 Incident Heatmap
            </button>
          </div>
        </div>

        {/* District Filter */}
        <div className="filter-group">
          <label className="field-label">
            MAHARASHTRA DISTRICT {role === "officer" && <span className="locked-badge">🔒 LOCKED</span>}
          </label>
          <select
            className="ops-select"
            value={selectedDistrict || ""}
            disabled={role === "officer"}
            onChange={(e) => setSelectedDistrict(e.target.value || null)}
          >
            <option value="">All 36 Maharashtra Districts</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {/* Crime Type Filter */}
        <div className="filter-group">
          <label className="field-label">CRIME CATEGORY</label>
          <select
            className="ops-select"
            value={crimeTypeFilter}
            onChange={(e) => setCrimeTypeFilter(e.target.value)}
          >
            <option value="">All Crime Categories</option>
            {crimeTypes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Heatmap Temporal Filters (only in heatmap mode) */}
        {viewMode === "heatmap" && (
          <div className="heatmap-temporal-box">
            <div className="filter-group">
              <label className="field-label">TIME OF DAY</label>
              <div className="toggle-btn-group three-way">
                <button className={`toggle-btn ${timeOfDay === "" ? "active" : ""}`} onClick={() => setTimeOfDay("")}>
                  All Hours
                </button>
                <button className={`toggle-btn ${timeOfDay === "day" ? "active" : ""}`} onClick={() => setTimeOfDay("day")}>
                  ☀️ Day (05–22)
                </button>
                <button className={`toggle-btn ${timeOfDay === "night" ? "active" : ""}`} onClick={() => setTimeOfDay("night")}>
                  🌙 Night (22–05)
                </button>
              </div>
            </div>

            <div className="filter-group">
              <label className="field-label">DAY TYPE</label>
              <div className="toggle-btn-group three-way">
                <button className={`toggle-btn ${dayType === "" ? "active" : ""}`} onClick={() => setDayType("")}>
                  All Days
                </button>
                <button className={`toggle-btn ${dayType === "weekday" ? "active" : ""}`} onClick={() => setDayType("weekday")}>
                  Mon–Fri
                </button>
                <button className={`toggle-btn ${dayType === "weekend" ? "active" : ""}`} onClick={() => setDayType("weekend")}>
                  Sat–Sun
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Station List with Quick Search */}
        <div className="filter-group station-list-group">
          <label className="field-label">
            ACTIVE STATIONS ({visibleStations.length})
          </label>
          <input
            type="text"
            className="ops-search-input"
            placeholder="Search station or district..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <div className="geo-station-scroll-list">
            {visibleStations.map((s) => (
              <div
                key={s.id}
                className={`geo-station-item ${selectedStation?.id === s.id ? "active" : ""}`}
                onClick={() => setSelectedStation(s)}
              >
                <div className="station-item-main">
                  <strong>{s.name}</strong>
                  <span className="station-item-district">{s.district}</span>
                </div>
                <div className="station-item-metric">
                  <span className="mono-num">{formatNumber(s.incident_count)}</span>
                  {redzoneStationIds.has(s.id) && <span className="dot-alert" title="Active Red-Zone"></span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Map Deck */}
      <main className="geo-map-container">
        {loading && <div className="ops-loading-overlay">Retrieving geospatial coordinates & density data...</div>}

        <MapContainer
          center={MAHARASHTRA_CENTER}
          zoom={7}
          maxBounds={MAHARASHTRA_BOUNDS}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <FlyToBounds bounds={flyBounds} />

          {viewMode === "density" &&
            visibleStations.map((s) => (
              <CircleMarker
                key={s.id}
                center={[s.lat, s.long]}
                radius={densityRadius(s.incident_count, countRange.min, countRange.max)}
                eventHandlers={{
                  click: () => setSelectedStation(s),
                }}
                pathOptions={{
                  color: redzoneStationIds.has(s.id) ? "#ef4444" : "#f97316",
                  weight: redzoneStationIds.has(s.id) ? 3 : 1.5,
                  fillColor: densityColor(s.incident_count, countRange.min, countRange.max),
                  fillOpacity: 0.8,
                  className: redzoneStationIds.has(s.id) ? "pulse-marker" : "",
                }}
              >
                <Popup>
                  <div className="map-popup-dark">
                    <h4>{s.name}</h4>
                    <p className="popup-district">District: <strong>{s.district}</strong></p>
                    <p className="popup-count">
                      {formatNumber(s.incident_count)} incidents
                      {crimeTypeFilter ? ` (${crimeTypeFilter})` : ""}
                    </p>
                    <p className="popup-coords">Coordinates: {s.lat.toFixed(4)}° N, {s.long.toFixed(4)}° E</p>
                    {redzoneStationIds.has(s.id) && (
                      <div className="popup-redzone-tag">⚠ Active Red-Zone Statistical Spike</div>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}

          {viewMode === "heatmap" && <HeatmapLayer points={incidents} />}
        </MapContainer>

        {/* Selected Station Detailed Drawer */}
        {selectedStation && (
          <div className="station-drawer">
            <div className="drawer-header">
              <div className="drawer-title">
                <h3>{selectedStation.name}</h3>
                <span className="drawer-district-tag">{selectedStation.district} District</span>
              </div>
              <button className="drawer-close-btn" onClick={() => setSelectedStation(null)}>✕</button>
            </div>
            <div className="drawer-body">
              <div className="drawer-stat-grid">
                <div className="drawer-stat-box">
                  <span className="stat-label">INCIDENT VOLUME</span>
                  <span className="stat-value">{formatNumber(selectedStation.incident_count)}</span>
                </div>
                <div className="drawer-stat-box">
                  <span className="stat-label">STATUS</span>
                  <span className={`stat-value ${redzoneStationIds.has(selectedStation.id) ? "red-text" : "green-text"}`}>
                    {redzoneStationIds.has(selectedStation.id) ? "RED-ZONE SPIKE" : "NORMAL BASELINE"}
                  </span>
                </div>
              </div>

              <div className="drawer-coords-box">
                <div><strong>Latitude:</strong> {selectedStation.lat.toFixed(5)}° N</div>
                <div><strong>Longitude:</strong> {selectedStation.long.toFixed(5)}° E</div>
                <div><strong>Jurisdiction:</strong> 3.0 km PostGIS Catchment Buffer</div>
              </div>

              {redzoneStationIds.has(selectedStation.id) && (
                <div className="drawer-alert-banner">
                  ⚠ <strong>Statistical Spike Detected:</strong> Recent incident volume at this station exceeds historical baseline standard deviation (Z &gt; 2.0).
                </div>
              )}
            </div>
          </div>
        )}

        {/* Map Legend Overlay */}
        <div className="map-legend-overlay">
          <div className="legend-title">Catchment Incident Density</div>
          <div className="density-gradient-bar"></div>
          <div className="legend-labels">
            <span>Low ({countRange.min})</span>
            <span>Average</span>
            <span>High ({countRange.max})</span>
          </div>
          <div className="legend-redzone-indicator">
            <span className="pulse-dot"></span> Red Halo indicates Anomaly Red-Zone Spike
          </div>
        </div>
      </main>
    </div>
  );
}
