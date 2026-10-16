import { useState, useRef, useEffect } from "react";
import { api } from "../api";

const PRESET_QUERIES = [
  {
    category: "Official NCRB Data (Real)",
    questions: [
      "What real crime dataset is used in this platform?",
      "Which district has the highest crime in the official NCRB data?",
      "Compare Pune and Nagpur in the NCRB dataset.",
      "What was the 2001 to 2012 crime trend in Maharashtra?",
    ],
  },
  {
    category: "Simulation Volume & Leaderboards",
    questions: [
      "Which district has the highest number of incidents?",
      "Compare Pune and Nagpur.",
      "What are the top crime categories in Pune?",
    ],
  },
  {
    category: "Simulation Risk & Patterns",
    questions: [
      "Which stations have the highest vehicle theft?",
      "What crimes happen most frequently at night?",
      "Which stations are currently high risk?",
      "Why is Shivajinagar considered a red zone?",
    ],
  },
];

export default function AiAssistantView({ onNavigate, role, assignedDistrict }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastContext, setLastContext] = useState(null);
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      type: "assistant",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      answer:
        "**Maharashtra AI Crime Intelligence Assistant initialized.**\n\n" +
        "I provide deterministic, verified intelligence across our **Hybrid Data Architecture**:\n\n" +
        "🏛 **1. Official NCRB Government Dataset (Real, 2001–2012):**\n" +
        "• **2,273,436 official registered IPC crimes** across 34 reporting units.\n" +
        "• Query historical district totals, state rankings, IPC crime categories, district comparisons, and 12-year longitudinal trends.\n\n" +
        "⚙ **2. Synthetic FIR Simulation Benchmark (2024–2025):**\n" +
        "• **90,305 incidents across 83 police stations**.\n" +
        "• Query station-level catchment rankings, nocturnal/hourly patterns, XGBoost risk scores, and suspect network graphs.\n\n" +
        "Select a preset query below or type your custom investigation.",
      source: "Hybrid Architecture: NCRB Real Data + Simulation Benchmark",
      data: null,
      action: null,
    },
  ]);

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (questionText) => {
    const textToSend = (questionText || query).trim();
    if (!textToSend || loading) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      type: "user",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    setQuery("");
    setLoading(true);

    try {
      const response = await api.aiAssistantQuery(textToSend, lastContext);
      if (response.context) {
        setLastContext(response.context);
      }
      const assistantMsg = {
        id: `a-${Date.now()}`,
        type: "assistant",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        answer: response.answer,
        source: response.source || "PostgreSQL ksp_crime",
        data: response.data && response.data.length > 0 ? response.data : null,
        queryType: response.query_type,
        action: response.action,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          type: "assistant",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          answer: `⚠️ Communication error with Intelligence Engine: ${err.message}. Please verify the backend server status.`,
          source: "Internal Error",
          data: null,
          action: null,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setLastContext(null);
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        type: "assistant",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        answer:
          "**Chat history cleared.** AI Assistant ready for new analytical queries across NCRB Real Data and Simulation Benchmark.",
        source: "Hybrid Architecture: NCRB Real Data + Simulation Benchmark",
        data: null,
        action: null,
      },
    ]);
  };

  const renderFormattedAnswer = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    return (
      <div className="assistant-text-content">
        {lines.map((line, idx) => {
          if (!line.trim()) return <div key={idx} className="ai-blank-line" />;
          
          // Format bold text **word** and italic *word*
          const formattedLine = line.split(/(\*\*.*?\*\*|\*.*?\*)/g).map((chunk, cIdx) => {
            if (chunk.startsWith("**") && chunk.endsWith("**")) {
              return <strong key={cIdx} className="ai-highlight">{chunk.slice(2, -2)}</strong>;
            }
            if (chunk.startsWith("*") && chunk.endsWith("*")) {
              return <em key={cIdx} className="ai-italic">{chunk.slice(1, -1)}</em>;
            }
            return chunk;
          });

          if (line.trim().startsWith("•") || line.trim().startsWith("-")) {
            return (
              <div key={idx} className="ai-bullet-item">
                <span className="ai-bullet-dot">›</span>
                <span>{formattedLine}</span>
              </div>
            );
          }

          if (/^\d+\./.test(line.trim())) {
            return (
              <div key={idx} className="ai-numbered-item">
                <span>{formattedLine}</span>
              </div>
            );
          }

          return <p key={idx} className="ai-paragraph">{formattedLine}</p>;
        })}
      </div>
    );
  };

  return (
    <div className="ai-assistant-container">
      {/* Top Banner */}
      <div className="ai-header-banner">
        <div className="ai-banner-left">
          <div className="ai-avatar-badge">
            <span className="ai-avatar-icon">🤖</span>
            <span className="ai-pulse-dot"></span>
          </div>
          <div>
            <h2 className="ai-title">AI CRIME INTELLIGENCE ASSISTANT</h2>
            <p className="ai-subtitle">
              Dual-Pipeline Natural Language Query Engine • Grounded in Official NCRB Historical Repository (2,273,436 Records) &amp; Synthetic FIR Simulation Benchmark (90,305 Incidents, XGBoost ML)
            </p>
          </div>
        </div>
        <div className="ai-banner-right">
          <div className="ai-spec-badge">
            <span className="spec-label">ARCHITECTURE:</span>
            <span className="spec-val">HYBRID REAL + SIM</span>
          </div>
          <div className="ai-spec-badge">
            <span className="spec-label">GROUNDING:</span>
            <span className="spec-val active-green">VERIFIED SQL / ML</span>
          </div>
          <button className="ai-clear-btn" onClick={handleClear} title="Clear conversation log">
            🗑 Clear Chat
          </button>
        </div>
      </div>

      {/* Preset Suggestions Accordion/Row */}
      <div className="ai-presets-card">
        <div className="ai-presets-title">
          <span>⚡ QUICK ANALYTICAL INVESTIGATIONS</span>
          <span className="ai-presets-hint">Click any query to execute instantly</span>
        </div>
        <div className="ai-preset-grid">
          {PRESET_QUERIES.map((grp, gIdx) => (
            <div key={gIdx} className="ai-preset-group">
              <div className="ai-preset-cat-title">{grp.category}</div>
              <div className="ai-preset-buttons">
                {grp.questions.map((qText, qIdx) => (
                  <button
                    key={qIdx}
                    className="ai-preset-chip"
                    onClick={() => handleSend(qText)}
                    disabled={loading}
                  >
                    <span className="preset-chip-icon">💬</span>
                    <span className="preset-chip-text">{qText}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Log Window */}
      <div className="ai-chat-window">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-message-row ${msg.type}`}>
            <div className="ai-msg-avatar">
              {msg.type === "user" ? "👮" : "🤖"}
            </div>

            <div className="ai-msg-body">
              <div className="ai-msg-header">
                <span className="ai-msg-sender">
                  {msg.type === "user" ? (role === "officer" ? `Officer (${assignedDistrict})` : "State Analyst") : "Crime Intelligence Engine"}
                </span>
                <span className="ai-msg-time">{msg.timestamp}</span>
                {msg.source && (
                  <span className="ai-msg-source-badge">
                    <span className="source-dot"></span>
                    {msg.source}
                  </span>
                )}
              </div>

              <div className="ai-msg-content">
                {msg.type === "user" ? (
                  <p className="user-query-text">{msg.text}</p>
                ) : (
                  <>
                    {renderFormattedAnswer(msg.answer)}

                    {/* Data preview cards / mini-table */}
                    {msg.data && Array.isArray(msg.data) && msg.data.length > 0 && (
                      <div className="ai-data-table-wrapper">
                        <div className="ai-data-table-header">
                          <span>📊 Ground Truth Query Results</span>
                          <span className="ai-data-count">{msg.data.length} records</span>
                        </div>
                        <div className="ai-data-table-scroll">
                          <table className="ai-data-table">
                            <thead>
                              <tr>
                                {Object.keys(msg.data[0]).map((col) => (
                                  <th key={col}>{col.replace(/_/g, " ").toUpperCase()}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {msg.data.slice(0, 5).map((row, rIdx) => (
                                <tr key={rIdx}>
                                  {Object.entries(row).map(([k, val], cIdx) => (
                                    <td key={cIdx}>
                                      {typeof val === "number" ? val.toLocaleString() : String(val)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Navigation Action Buttons */}
                    {msg.action && onNavigate && (
                      <div className="ai-action-box">
                        <span className="ai-action-label">Recommended Action:</span>
                        <button
                          className="ai-action-btn"
                          onClick={() => onNavigate(msg.action.tab, msg.action.params)}
                        >
                          <span className="ai-action-icon">➔</span>
                          <span>{msg.action.label}</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="ai-message-row assistant loading-row">
            <div className="ai-msg-avatar">🤖</div>
            <div className="ai-msg-body">
              <div className="ai-thinking-indicator">
                <span className="ai-spin-dot"></span>
                <span>Querying PostgreSQL `ksp_crime` analytics database...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input Bar */}
      <form
        className="ai-input-bar"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <div className="ai-input-prefix">
          <span className="ai-terminal-prompt">INTEL_QUERY &gt;</span>
        </div>
        <input
          type="text"
          className="ai-chat-input"
          placeholder="Ask a question (e.g. 'Which district has highest crime?', 'Compare Pune and Nagpur', 'Night crime patterns')..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <button type="submit" className="ai-send-btn" disabled={loading || !query.trim()}>
          {loading ? "ANALYZING..." : "QUERY INTELLIGENCE ➔"}
        </button>
      </form>
    </div>
  );
}
