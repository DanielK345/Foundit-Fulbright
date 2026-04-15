import React, { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  NavLink,
  Route,
  Routes,
} from "react-router-dom";
import axios from "axios";
import UploadDashboardPage from "./pages/UploadDashboardPage";
import ConfigStudioPage from "./pages/ConfigStudioPage";
import ExamStudioPage from "./pages/ExamStudioPage";
import "./theme.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

function HeaderIcon({ children }) {
  return (
    <div className="topbar-icon" aria-hidden="true">
      {children}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 1 1 5.7 1c-.5.9-1.4 1.3-2.1 1.8-.7.5-1.2 1.1-1.2 2.2" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AppChrome({ connStatus, allowedOrigins, dismissed, setDismissed }) {
  const navItems = [
    { to: "/", label: "Dashboard", end: true },
    { to: "/config/demo", label: "Question Bank", preview: true },
    { to: "/exam/demo", label: "History", preview: true },
  ];

  return (
    <>
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">A</div>
          <div className="brand-copy">
            <span className="brand-title">Academic Curator</span>
            <span className="brand-subtitle">AI exam builder</span>
          </div>
        </div>

        <nav className="topbar-nav" aria-label="Primary">
          {navItems.map((item, index) => (
            <NavLink
              key={`${item.label}-${index}`}
              className={({ isActive }) =>
                `topbar-link ${isActive ? "active" : ""}`
              }
              end={item.end}
              to={item.to}
            >
              <span>{item.label}</span>
              {item.preview && <span className="topbar-badge">Preview</span>}
            </NavLink>
          ))}
        </nav>

        <div className="topbar-tools">
          <div className="search-pill" aria-hidden="true">
            <SearchIcon />
            <span>Search resources...</span>
          </div>
          <HeaderIcon>
            <BellIcon />
          </HeaderIcon>
          <HeaderIcon>
            <HelpIcon />
          </HeaderIcon>
          <div className="topbar-avatar" aria-hidden="true">
            NT
          </div>
        </div>
      </header>

      {!dismissed && (
        <div className={`health-pill health-pill-${connStatus}`}>
          <span className="health-dot" />
          <span>
            {connStatus === "connecting" && "Connecting to backend"}
            {connStatus === "connected" && "Backend online"}
            {connStatus === "failed" && "Backend unavailable"}
          </span>
          {connStatus === "connected" && allowedOrigins && (
            <span className="health-meta">
              {Array.isArray(allowedOrigins)
                ? allowedOrigins.join(", ")
                : allowedOrigins}
            </span>
          )}
          {connStatus !== "connecting" && (
            <button
              className="health-dismiss"
              onClick={() => setDismissed(true)}
              type="button"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </>
  );
}

function AppContent() {
  const [connStatus, setConnStatus] = useState("connecting");
  const [allowedOrigins, setAllowedOrigins] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await axios.get(`${API_URL}/health`, {
          timeout: 120000,
        });
        if (response.data?.status === "ok") {
          setConnStatus("connected");
          setAllowedOrigins(response.data.allowed_origins || null);
        } else {
          setConnStatus("failed");
        }
      } catch {
        setConnStatus("failed");
      }
    };

    checkBackend();
  }, []);

  return (
    <div className="app-shell">
      <AppChrome
        allowedOrigins={allowedOrigins}
        connStatus={connStatus}
        dismissed={dismissed}
        setDismissed={setDismissed}
      />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<UploadDashboardPage />} />
          <Route path="/config/:documentId" element={<ConfigStudioPage />} />
          <Route path="/exam/:examId" element={<ExamStudioPage />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
