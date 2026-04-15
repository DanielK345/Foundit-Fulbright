import React from "react";

function typeLabel(type) {
  if (type === "mcq") return "Multiple Choice Question";
  if (type === "true_false") return "True / False Question";
  return "Short Answer Question";
}

function Question({
  question,
  index,
  answer,
  onAnswer,
  isFlagged,
  onToggleFlag,
}) {
  const { type, question: questionText, options } = question;

  return (
    <section className="exam-question-card">
      <div className="exam-question-accent" aria-hidden="true" />
      <div className="exam-question-body">
        <div className="exam-question-header">
          <div className="exam-question-meta">
            <div className="exam-question-index">{index + 1}</div>
            <div>
              <h2>{`Question ${index + 1}`}</h2>
              <p>{typeLabel(type)}</p>
            </div>
          </div>
          <button
            className={`ghost-flag-button ${isFlagged ? "is-flagged" : ""}`}
            onClick={onToggleFlag}
            type="button"
          >
            {isFlagged ? "Remove Flag" : "Flag for Review"}
          </button>
        </div>

        <p className="exam-question-text">{questionText}</p>

      {(type === "mcq" || type === "true_false") && options && (
        <div className="answer-stack">
          {options.map((option, i) => (
              <label className={`answer-option ${answer === option ? "selected" : ""}`} key={i}>
                <input
                  type="radio"
                  name={`question-${index}`}
                  value={option}
                  checked={answer === option}
                  onChange={() => onAnswer(option)}
                />
                <span className="answer-control" aria-hidden="true" />
                <span className="answer-copy">
                  <strong>{option}</strong>
                </span>
              </label>
          ))}
        </div>
      )}

      {type === "short_answer" && (
          <label className="short-answer-shell">
            <span>Your answer</span>
            <textarea
              className="short-answer-input"
              placeholder="Type the concept, principle, or explanation you want to submit."
              value={answer || ""}
              onChange={(e) => onAnswer(e.target.value)}
              rows="6"
            />
          </label>
      )}
      </div>
    </section>
  );
}

export default Question;
