import React from "react";

function typeBadgeClass(type) {
  if (type === "mcq") return "mcq";
  if (type === "true_false") return "tf";
  if (type === "coding") return "coding";
  return "sa";
}

function typeBadgeLabel(type) {
  if (type === "mcq") return "MCQ";
  if (type === "true_false") return "T / F";
  if (type === "coding") return "Coding";
  return "Short Answer";
}

function Question({
  question,
  index,
  answer,
  onAnswer,
  isFlagged,
  onToggleFlag,
}) {
  const { type, question: questionText, options, code_snippet: codeSnippet } = question;
  const isCodingMCQ = type === "coding" && options && options.length > 0;
  const isCodingShort = type === "coding" && (!options || options.length === 0);

  return (
    <section className="exam-question-card">
      <div className="exam-question-accent" aria-hidden="true" />
      <div className="exam-question-body">
        <div className="exam-question-header">
          <div className="exam-question-meta">
            <div className="exam-question-index">{index + 1}</div>
            <div>
              <h2>{`Question ${index + 1}`}</h2>
              <span className={`question-type-badge type-${typeBadgeClass(type)}`}>
                {typeBadgeLabel(type)}
              </span>
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

        {codeSnippet && (
          <pre className="exam-code-snippet"><code>{codeSnippet}</code></pre>
        )}

      {(type === "mcq" || type === "true_false" || isCodingMCQ) && options && (
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
              rows="4"
            />
          </label>
      )}

      {isCodingShort && (
          <label className="short-answer-shell">
            <span>Your answer</span>
            <textarea
              className="short-answer-input"
              placeholder="Describe the output or behavior — e.g. 'Less than 200000, varies due to race condition' or a specific value with a brief reason."
              value={answer || ""}
              onChange={(e) => onAnswer(e.target.value)}
              rows="4"
            />
          </label>
      )}
      </div>
    </section>
  );
}

export default Question;
