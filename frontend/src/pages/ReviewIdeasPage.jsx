import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8010";
const DOCUMENT_TYPES = ["slides", "homework", "reading", "notes", "previous_test", "unknown"];

function ReviewIdeasPage() {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [courseMap, setCourseMap] = useState(null);
  const [quality, setQuality] = useState(null);
  const [sections, setSections] = useState([]);
  const [savingMap, setSavingMap] = useState(false);
  const [savingSections, setSavingSections] = useState(false);
  const [refiningMap, setRefiningMap] = useState(false);

  useEffect(() => {
    const fetchReviewData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [courseMapResponse, qualityResponse, sectionsResponse] = await Promise.all([
          axios.get(`${API_URL}/upload/${documentId}/course-map`, { timeout: 600000 }),
          axios.get(`${API_URL}/upload/${documentId}/quality`, { timeout: 120000 }),
          axios.get(`${API_URL}/upload/${documentId}/sections`, { timeout: 120000 }),
        ]);
        setCourseMap(courseMapResponse.data.course_map || null);
        setQuality(qualityResponse.data.quality_report || null);
        setSections(sectionsResponse.data.sections || []);
      } catch (err) {
        if (err.code === "ECONNABORTED") {
          setError("Course map analysis timed out. Please try again.");
        } else if (!err.response) {
          setError("Cannot reach the server. Please try again.");
        } else {
          setError(err.response?.data?.detail || "Failed to analyze materials.");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchReviewData();
  }, [documentId]);

  const units = courseMap?.units || [];
  const conceptCount = units.reduce((total, unit) => total + (unit.concepts?.length || 0), 0);
  const ignoredCount = courseMap?.ignored_material?.length || 0;

  const updateUnit = (unitId, patch) => {
    setCourseMap((prev) => ({
      ...prev,
      units: (prev.units || []).map((unit) =>
        unit.unit_id === unitId ? { ...unit, ...patch } : unit,
      ),
    }));
  };

  const updateConcept = (unitId, conceptId, patch) => {
    setCourseMap((prev) => ({
      ...prev,
      units: (prev.units || []).map((unit) =>
        unit.unit_id === unitId
          ? {
              ...unit,
              concepts: (unit.concepts || []).map((concept) =>
                concept.concept_id === conceptId ? { ...concept, ...patch } : concept,
              ),
            }
          : unit,
      ),
    }));
  };

  const updateSection = (index, patch) => {
    setSections((prev) =>
      prev.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    );
  };

  const saveCourseMap = async () => {
    setSavingMap(true);
    setError(null);
    try {
      const response = await axios.put(
        `${API_URL}/upload/${documentId}/course-map`,
        { course_map: courseMap },
        { timeout: 120000 },
      );
      setCourseMap(response.data.course_map);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save course map.");
    } finally {
      setSavingMap(false);
    }
  };

  const refineCourseMap = async () => {
    setRefiningMap(true);
    setError(null);
    try {
      const response = await axios.post(
        `${API_URL}/upload/${documentId}/course-map/refine`,
        {},
        { timeout: 900000 },
      );
      setCourseMap(response.data.course_map);
    } catch (err) {
      if (err.code === "ECONNABORTED") {
        setError("AI course-map improvement timed out. Keep using the fast map or try fewer files.");
      } else {
        setError(err.response?.data?.detail || "Failed to improve course map with AI.");
      }
    } finally {
      setRefiningMap(false);
    }
  };

  const saveSections = async () => {
    setSavingSections(true);
    setError(null);
    try {
      await axios.put(
        `${API_URL}/upload/${documentId}/sections`,
        { sections },
        { timeout: 180000 },
      );
      const [courseMapResponse, qualityResponse] = await Promise.all([
        axios.get(`${API_URL}/upload/${documentId}/course-map`, { timeout: 600000 }),
        axios.get(`${API_URL}/upload/${documentId}/quality`, { timeout: 120000 }),
      ]);
      setCourseMap(courseMapResponse.data.course_map || null);
      setQuality(qualityResponse.data.quality_report || null);
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save reviewed sections.");
    } finally {
      setSavingSections(false);
    }
  };

  return (
    <div className="config-layout">
      <section className="config-main-card">
        <div className="config-header">
          <div>
            <p className="eyebrow">Step 2 of 4 - Course Map</p>
            <h1>Review Course Map</h1>
            <p>
              Confirm the units, concepts, and learning objectives that will drive
              question generation. Low-value logistics are separated before the exam is built.
            </p>
          </div>
          <div className="config-header-actions">
            <button className="secondary-outline-button" onClick={() => navigate("/")} type="button">
              Back to Upload
            </button>
            <button
              className="secondary-outline-button"
              disabled={loading || savingMap || refiningMap || !courseMap}
              onClick={saveCourseMap}
              type="button"
            >
              {savingMap ? "Saving..." : "Save Course Map"}
            </button>
            <button
              className="secondary-outline-button"
              disabled={loading || refiningMap || !courseMap}
              onClick={refineCourseMap}
              type="button"
            >
              {refiningMap ? "Improving..." : "Improve with AI"}
            </button>
            <button
              className="primary-pill-button"
              disabled={loading || refiningMap || !courseMap}
              onClick={() => navigate(`/config/${documentId}`)}
              type="button"
            >
              Continue to Exam Setup
            </button>
          </div>
        </div>

        {loading && (
          <div className="ideas-loading-state">
            <div className="spinner" />
            <p>Building your course map...</p>
            <p className="ideas-loading-sub">
              Grouping units, extracting learning objectives, and filtering logistics.
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

        {!loading && !error && courseMap && (
          <>
            {refiningMap && (
              <div className="feedback-banner info">
                AI is refining the course map. This can take several minutes with local models.
              </div>
            )}
            {quality && (
              <div className={`feedback-banner ${quality.needs_review ? "info" : "success"}`}>
                {quality.total_sections} sections processed. {quality.low_quality_sections || 0} need review.
              </div>
            )}

            <div className="ideas-meta-row">
              <span>{courseMap.course_title || "Uploaded course"}</span>
              <span>{units.length} units</span>
              <span>{conceptCount} concepts</span>
              <span>{ignoredCount} ignored sections</span>
            </div>

            <div className="course-map-list">
              {units.map((unit) => (
                <article className="course-unit-card" key={unit.unit_id}>
                  <div className="course-unit-header">
                    <label className="inline-check">
                      <input
                        checked={unit.included !== false}
                        onChange={(event) => updateUnit(unit.unit_id, { included: event.target.checked })}
                        type="checkbox"
                      />
                      <strong>{unit.title}</strong>
                    </label>
                    <select
                      value={unit.importance || "medium"}
                      onChange={(event) => updateUnit(unit.unit_id, { importance: event.target.value })}
                    >
                      <option value="high">High priority</option>
                      <option value="medium">Medium priority</option>
                      <option value="low">Low priority</option>
                    </select>
                  </div>
                  {unit.summary && <p>{unit.summary}</p>}
                  <div className="concept-objective-list">
                    {(unit.concepts || []).map((concept) => (
                      <div className="concept-objective-card" key={concept.concept_id}>
                        <div className="course-unit-header">
                          <label className="inline-check">
                            <input
                              checked={concept.included !== false}
                              onChange={(event) =>
                                updateConcept(unit.unit_id, concept.concept_id, { included: event.target.checked })
                              }
                              type="checkbox"
                            />
                            <strong>{concept.name}</strong>
                          </label>
                          <select
                            value={concept.exam_likelihood || "medium"}
                            onChange={(event) =>
                              updateConcept(unit.unit_id, concept.concept_id, { exam_likelihood: event.target.value })
                            }
                          >
                            <option value="high">High exam likelihood</option>
                            <option value="medium">Medium exam likelihood</option>
                            <option value="low">Low exam likelihood</option>
                          </select>
                        </div>
                        <ul className="objective-list">
                          {(concept.learning_objectives || []).map((objective, index) => (
                            <li key={`${concept.concept_id}-objective-${index}`}>{objective}</li>
                          ))}
                        </ul>
                        {concept.evidence?.[0] && <p className="source-evidence">{concept.evidence[0]}</p>}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            {ignoredCount > 0 && (
              <div className="section-review-panel">
                <div className="file-panel-header">
                  <div>
                    <h3>Ignored Material</h3>
                    <p>These sections are excluded from question generation unless you edit the course map.</p>
                  </div>
                </div>
                <div className="ignored-material-list">
                  {courseMap.ignored_material.map((item, index) => (
                    <div className="ignored-material-item" key={`${item.source}-${index}`}>
                      <strong>{item.source_label || item.source || `Section ${index + 1}`}</strong>
                      <span>{item.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sections.length > 0 && (
              <div className="section-review-panel">
                <div className="file-panel-header">
                  <div>
                    <h3>Source Labels</h3>
                    <p>Relabel uploaded materials, then rebuild the map from cleaner metadata.</p>
                  </div>
                  <button
                    className="secondary-outline-button"
                    disabled={savingSections}
                    onClick={saveSections}
                    type="button"
                  >
                    {savingSections ? "Rebuilding..." : "Save Source Review"}
                  </button>
                </div>
                <div className="section-review-list">
                  {sections.slice(0, 10).map((section, index) => (
                    <article className="section-review-item" key={`${section.source_label}-${index}`}>
                      <div className="section-review-meta">
                        <strong>{section.source_label}</strong>
                        <span className={`quality-chip quality-${section.content_quality || "medium"}`}>
                          {section.content_quality || "medium"}
                        </span>
                      </div>
                      <label className="config-field">
                        <span>Source Type</span>
                        <select
                          value={section.document_type || "unknown"}
                          onChange={(event) => updateSection(index, { document_type: event.target.value })}
                        >
                          {DOCUMENT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                      </label>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <aside className="config-side-panel">
        <div className="summary-card">
          <p className="eyebrow">Course Map</p>
          <div className="summary-total">{conceptCount}</div>
          <span>review concepts</span>
        </div>

        <div className="sidebar-card sidebar-card-primary">
          <p className="sidebar-note-title">Quality Checklist</p>
          <ul className="plain-list">
            <li>Exclude course logistics, project-only slides, and job market sections.</li>
            <li>Keep high-priority units for test review.</li>
            <li>Questions are generated from learning objectives, not isolated chunks.</li>
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
