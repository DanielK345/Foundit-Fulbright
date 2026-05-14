import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Timer from "../components/Timer";
import Question from "../components/Question";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8010";

function ExamPage() {
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [slowNotice, setSlowNotice] = useState(false);

  const [grading, setGrading] = useState(false);

  useEffect(() => {
    const fetchExam = async () => {
      setSlowNotice(false);
      const slowTimer = setTimeout(() => setSlowNotice(true), 5000);
      try {
        const response = await axios.get(`${API_URL}/exam/${examId}`, {
          timeout: 120000,
        });
        setExam(response.data);
      } catch (err) {
        if (err.code === "ECONNABORTED") {
          setError("Request timed out. The server may be starting up — please try again.");
        } else if (!err.response) {
          setError("Cannot reach the server. It may be waking up — please wait a moment and try again.");
        } else {
          setError("Failed to load exam. Please try again.");
        }
      } finally {
        clearTimeout(slowTimer);
        setLoading(false);
        setSlowNotice(false);
      }
    };
    fetchExam();
  }, [examId]);

  const handleAnswer = (questionIndex, answer) => {
    setAnswers((prev) => ({ ...prev, [questionIndex]: answer }));
  };

  const gradeExam = useCallback(async () => {
    if (!exam || submitted || grading) return;
    setGrading(true);
    setSlowNotice(false);

    const slowTimer = setTimeout(() => setSlowNotice(true), 5000);

    try {
      const response = await axios.post(`${API_URL}/grade`, {
        exam_id: examId,
        answers,
      }, {
        timeout: 180000,
      });
      const data = response.data;
      setResults({
        score: data.score,
        gradable: data.gradable,
        total: data.total,
        percentage: data.percentage,
        details: data.details.map((d) => ({
          question: d.question,
          type: d.type,
          userAnswer: d.user_answer,
          correctAnswer: d.correct_answer,
          explanation: d.explanation,
          source: d.source,
          isCorrect: d.is_correct,
          feedback: d.feedback || "",
        })),
      });
      setSubmitted(true);
    } catch (err) {
      if (err.code === "ECONNABORTED") {
        setError("Grading timed out. The server may be starting up — please try again.");
      } else if (!err.response) {
        setError("Cannot reach the server. It may be waking up — please wait a moment and try again.");
      } else {
        setError("Grading failed. Please try again.");
      }
    } finally {
      clearTimeout(slowTimer);
      setGrading(false);
      setSlowNotice(false);
    }
  }, [exam, examId, answers, submitted, grading]);

  const handleTimeUp = useCallback(() => {
    if (!submitted) {
      gradeExam();
    }
  }, [submitted, gradeExam]);

  if (loading) {
    return (
      <div className="exam-container">
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Loading exam...</p>
          {slowNotice && (
            <p style={{ color: "#f59e0b", fontSize: "0.85rem", marginTop: 8 }}>
              Server is waking up — this may take up to a minute on first request.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="exam-container">
        <div className="status-message error">{error}</div>
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="btn btn-secondary" onClick={() => navigate("/")}>
            Start Over
          </button>
        </div>
      </div>
    );
  }

  // Results view
  if (submitted && results) {
    return (
      <div className="results-container">
        <div className="score-display">
          <div className="score">{results.score}/{results.gradable}</div>
          <div className="total">
            {results.percentage}% — All questions graded
          </div>
        </div>

        <h3 style={{ marginBottom: 16 }}>Review Answers</h3>

        {results.details.map((r, i) => (
          <div
            key={i}
            className={`result-item ${
              r.isCorrect === null ? "ungraded" : r.isCorrect ? "correct" : "incorrect"
            }`}
          >
            <div className="question-number">Question {i + 1}</div>
            <span className={`question-type ${r.type}`}>
              {r.type === "mcq" ? "MCQ" : r.type === "true_false" ? "T/F" : "Short Answer"}
            </span>
            <div className="question-text">{r.question}</div>
            <div className="result-answer">
              <strong>Your answer:</strong> {r.userAnswer || "(no answer)"}
            </div>
            <div className="result-answer">
              <strong>Correct answer:</strong> {r.correctAnswer}
            </div>
            <div className="result-explanation">
              {r.explanation}
            </div>
            {r.feedback && (
              <div style={{ marginTop: 8, fontSize: "0.85rem", color: "#475569" }}>
                <strong>Grading feedback:</strong> {r.feedback}
              </div>
            )}
            <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: 4 }}>
              Source: {r.source}
            </div>
          </div>
        ))}

        <div style={{ textAlign: "center", marginTop: 32 }}>
          <button className="btn btn-primary" onClick={() => navigate("/")}>
            Generate New Exam
          </button>
        </div>
      </div>
    );
  }

  // Exam-taking view
  return (
    <div className="exam-container">
      <div className="exam-header">
        <div>
          <h2>Exam</h2>
          <span style={{ color: "#64748b", fontSize: "0.9rem" }}>
            {exam.questions.length} questions
          </span>
        </div>
        <Timer totalMinutes={exam.time_limit} onTimeUp={handleTimeUp} />
      </div>

      {/* Question navigation */}
      <div className="question-nav">
        {exam.questions.map((_, i) => (
          <button
            key={i}
            className={answers[i] ? "answered" : ""}
            onClick={() => document.getElementById(`q-${i}`)?.scrollIntoView({ behavior: "smooth" })}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Questions */}
      {exam.questions.map((q, i) => (
        <div key={i} id={`q-${i}`}>
          <Question
            question={q}
            index={i}
            answer={answers[i]}
            onAnswer={(ans) => handleAnswer(i, ans)}
          />
        </div>
      ))}

      <div className="submit-section">
        <p style={{ color: "#64748b", marginBottom: 12, fontSize: "0.9rem" }}>
          {Object.keys(answers).length} of {exam.questions.length} questions answered
        </p>
        <button className="btn btn-primary" onClick={gradeExam} disabled={grading}>
          {grading ? "Grading..." : "Submit Exam"}
        </button>
        {grading && slowNotice && (
          <p style={{ color: "#f59e0b", fontSize: "0.85rem", marginTop: 8 }}>
            Server is waking up — this may take up to a minute on first request.
          </p>
        )}
      </div>
    </div>
  );
}

export default ExamPage;
