import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

function ConfigPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [slowNotice, setSlowNotice] = useState(false);
  const [contextLoading, setContextLoading] = useState(true);
  const [contextError, setContextError] = useState(null);
  const [contextMeta, setContextMeta] = useState(null);   // { filenames, num_sections }
  const [editedContent, setEditedContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [contextSaved, setContextSaved] = useState(true);
  const [config, setConfig] = useState({
    time_limit: 30,
    mcq: 5,
    true_false: 3,
    short_answer: 2,
    difficulty: "medium",
    focus: "",
  });

  const handleChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    const fetchContext = async () => {
      setContextLoading(true);
      setContextError(null);
      try {
        const response = await axios.get(`${API_URL}/upload/${documentId}/context`, {
          timeout: 120000,
        });
        const { merged_content, filenames, num_sections } = response.data;
        setContextMeta({ filenames, num_sections });
        setEditedContent(merged_content);
        setOriginalContent(merged_content);
      } catch (err) {
        if (err.code === "ECONNABORTED") {
          setContextError("Loading extracted context timed out. Please try again.");
        } else if (!err.response) {
          setContextError("Cannot reach the server to load the extracted context.");
        } else {
          setContextError(err.response?.data?.detail || "Failed to load extracted context.");
        }
      } finally {
        setContextLoading(false);
      }
    };
    fetchContext();
  }, [documentId]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setSlowNotice(false);
    const slowTimer = setTimeout(() => setSlowNotice(true), 5000);

    try {
      if (!contextSaved) {
        await axios.put(`${API_URL}/upload/${documentId}/context`, { content: editedContent }, {
          timeout: 30000,
        });
        setContextSaved(true);
      }

      const response = await axios.post(`${API_URL}/generate`, {
        document_id: documentId,
        ...config,
        mcq: parseInt(config.mcq),
        true_false: parseInt(config.true_false),
        short_answer: parseInt(config.short_answer),
        time_limit: parseInt(config.time_limit),
        focus: config.focus || null,
      }, { timeout: 180000 });

      navigate(`/exam/${response.data.exam_id}`);
    } catch (err) {
      if (err.code === "ECONNABORTED") {
        setError("Request timed out. The server may be starting up — please try again.");
      } else if (!err.response) {
        setError("Cannot reach the server. It may be waking up — please wait a moment and try again.");
      } else {
        setError(err.response?.data?.detail || "Generation failed. Please try again.");
      }
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
      setSlowNotice(false);
    }
  };

  if (loading) {
    return (
      <div className="config-container">
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Generating your exam...</p>
          <p style={{ color: "#64748b", fontSize: "0.9rem", marginTop: 8 }}>
            This may take a moment while we analyze your document and create questions.
          </p>
          {slowNotice && (
            <p style={{ color: "#f59e0b", fontSize: "0.85rem", marginTop: 12 }}>
              Server is waking up — this may take up to a minute on first request.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="config-container">
      <h2>Configure Your Exam</h2>

      <div className="form-row">
        <div className="form-group">
          <label>Time Limit (minutes)</label>
          <input
            type="number" min="5" max="180"
            value={config.time_limit}
            onChange={(e) => handleChange("time_limit", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>Difficulty</label>
          <select value={config.difficulty} onChange={(e) => handleChange("difficulty", e.target.value)}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Multiple Choice Questions</label>
          <input
            type="number" min="0" max="20"
            value={config.mcq}
            onChange={(e) => handleChange("mcq", e.target.value)}
          />
        </div>
        <div className="form-group">
          <label>True / False Questions</label>
          <input
            type="number" min="0" max="20"
            value={config.true_false}
            onChange={(e) => handleChange("true_false", e.target.value)}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Short Answer Questions</label>
        <input
          type="number" min="0" max="10"
          value={config.short_answer}
          onChange={(e) => handleChange("short_answer", e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Focus Area (optional)</label>
        <textarea
          rows="2"
          placeholder="e.g., chapter 2 and 3, machine learning basics..."
          value={config.focus}
          onChange={(e) => handleChange("focus", e.target.value)}
        />
      </div>

      {error && <div className="status-message error">{error}</div>}

      <section className="context-panel">
        <div className="context-panel-header">
          <div>
            <h3>Extracted Content</h3>
            <p>Review and edit the text extracted from your documents before generating questions.</p>
          </div>
          {!contextLoading && !contextError && (
            <div className="context-header-actions">
              <span className={`context-save-status ${contextSaved ? "saved" : "unsaved"}`}>
                {contextSaved ? "Saved" : "Unsaved changes"}
              </span>
              {!contextSaved && (
                <button
                  className="btn-reset-section"
                  onClick={() => { setEditedContent(originalContent); setContextSaved(true); }}
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>

        {contextLoading && (
          <div className="context-panel-empty">Loading extracted content...</div>
        )}

        {!contextLoading && contextError && (
          <div className="status-message error">{contextError}</div>
        )}

        {!contextLoading && !contextError && contextMeta && (
          <>
            <div className="context-summary">
              <span>{contextMeta.num_sections} slides/pages extracted</span>
              <span>{editedContent.length} chars</span>
              <span>{contextMeta.filenames.join(", ")}</span>
            </div>
            <div className="context-section-body">
              <textarea
                className="context-edit-textarea"
                value={editedContent}
                onChange={(e) => { setEditedContent(e.target.value); setContextSaved(false); }}
                rows={16}
                spellCheck={false}
                placeholder="Extracted content will appear here..."
              />
            </div>
          </>
        )}
      </section>

      <div style={{ marginTop: 24, textAlign: "center" }}>
        <button className="btn btn-primary" onClick={handleGenerate}>
          Generate Exam
        </button>
      </div>
    </div>
  );
}

export default ConfigPage;
