import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { formatNumber } from "../utils";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

const NODE_COLORS = {
  station: "#3b82f6", // Blue for Police Stations
  victim: "#94a3b8",  // Slate for Victims
};

// Distinct MO Cluster Palette for repeat offender rings
const CLUSTER_PALETTE = [
  "#ef4444", // Red - Cluster 0 (Baseline / General)
  "#f97316", // Saffron - Cluster 1 (Injected Repeat-Offender Ring)
  "#10b981", // Emerald - Cluster 2
  "#8b5cf6", // Purple - Cluster 3
  "#06b6d4", // Cyan - Cluster 4
  "#ec4899", // Pink - Cluster 5
];

export default function NetworkGraph({ topN, maxIncidentsPerSuspect, district, districts, onDistrictChange, onTopNChange, onMaxIncidentsChange }) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 600 });

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("top_n_suspects", topN);
    params.set("max_incidents_per_suspect", maxIncidentsPerSuspect);
    if (district) params.set("district", district);

    fetch(`${API_BASE}/api/network?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setGraphData({
          nodes: data.nodes.map((n) => ({ ...n })),
          links: data.links.map((l) => ({ ...l })),
        });
        setSelectedNode(null);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [topN, maxIncidentsPerSuspect, district]);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Compute direct neighbors of the selected node
  const { neighborNodeIds, highlightLinkKeys } = useMemo(() => {
    const nodeIds = new Set();
    const linkKeys = new Set();
    if (!selectedNode) return { neighborNodeIds: nodeIds, highlightLinkKeys: linkKeys };

    nodeIds.add(selectedNode.id);

    graphData.links.forEach((l) => {
      const sourceId = typeof l.source === "object" ? l.source.id : l.source;
      const targetId = typeof l.target === "object" ? l.target.id : l.target;

      if (sourceId === selectedNode.id || targetId === selectedNode.id) {
        nodeIds.add(sourceId);
        nodeIds.add(targetId);
        linkKeys.add(`${sourceId}->${targetId}`);
        linkKeys.add(`${targetId}->${sourceId}`);
      }
    });

    return { neighborNodeIds: nodeIds, highlightLinkKeys: linkKeys };
  }, [selectedNode, graphData.links]);

  // MO Cluster counts for summary legend
  const clusterCounts = useMemo(() => {
    const counts = {};
    graphData.nodes.forEach((n) => {
      if (n.type === "suspect") {
        const cid = n.cluster_id ?? 0;
        counts[cid] = (counts[cid] || 0) + 1;
      }
    });
    return counts;
  }, [graphData.nodes]);

  // Direct connected edges count for selected node
  const selectedNodeConnections = useMemo(() => {
    if (!selectedNode) return [];
    return graphData.links.filter((l) => {
      const sourceId = typeof l.source === "object" ? l.source.id : l.source;
      const targetId = typeof l.target === "object" ? l.target.id : l.target;
      return sourceId === selectedNode.id || targetId === selectedNode.id;
    });
  }, [selectedNode, graphData.links]);

  const getNodeColor = useCallback(
    (node) => {
      let baseColor;
      if (node.type === "suspect") {
        const cid = node.cluster_id ?? 0;
        baseColor = CLUSTER_PALETTE[cid % CLUSTER_PALETTE.length];
      } else {
        baseColor = NODE_COLORS[node.type] || "#ffffff";
      }

      if (!selectedNode) return baseColor;

      // Selection Highlight Logic
      if (node.id === selectedNode.id) return "#ffffff"; // Selected node glow
      if (neighborNodeIds.has(node.id)) return baseColor; // Direct neighbor full color
      return "rgba(50, 60, 80, 0.22)"; // Dimmed non-neighbor
    },
    [selectedNode, neighborNodeIds]
  );

  const getLinkColor = useCallback(
    (link) => {
      if (!selectedNode) return "rgba(148, 163, 184, 0.35)";

      const sourceId = typeof link.source === "object" ? link.source.id : link.source;
      const targetId = typeof link.target === "object" ? link.target.id : link.target;

      if (sourceId === selectedNode.id || targetId === selectedNode.id) {
        return link.relation === "occurred_at" ? "#f97316" : "#06b6d4";
      }
      return "rgba(30, 40, 60, 0.08)";
    },
    [selectedNode]
  );

  const getLinkWidth = useCallback(
    (link) => {
      if (!selectedNode) return Math.min(2.5, 0.8 + link.weight * 0.3);

      const sourceId = typeof link.source === "object" ? link.source.id : link.source;
      const targetId = typeof link.target === "object" ? link.target.id : link.target;

      if (sourceId === selectedNode.id || targetId === selectedNode.id) {
        return 2.5 + Math.min(3, link.weight * 0.5);
      }
      return 0.5;
    },
    [selectedNode]
  );

  if (error) return <div className="ops-error-banner">⚠ Error loading criminal network: {error}</div>;

  return (
    <div className="network-view-layout">
      {/* Left Control Sidebar */}
      <aside className="network-sidebar">
        <div className="sidebar-section-title">
          <span className="icon">☊</span> NETWORK GRAPH CONTROLS
        </div>
        <div style={{ fontSize: "10.5px", padding: "3px 8px", background: "rgba(6, 182, 212, 0.12)", border: "1px solid rgba(6, 182, 212, 0.3)", borderRadius: "4px", color: "var(--accent-cyan)", marginBottom: "10px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--accent-cyan)" }}></span>
          SIMULATION BENCHMARK GRAPH
        </div>

        {/* District Filter */}
        <div className="filter-group">
          <label className="field-label">DISTRICT FILTER</label>
          <select
            className="ops-select"
            value={district || ""}
            onChange={(e) => onDistrictChange && onDistrictChange(e.target.value || null)}
          >
            <option value="">All 36 Districts (State-wide Graph)</option>
            {districts &&
              districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
          </select>
        </div>

        {/* Slider: Top-N Suspects */}
        <div className="filter-group">
          <div className="slider-label-row">
            <span className="field-label">TOP ACTIVE SUSPECTS</span>
            <span className="slider-val-badge">{topN}</span>
          </div>
          <input
            type="range"
            className="ops-slider"
            min="5"
            max="30"
            value={topN}
            onChange={(e) => onTopNChange && onTopNChange(Number(e.target.value))}
          />
          <span className="slider-subtext">Limits graph to top N most active perpetrators</span>
        </div>

        {/* Slider: Max Incidents per Suspect */}
        <div className="filter-group">
          <div className="slider-label-row">
            <span className="field-label">SAMPLED INCIDENTS / SUSPECT</span>
            <span className="slider-val-badge">{maxIncidentsPerSuspect}</span>
          </div>
          <input
            type="range"
            className="ops-slider"
            min="3"
            max="20"
            value={maxIncidentsPerSuspect}
            onChange={(e) => onMaxIncidentsChange && onMaxIncidentsChange(Number(e.target.value))}
          />
          <span className="slider-subtext">Visual edge-bounding to maintain force-graph readability</span>
        </div>

        {/* Graph Legend */}
        <div className="network-legend-box">
          <div className="legend-section-title">ENTITY TYPES &amp; EDGES</div>
          <div className="legend-item">
            <span className="legend-node-dot" style={{ backgroundColor: "#3b82f6" }}></span>
            <span>Police Station Node</span>
          </div>
          <div className="legend-item">
            <span className="legend-node-dot" style={{ backgroundColor: "#94a3b8" }}></span>
            <span>Victim Node</span>
          </div>
          <div className="legend-item">
            <span className="legend-line-sample orange"></span>
            <span>Crime Incident Link (Occurred At)</span>
          </div>
          <div className="legend-item">
            <span className="legend-line-sample cyan"></span>
            <span>Victimization Link (Victim Of)</span>
          </div>

          <div className="legend-section-title" style={{ marginTop: "14px" }}>
            MODUS OPERANDI (MO) CLUSTERS
          </div>
          <p className="legend-desc">
            Agglomerative cosine clustering on weapon, target, escape method, and day/night.
          </p>
          <div className="cluster-legend-list">
            {Object.entries(clusterCounts).map(([cid, count]) => {
              const color = CLUSTER_PALETTE[Number(cid) % CLUSTER_PALETTE.length];
              const isRing = cid === "1" && count > 1;
              return (
                <div key={cid} className={`cluster-pill-row ${isRing ? "ring-highlight" : ""}`}>
                  <span className="cluster-dot" style={{ backgroundColor: color }}></span>
                  <span>Cluster {cid}: <strong>{count} suspect{count !== 1 ? "s" : ""}</strong></span>
                  {isRing && <span className="ring-badge">RECOGNIZED RING</span>}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "14px", borderTop: "1px solid #1e293b", paddingTop: "10px", lineHeight: 1.4 }}>
            Notice: Offender and victim nodes represent the high-resolution simulation benchmark (public NCRB releases omit individual suspects and victims under privacy laws).
          </div>
        </div>
      </aside>

      {/* Center Graph Canvas */}
      <main className="network-graph-main" ref={containerRef}>
        {loading && <div className="ops-loading-overlay">Computing Cosine MO Clusters & Force Simulation...</div>}

        <ForceGraph2D
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="#07090e"
          nodeLabel={(n) => `${n.label} [${n.type.toUpperCase()}]`}
          nodeColor={getNodeColor}
          nodeVal={(n) => (n.type === "suspect" ? 7 : n.type === "station" ? 6 : 2.5)}
          linkColor={getLinkColor}
          linkWidth={getLinkWidth}
          onNodeClick={(n) => setSelectedNode(n)}
          onBackgroundClick={() => setSelectedNode(null)}
          cooldownTicks={100}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.label;
            const fontSize = Math.max(3, 11 / globalScale);
            ctx.font = `${fontSize}px Inter, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (selectedNode && (node.id === selectedNode.id || neighborNodeIds.has(node.id))) {
              ctx.fillStyle = node.id === selectedNode.id ? "#ffffff" : "rgba(241, 245, 249, 0.9)";
              ctx.fillText(label, node.x, node.y + (node.type === "suspect" ? 10 : 8));
            } else if (!selectedNode && globalScale > 1.8) {
              ctx.fillStyle = "rgba(148, 163, 184, 0.75)";
              ctx.fillText(label, node.x, node.y + 9);
            }
          }}
        />

        <div className="graph-floating-hint">
          {selectedNode ? (
            <span>Selected: <strong>{selectedNode.label}</strong> (Click background to reset focus)</span>
          ) : (
            <span>💡 Click any suspect, station, or victim node to isolate direct relationships</span>
          )}
        </div>
      </main>

      {/* Right Entity Details Inspector Panel */}
      <aside className="network-inspector-sidebar">
        <div className="sidebar-section-title">
          <span className="icon">🔍</span> ENTITY DOSSIER INSPECTOR
        </div>

        {selectedNode ? (
          <div className="entity-dossier-card">
            <div className="entity-header">
              <span className={`entity-type-badge ${selectedNode.type}`}>
                {selectedNode.type.toUpperCase()}
              </span>
              <h3>{selectedNode.label}</h3>
              <div className="entity-id-code">ID: {selectedNode.id}</div>
            </div>

            <div className="entity-metrics-grid">
              <div className="entity-metric-box">
                <span className="label">DIRECT CONNECTIONS</span>
                <span className="val">{selectedNodeConnections.length}</span>
              </div>
              {selectedNode.type === "suspect" && (
                <div className="entity-metric-box">
                  <span className="label">MO CLUSTER</span>
                  <span className="val saffron">Cluster {selectedNode.cluster_id ?? 0}</span>
                </div>
              )}
            </div>

            {selectedNode.type === "suspect" && (
              <div className="suspect-mo-profile">
                <div className="profile-title">MODUS OPERANDI SIGNATURE</div>
                <div className="mo-field-row">
                  <span>Dominant Weapon / Method:</span>
                  <strong>{selectedNode.dominant_weapon || "None Recorded"}</strong>
                </div>
                <div className="mo-field-row">
                  <span>Linked Incidents In DB:</span>
                  <strong>{selectedNode.total_incident_count || "N/A"}</strong>
                </div>
                <div className="mo-field-row">
                  <span>Cluster Identification:</span>
                  <strong>{selectedNode.cluster_id === 1 ? "Repeat Offender Ring" : "General Population"}</strong>
                </div>
              </div>
            )}

            <div className="connected-entities-list">
              <div className="list-title">CONNECTED RELATIONSHIPS ({selectedNodeConnections.length})</div>
              <div className="connection-scroll">
                {selectedNodeConnections.map((l, i) => {
                  const targetNode =
                    typeof l.target === "object" ? l.target : graphData.nodes.find((n) => n.id === l.target);
                  const sourceNode =
                    typeof l.source === "object" ? l.source : graphData.nodes.find((n) => n.id === l.source);
                  const other = sourceNode?.id === selectedNode.id ? targetNode : sourceNode;

                  return (
                    <div key={i} className="connection-item">
                      <span className="rel-tag">{l.relation === "occurred_at" ? "OCCURRED AT" : "VICTIM"}</span>
                      <span className="other-name">{other?.label || "Unknown Entity"}</span>
                      <span className="other-type">({other?.type})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-inspector">
            <div className="empty-icon">☊</div>
            <p>No entity currently selected.</p>
            <small>Click on any node in the interactive network graph to view suspect dossier, connections, and MO clustering profile.</small>
          </div>
        )}
      </aside>
    </div>
  );
}
