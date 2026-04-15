import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import Timer from "../components/Timer";
import Question from "../components/Question";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

function BookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22z" />
      <path d="M5 4.5v17" />
    </svg>
  );
}

function InsightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M12 3v10" />
      <path d="M8 13h8" />
      <path d="M10 21h4" />
      <path d="M7 17h10" />
      <path d="M5 10a7 7 0 1 1 14 0c0 2.6-1.2 4.2-2.8 5.6-.8.7-1.2 1.3-1.2 1.9h-6c0-.6-.4-1.2-1.2-1.9C6.2 14.2 5 12.6 5 10Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </svg>
  );
}

function getQuestionTypeLabel(type) {
  if (type === "mcq") return "Multiple Choice";
  if (type === "true_false") return "True / False";
  return "Short Answer";
}

function getAnsweredCount(answers) {
  return Object.values(answers).filter(
    (value) => value !== undefined && value !== "",
  ).length;
}

function buildProgressLabel(answered, total) {
  if (total === 0) return "0%";
  return `${Math.round((answered / total) * 100)}%`;
}

function ExamStudioPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const isDemo = examId === "demo";
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [slowNotice, setSlowNotice] = useState(false);
  const [grading, setGrading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flaggedQuestions, setFlaggedQuestions] = useState([]);

  useEffect(() => {
    const fetchExam = async () => {
      setSlowNotice(false);
      const slowTimer = setTimeout(() => setSlowNotice(true), 5000);
      try {
        const response = await axios.get(`${API_URL}/exam/${examId}`, {
          timeout: 120000,
        });
        setExam(response.data);
      } catch (requestError) {
        if (requestError.code === "ECONNABORTED") {
          setError("Loading timed out while the backend was waking up.");
        } else if (!requestError.response) {
          setError(
            "The backend could not be reached. Please try again in a moment.",
          );
        } else {
          setError("We couldn't load this exam. Please generate a new one.");
        }
      } finally {
        clearTimeout(slowTimer);
        setLoading(false);
        setSlowNotice(false);
      }
    };

    if (!isDemo) {
      fetchExam();
    } else {
      setLoading(false);
      setError(null);
    }
  }, [examId, isDemo]);

  const handleAnswer = (questionIndex, answer) => {
    setAnswers((prev) => ({ ...prev, [questionIndex]: answer }));
  };

  const toggleFlag = (questionIndex) => {
    setFlaggedQuestions((prev) =>
      prev.includes(questionIndex)
        ? prev.filter((item) => item !== questionIndex)
        : [...prev, questionIndex],
    );
  };

  const gradeExam = useCallback(async () => {
    if (!exam || submitted || grading) return;
    setGrading(true);
    setSlowNotice(false);

    const slowTimer = setTimeout(() => setSlowNotice(true), 5000);

    try {
      const response = await axios.post(
        `${API_URL}/grade`,
        {
          exam_id: examId,
          answers,
        },
        {
          timeout: 180000,
        },
      );
      const data = response.data;
      setResults({
        score: data.score,
        gradable: data.gradable,
        total: data.total,
        percentage: data.percentage,
        details: data.details.map((detail) => ({
          question: detail.question,
          type: detail.type,
          userAnswer: detail.user_answer,
          correctAnswer: detail.correct_answer,
          explanation: detail.explanation,
          source: detail.source,
          isCorrect: detail.is_correct,
          feedback: detail.feedback || "",
          questionIndex: detail.question_index,
        })),
      });
      setSubmitted(true);
    } catch (requestError) {
      if (requestError.code === "ECONNABORTED") {
        setError("Grading timed out before the backend finished the response.");
      } else if (!requestError.response) {
        setError(
          "The backend could not be reached for grading. Please retry once it is online.",
        );
      } else {
        setError("Grading failed. Please try again.");
      }
    } finally {
      clearTimeout(slowTimer);
      setGrading(false);
      setSlowNotice(false);
    }
  }, [answers, exam, examId, grading, submitted]);

  const handleTimeUp = useCallback(() => {
    if (!submitted) {
      gradeExam();
    }
  }, [gradeExam, submitted]);

  const answeredCount = useMemo(() => getAnsweredCount(answers), [answers]);
  const progressLabel = useMemo(
    () => buildProgressLabel(answeredCount, exam?.questions.length || 0),
    [answeredCount, exam],
  );

  if (isDemo) {
    return (
      <div className="page-state-card history-state-card">
        <h2>History workspace</h2>
        <p>
          Completed exam sessions will appear here after you run the full upload
          and generation flow.
        </p>
        <div className="history-state-grid">
          <div className="history-state-item">
            <strong>Past sessions</strong>
            <span>
              Review scores and answer quality after each graded exam.
            </span>
          </div>
          <div className="history-state-item">
            <strong>Question trends</strong>
            <span>
              Track difficult concepts and revisit specific weak areas.
            </span>
          </div>
          <div className="history-state-item">
            <strong>Export-ready summaries</strong>
            <span>
              Prepare concise reports for revision or classroom follow-up.
            </span>
          </div>
        </div>
        <button
          className="primary-pill-button"
          onClick={() => navigate("/")}
          type="button"
        >
          Go to Dashboard
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-state-card">
        <div className="loading-orb" />
        <h2>Loading exam canvas</h2>
        <p>
          We&apos;re preparing the generated questions and answer structure.
        </p>
        {slowNotice && (
          <div className="feedback-banner info">
            The server may still be waking up.
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-state-card">
        <h2>Exam unavailable</h2>
        <p>{error}</p>
        <button
          className="primary-pill-button"
          onClick={() => navigate("/")}
          type="button"
        >
          Start over
        </button>
      </div>
    );
  }

  if (!exam) return null;

  if (submitted && results) {
    return (
      <div className="results-layout">
        <aside className="results-sidebar">
          <div className="summary-card">
            <p className="eyebrow">Assessment Summary</p>
            <div className="score-ring">
              <div className="score-ring-inner">
                <strong>{results.percentage}%</strong>
                <span>overall</span>
              </div>
            </div>
            <span>{`${results.score} / ${results.gradable} gradable points`}</span>
          </div>

          <div className="breakdown-card-grid">
            <div className="breakdown-card">
              <strong>{results.total}</strong>
              <span>Total questions</span>
            </div>
            <div className="breakdown-card">
              <strong>
                {
                  results.details.filter((item) => item.isCorrect === true)
                    .length
                }
              </strong>
              <span>Correct</span>
            </div>
            <div className="breakdown-card">
              <strong>
                {
                  results.details.filter((item) => item.isCorrect === false)
                    .length
                }
              </strong>
              <span>Needs review</span>
            </div>
          </div>
        </aside>

        <section className="results-main">
          <div className="results-header-card">
            <div>
              <p className="eyebrow">Question Review</p>
              <h1>Advanced Quantum Mechanics Final</h1>
              <p>
                Review each answer, inspect the reference explanation, and
                regenerate when ready.
              </p>
            </div>
            <div className="results-header-actions">
              <button
                className="secondary-outline-button"
                onClick={() => navigate("/")}
                type="button"
              >
                Build new exam
              </button>
            </div>
          </div>

          <div className="review-stack">
            {results.details.map((detail, index) => (
              <article
                className={`review-card ${
                  detail.isCorrect === true
                    ? "correct"
                    : detail.isCorrect === false
                      ? "incorrect"
                      : "ungraded"
                }`}
                key={`${detail.question}-${index}`}
              >
                <div className="review-status-pill">
                  {detail.isCorrect === true ? (
                    <CheckIcon />
                  ) : detail.isCorrect === false ? (
                    <XIcon />
                  ) : null}
                  <span>
                    {detail.isCorrect === true
                      ? "Correct"
                      : detail.isCorrect === false
                        ? "Needs Improvement"
                        : "Pending"}
                  </span>
                </div>

                <p className="review-kicker">{`Question ${detail.questionIndex + 1} • ${getQuestionTypeLabel(
                  detail.type,
                )}`}</p>
                <h3>{detail.question}</h3>

                <div className="review-answer-grid">
                  <div className="review-answer-box">
                    <span>Your answer</span>
                    <p>{detail.userAnswer || "(no answer)"}</p>
                  </div>
                  <div className="review-answer-box emphasis">
                    <span>Correct answer</span>
                    <p>{detail.correctAnswer}</p>
                  </div>
                </div>

                <div className="review-explanation">
                  <strong>Why this matters</strong>
                  <p>{detail.explanation}</p>
                  {detail.feedback && <p>{detail.feedback}</p>}
                  <small>{detail.source}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const question = exam.questions[currentIndex];

  return (
    <div className="exam-layout">
      <aside className="exam-sidebar">
        <div className="sidebar-card exam-progress-card">
          <div className="progress-header">
            <h3>Exam Progress</h3>
            <span>{progressLabel}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: progressLabel }} />
          </div>

          <div className="question-nav-grid">
            {exam.questions.map((_, index) => {
              const isCurrent = index === currentIndex;
              const isAnswered = Boolean(answers[index]);
              const isFlagged = flaggedQuestions.includes(index);
              const stateClass = isCurrent
                ? "current"
                : isFlagged
                  ? "flagged"
                  : isAnswered
                    ? "answered"
                    : "";
              return (
                <button
                  className={`question-nav-chip ${stateClass}`}
                  key={`nav-${index}`}
                  onClick={() => setCurrentIndex(index)}
                  type="button"
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="legend-list">
            <div>
              <span className="legend-dot current" />
              Current Question
            </div>
            <div>
              <span className="legend-dot answered" />
              Answered
            </div>
            <div>
              <span className="legend-dot flagged" />
              Flagged for Review
            </div>
            <div>
              <span className="legend-dot unanswered" />
              Unanswered
            </div>
          </div>
        </div>

        <div className="sidebar-card sidebar-card-primary">
          <h3>Proctor Insight</h3>
          <p>
            Focus is maintained. Your environment check passed. Keep moving
            through the canvas.
          </p>
          <div className="secure-pill">Secure session active</div>
        </div>
      </aside>

      <section className="exam-main">
        <div className="exam-top-card">
          <div className="exam-summary-block">
            <div>
              <span>Exam Type</span>
              <strong>{`Generated Exam #${examId.slice(0, 8)}`}</strong>
            </div>
            <div className="summary-divider" />
            <div>
              <span>Candidate</span>
              <strong>Exam Generator User</strong>
            </div>
          </div>
          <Timer onTimeUp={handleTimeUp} totalMinutes={exam.time_limit} />
        </div>

        <Question
          answer={answers[currentIndex]}
          index={currentIndex}
          isFlagged={flaggedQuestions.includes(currentIndex)}
          onAnswer={(value) => handleAnswer(currentIndex, value)}
          onToggleFlag={() => toggleFlag(currentIndex)}
          question={question}
        />

        <div className="exam-footer-card">
          <div className="footer-nav-actions">
            <button
              className="secondary-outline-button"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
              type="button"
            >
              Previous
            </button>
            <button
              className="gradient-pill-button"
              disabled={currentIndex === exam.questions.length - 1}
              onClick={() =>
                setCurrentIndex((prev) =>
                  Math.min(prev + 1, exam.questions.length - 1),
                )
              }
              type="button"
            >
              Next
            </button>
          </div>

          <button
            className="primary-pill-button"
            disabled={grading}
            onClick={gradeExam}
            type="button"
          >
            {grading ? "Grading exam..." : "Submit exam"}
          </button>
        </div>

        {grading && slowNotice && (
          <div className="feedback-banner info">
            The grading request is still processing. Short answers can take a
            little longer.
          </div>
        )}

        <div className="exam-context-row">
          <div className="context-help-card">
            <div className="context-icon-box">
              <BookIcon />
            </div>
            <div>
              <h3>Need help?</h3>
              <p>
                Use your source material and answer progressively. This layout
                mirrors the context card treatment in the Figma design.
              </p>
              <button className="text-action" type="button">
                Request context hint
              </button>
            </div>
          </div>

          <div className="context-note-card">
            <div className="context-note-title">
              <InsightIcon />
              <span>Quick Note</span>
            </div>
            <p>
              Remember to distinguish central concepts from examples when
              answering open questions.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ExamStudioPage;
