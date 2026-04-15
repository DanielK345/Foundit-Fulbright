import { useEffect, useState } from "react";

function Timer({ totalMinutes, onTimeUp }) {
  const [secondsLeft, setSecondsLeft] = useState(totalMinutes * 60);

  useEffect(() => {
    setSecondsLeft(totalMinutes * 60);
  }, [totalMinutes]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onTimeUp();
      return undefined;
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsLeft, onTimeUp]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  let statusClass = "";
  if (secondsLeft < 60) {
    statusClass = "danger";
  } else if (secondsLeft < 300) {
    statusClass = "warning";
  }

  return (
    <div className={`timer-card ${statusClass}`}>
      <span className="timer-label">Time Remaining</span>
      <span className="timer-value">{timeStr}</span>
    </div>
  );
}

export default Timer;
