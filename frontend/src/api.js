const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function getJSON(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
  return res.json();
}

async function postJSON(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} returned ${res.status}`);
  return res.json();
}

export const api = {
  districts: () => getJSON("/api/districts"),
  crimeIntelligenceStats: (district = "") =>
    getJSON(`/api/crime-intelligence-stats${district ? `?district=${encodeURIComponent(district)}` : ""}`),
  stationStats: (crimeType) =>
    getJSON(`/api/station-stats${crimeType ? `?crime_type=${encodeURIComponent(crimeType)}` : ""}`),
  incidents: ({ crimeType, timeOfDay, dayType, district, limit = 5000 } = {}) => {
    const params = new URLSearchParams();
    if (crimeType) params.set("crime_type", crimeType);
    if (timeOfDay) params.set("time_of_day", timeOfDay);
    if (dayType) params.set("day_type", dayType);
    if (district) params.set("district", district);
    params.set("limit", limit);
    return getJSON(`/api/incidents?${params.toString()}`);
  },
  redzones: () => getJSON("/api/redzones"),
  stations: () => getJSON("/api/stations"),
  districtComparison: (source = "real") => getJSON(`/api/district-comparison?source=${source}`),
  riskScores: () => getJSON("/api/risk-score"),
  aiAssistantQuery: (question, context = null) => postJSON("/api/ai-assistant/query", { question, context }),
  realCrimeSummary: () => getJSON("/api/real-crime/summary"),
  realCrimeDistricts: () => getJSON("/api/real-crime/districts"),
  realCrimeTrends: (district = "") => getJSON(`/api/real-crime/trends${district ? `?district=${encodeURIComponent(district)}` : ""}`),
  realCrimeRecords: ({ district, year, limit = 50, page = 1 } = {}) => {
    const params = new URLSearchParams();
    if (district) params.set("district", district);
    if (year) params.set("year", year);
    params.set("limit", limit);
    params.set("page", page);
    return getJSON(`/api/real-crime/records?${params.toString()}`);
  },
  realCrimeMetadata: () => getJSON("/api/real-crime/metadata"),
};

export default API_BASE;
