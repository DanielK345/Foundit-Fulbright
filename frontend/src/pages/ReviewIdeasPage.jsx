import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

function ReviewIdeasPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ideas, setIdeas] = useState("");
  const [proceeding, setProceeding] = useState(false);

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

  const handleContinue = async () => {
    setProceeding(true);
    try {
      // Save the reviewed/edited ideas back as the document context so the
      // exam generator uses the curated content instead of raw extracted text.
      await axios.put(
        `${API_URL}/upload/${documentId}/context`,
        { content: ideas },
        { timeout: 30000 },
      );
    } catch {
      // Non-fatal — proceed anyway; generation will fall back to original content.
    }
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
              Gemini extracted the main ideas from your slides. Edit anything
              that looks off before building your exam — these concepts will
              guide question generation.
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
              disabled={loading || proceeding || !ideas.trim()}
              onClick={handleContinue}
              type="button"
            >
              {proceeding ? "Saving..." : "Continue to Exam Setup →"}
            </button>
          </div>
        </div>

        {loading && (
          <div className="ideas-loading-state">
            <div className="spinner" />
            <p>Analyzing your slides...</p>
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
            <div className="ideas-meta-row">
              <span>{ideas.length.toLocaleString()} characters</span>
              <span>Edit freely — this becomes the exam focus</span>
            </div>
            <textarea
              className="ideas-textarea"
              value={ideas}
              onChange={(e) => setIdeas(e.target.value)}
              rows={20}
              spellCheck={false}
              placeholder="Extracted main ideas will appear here..."
            />
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
          <p className="sidebar-note-title">Tips for reviewing</p>
          <ul className="plain-list">
            <li>Remove any bullet points that seem off-topic or incorrect.</li>
            <li>
              Add concepts that Gemini may have missed from your slides.
            </li>
            <li>
              The more accurate this list, the better the exam questions will
              be.
            </li>
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
