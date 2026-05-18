import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8010";

// ── Lightweight markdown → JSX renderer ─────────────────────────────────────
function parseBold(str) {
  return str.split(/\*\*(.+?)\*\*/).map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
  );
}

function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const output = [];
  let listItems = [];
  let k = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      output.push(
        <ul className="ideas-md-list" key={k++}>
          {listItems}
        </ul>,
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    if (/^#{1,3} /.test(line)) {
      flushList();
      output.push(
        <h3 className="ideas-md-heading" key={k++}>
          {parseBold(line.replace(/^#{1,3} /, ""))}
        </h3>,
      );
    } else if (/^[-*] /.test(line)) {
      listItems.push(<li key={k++}>{parseBold(line.slice(2))}</li>);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      output.push(
        <p className="ideas-md-p" key={k++}>
          {parseBold(line)}
        </p>,
      );
    }
  }
  flushList();
  return output;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

function ReviewIdeasPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ideas, setIdeas] = useState("");
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    const fetchIdeas = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.post(
          `${API_URL}/upload/${documentId}/ideas`,
          {},
          { timeout: 120000 },
        );
        setIdeas(response.data.ideas);
      } catch (err) {
        if (err.code === "ECONNABORTED") {
          setError("Idea extraction timed out. Please try again.");
        } else if (!err.response) {
          setError("Cannot reach the server. Please try again.");
        } else {
          setError(
            err.response?.data?.detail ||
              "Failed to extract ideas. Please try again.",
          );
        }
      } finally {
        setLoading(false);
      }
    };
    fetchIdeas();
  }, [documentId]);

  const handleContinue = () => {
    navigate(`/config/${documentId}`);
  };

  return (
    <div className="config-layout">
      <section className="config-main-card">
        <div className="config-header">
          <div>
            <p className="eyebrow">Step 2 of 4 — Review</p>
            <h1>Review Key Concepts</h1>
            <p>
              Gemini extracted the main ideas from your materials. Review them
              below, then continue to exam setup to configure your exam.
            </p>
          </div>
          <div className="config-header-actions">
            <button
              className="secondary-outline-button"
              onClick={() => navigate("/")}
              type="button"
            >
              ← Back to Upload
            </button>
            <button
              className="primary-pill-button"
              disabled={loading}
              onClick={handleContinue}
              type="button"
            >
              Continue to Exam Setup →
            </button>
          </div>
        </div>

        {loading && (
          <div className="ideas-loading-state">
            <div className="spinner" />
            <p>Analyzing your materials...</p>
            <p className="ideas-loading-sub">
              Gemini is reading your documents and extracting key concepts.
            </p>
          </div>
        )}

        {!loading && error && (
          <div className="feedback-banner error">
            {error}
            <button
              style={{ marginLeft: 12, textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "inherit" }}
              onClick={() => window.location.reload()}
              type="button"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="ideas-section-label">
              <span className="eyebrow">Extracted Key Concepts</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="ideas-meta-note">
                  {ideas.length.toLocaleString()} characters
                </span>
                <button
                  className="ideas-edit-toggle"
                  onClick={() => setEditMode((m) => !m)}
                  title={editMode ? "Done editing" : "Edit content"}
                  type="button"
                >
                  {editMode ? <CheckIcon /> : <PencilIcon />}
                  {editMode ? "Done" : "Edit"}
                </button>
              </div>
            </div>

            {editMode ? (
              <textarea
                autoFocus
                className="ideas-textarea"
                onChange={(e) => setIdeas(e.target.value)}
                rows={20}
                spellCheck={false}
                value={ideas}
              />
            ) : (
              <div className="ideas-preview-pane">
                {ideas
                  ? renderMarkdown(ideas)
                  : <span className="ideas-empty-note">No concepts extracted.</span>}
              </div>
            )}
          </>
        )}
      </section>

      <aside className="config-side-panel">
        <div className="summary-card">
          <p className="eyebrow">Progress</p>
          <div className="review-stepper">
            <div className="review-step done">
              <span className="review-step-dot" />
              <span>Upload</span>
            </div>
            <div className="review-step active">
              <span className="review-step-dot" />
              <span>Review concepts</span>
            </div>
            <div className="review-step">
              <span className="review-step-dot" />
              <span>Configure exam</span>
            </div>
            <div className="review-step">
              <span className="review-step-dot" />
              <span>Take exam</span>
            </div>
          </div>
        </div>

        <div className="sidebar-card sidebar-card-primary">
          <p className="sidebar-note-title">How it works</p>
          <ul className="plain-list">
            <li>Gemini reads your documents and extracts the key concepts covered.</li>
            <li>Review the extraction — click the pencil icon to edit anything that looks off.</li>
            <li>Additional requirements (e.g. coding questions, topic focus) can be added on the next Exam Setup page.</li>
            <li>Result feedback from past exams is automatically applied to future generations.</li>
          </ul>
        </div>

        <div className="sidebar-card">
          <span className="sidebar-stat-label">Document reference</span>
          <strong className="document-pill">{documentId}</strong>
        </div>
      </aside>
    </div>
  );
}

export default ReviewIdeasPage;
