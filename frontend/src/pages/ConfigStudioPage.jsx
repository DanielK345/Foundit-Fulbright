import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8010";

function ConfigStudioPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const isDemo = documentId === "demo";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [slowNotice, setSlowNotice] = useState(false);
  const [config, setConfig] = useState({
    time_limit: 30,
    mcq: 5,
    true_false: 3,
    short_answer: 2,
    difficulty: "medium",
    focus: "",
    bloom_levels: ["understand", "apply"],
    source_types: [],
    study_goal: "test_review",
    question_style: "mixed",
  });

  const totalQuestions = useMemo(
    () =>
      Number(config.mcq) +
      Number(config.true_false) +
      Number(config.short_answer),
    [config.mcq, config.true_false, config.short_answer],
  );

  const handleChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const toggleArrayValue = (field, value) => {
    setConfig((prev) => {
      const current = prev[field] || [];
      return {
        ...prev,
        [field]: current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value],
      };
    });
  };

  const handleGenerate = async () => {
    if (isDemo) {
      setError(
        "Start from Dashboard and upload source files before generating an exam.",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setSlowNotice(false);

    const slowTimer = setTimeout(() => setSlowNotice(true), 5000);

    try {
      const payload = {
        document_id: documentId,
        ...config,
        mcq: parseInt(config.mcq, 10),
        true_false: parseInt(config.true_false, 10),
        short_answer: parseInt(config.short_answer, 10),
        time_limit: parseInt(config.time_limit, 10),
        focus: config.focus || null,
        bloom_levels: config.bloom_levels.length ? config.bloom_levels : ["understand", "apply"],
        source_types: config.source_types,
      };

      const response = await axios.post(`${API_URL}/generate`, payload, {
        timeout: 600000,
      });
      navigate(`/exam/${response.data.exam_id}`);
    } catch (requestError) {
      if (requestError.code === "ECONNABORTED") {
        setError(
          "Exam generation timed out while the backend was processing your material. Try fewer questions or improve/save a smaller course map.",
        );
      } else if (!requestError.response) {
        setError(
          "The backend could not be reached. Please wait a moment and try again.",
        );
      } else {
        setError(
          requestError.response?.data?.detail ||
            "Generation failed. Please try again.",
        );
      }
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
      setSlowNotice(false);
    }
  };

  return (
    <div className="config-layout">
      <section className="config-main-card">
        <div className="config-header">
          <div>
            <p className="eyebrow">
              {isDemo ? "Question Bank" : "Question Structure"}
            </p>
            <h1>{isDemo ? "Question bank preview" : "Configure your exam"}</h1>
            <p>
              {isDemo
                ? "This area becomes fully interactive after at least one source document is uploaded."
                : "Balance the exam mix, set the time box, and optionally point the generator toward a narrower focus area."}
            </p>
          </div>
          <div className="config-header-actions">
            <button
              className="secondary-outline-button"
              onClick={() => navigate("/")}
              type="button"
            >
              Back to Upload
            </button>
            <button
              className="primary-pill-button"
              disabled={isDemo || loading}
              onClick={handleGenerate}
              type="button"
            >
              {isDemo
                ? "Upload documents first"
                : loading
                  ? "Generating..."
                  : "Generate exam"}
            </button>
          </div>
        </div>

        {isDemo && (
          <div className="feedback-banner info">
            Demo mode: open Dashboard, upload PDF/PPTX files, then return here
            with a generated document id.
          </div>
        )}

        <div className="config-grid">
          <label className="config-field">
            <span>Time Limit</span>
            <input
              max="180"
              min="5"
              onChange={(event) =>
                handleChange("time_limit", event.target.value)
              }
              type="number"
              value={config.time_limit}
            />
          </label>

          <label className="config-field">
            <span>Difficulty</span>
            <select
              onChange={(event) =>
                handleChange("difficulty", event.target.value)
              }
              value={config.difficulty}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>

          <label className="config-field">
            <span>Multiple Choice</span>
            <input
              max="20"
              min="0"
              onChange={(event) => handleChange("mcq", event.target.value)}
              type="number"
              value={config.mcq}
            />
          </label>

          <label className="config-field">
            <span>True / False</span>
            <input
              max="20"
              min="0"
              onChange={(event) =>
                handleChange("true_false", event.target.value)
              }
              type="number"
              value={config.true_false}
            />
          </label>

          <label className="config-field config-field-full">
            <span>Short Answer</span>
            <input
              max="10"
              min="0"
              onChange={(event) =>
                handleChange("short_answer", event.target.value)
              }
              type="number"
              value={config.short_answer}
            />
          </label>

          <label className="config-field config-field-full">
            <span>Focus Area</span>
            <textarea
              onChange={(event) => handleChange("focus", event.target.value)}
              placeholder="Examples: chapters 2 and 3, machine learning basics, quantum wavefunctions..."
              rows="4"
              value={config.focus}
            />
          </label>

          <label className="config-field">
            <span>Study Goal</span>
            <select
              onChange={(event) => handleChange("study_goal", event.target.value)}
              value={config.study_goal}
            >
              <option value="test_review">Test review</option>
              <option value="self_study">Self study</option>
              <option value="weak_area_practice">Weak-area practice</option>
            </select>
          </label>

          <label className="config-field">
            <span>Question Style</span>
            <select
              onChange={(event) => handleChange("question_style", event.target.value)}
              value={config.question_style}
            >
              <option value="mixed">Mixed</option>
              <option value="conceptual">Conceptual</option>
              <option value="application">Application</option>
            </select>
          </label>

          <div className="config-field config-field-full">
            <span>Bloom Levels</span>
            <div className="focus-stepper">
              {["remember", "understand", "apply", "analyze"].map((level) => (
                <button
                  className={`mode-toggle ${config.bloom_levels.includes(level) ? "active" : ""}`}
                  key={level}
                  onClick={() => toggleArrayValue("bloom_levels", level)}
                  type="button"
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="config-field config-field-full">
            <span>Source Mix</span>
            <div className="focus-stepper">
              {["slides", "homework", "reading", "notes", "previous_test"].map((sourceType) => (
                <button
                  className={`mode-toggle ${config.source_types.includes(sourceType) ? "active" : ""}`}
                  key={sourceType}
                  onClick={() => toggleArrayValue("source_types", sourceType)}
                  type="button"
                >
                  {sourceType.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {(error || slowNotice) && (
          <div className={`feedback-banner ${error ? "error" : "info"}`}>
            {error ||
              "The server is still processing your content. This can take up to a minute."}
          </div>
        )}
      </section>

      <aside className="config-side-panel">
        <div className="summary-card">
          <p className="eyebrow">Config Summary</p>
          <div className="summary-total">{totalQuestions}</div>
          <span>Total questions planned</span>
        </div>

        <div className="breakdown-card-grid">
          <div className="breakdown-card">
            <strong>{config.mcq}</strong>
            <span>Multiple Choice</span>
          </div>
          <div className="breakdown-card">
            <strong>{config.true_false}</strong>
            <span>True / False</span>
          </div>
          <div className="breakdown-card">
            <strong>{config.short_answer}</strong>
            <span>Short Answer</span>
          </div>
        </div>

        <div className="sidebar-card sidebar-card-primary">
          <p className="sidebar-note-title">Generation hints</p>
          <ul className="plain-list">
            <li>
              The backend first builds an exam blueprint from your reviewed
              course map.
            </li>
            <li>
              Higher-priority units and concepts are selected before lower-value material.
            </li>
            <li>
              Use application style when you want fewer definition-only questions.
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

export default ConfigStudioPage;
