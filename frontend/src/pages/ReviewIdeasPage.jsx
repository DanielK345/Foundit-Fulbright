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
  const [additionalReqs, setAdditionalReqs] = useState("");
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
      if (additionalReqs.trim()) {
        await axios.post(
          `${API_URL}/requirements/${documentId}`,
          { requirement: additionalReqs.trim() },
          { timeout: 10000 },
        );
      }
    } catch {
      // Non-fatal — proceed anyway
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
              Gemini extracted the main ideas from your materials. Review them
              below, then add any specific requirements before building your exam.
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
              disabled={loading || proceeding}
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
              <span className="ideas-meta-note">
                {ideas.length.toLocaleString()} characters · read-only
              </span>
            </div>
            <div className="ideas-readonly-block">
              {ideas || <span className="ideas-empty-note">No concepts extracted.</span>}
            </div>

            <div className="ideas-section-label" style={{ marginTop: 28 }}>
              <span className="eyebrow">Additional Requirements</span>
              <span className="ideas-meta-note">Optional — saved and applied to this exam</span>
            </div>
            <textarea
              className="ideas-textarea"
              value={additionalReqs}
              onChange={(e) => setAdditionalReqs(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="e.g. Focus on Chapter 3 definitions, avoid questions on X, include at least one recursion question..."
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
          <p className="sidebar-note-title">How requirements work</p>
          <ul className="plain-list">
            <li>Requirements you enter here are saved and injected into the exam generation prompt.</li>
            <li>After each exam, the Result Analyzer automatically appends improvement recommendations.</li>
            <li>User feedback submitted after an exam is also appended.</li>
            <li>All accumulated requirements are visible and clearable on the Config page.</li>
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
