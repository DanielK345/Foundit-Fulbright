import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8010";
const ALLOWED_EXTENSIONS = ["pdf", "pptx"];

function formatSize(size) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function estimateProcessingLabel(fileCount) {
  const totalSeconds = Math.max(25, fileCount * 14);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function UploadDashboardPage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [folderMode, setFolderMode] = useState(false);
  const [slowNotice, setSlowNotice] = useState(false);
  const [processingStatus, setProcessingStatus] = useState(null);
  const [fileProgresses, setFileProgresses] = useState([]);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const navigate = useNavigate();

  const isValidFile = (name) => {
    const ext = name.split(".").pop().toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
  };

  const addFiles = (newFiles) => {
    const fileArray = Array.from(newFiles);
    const valid = fileArray.filter((file) => isValidFile(file.name));
    const rejected = fileArray.length - valid.length;

    if (valid.length === 0) {
      setMessage({
        type: "error",
        text: "Only PDF and PPTX files are supported for exam generation.",
      });
      return;
    }

    setFiles((prev) => {
      const existing = new Set(prev.map((file) => `${file.name}_${file.size}`));
      const unique = valid.filter(
        (file) => !existing.has(`${file.name}_${file.size}`),
      );
      return [...prev, ...unique];
    });

    if (rejected > 0) {
      setMessage({
        type: "error",
        text: `${rejected} file(s) were skipped because they are not PDF or PPTX documents.`,
      });
    } else {
      setMessage(null);
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    setMessage(null);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  };

  const pollProcessingStatus = async (documentId) => {
    const maxAttempts = 180;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const res = await axios.get(`${API_URL}/upload/${documentId}/status`, { timeout: 5000 });
        const { status, processed_files, total_files, total_pages, error } = res.data;
        if (status === "ready") {
          setProcessingStatus(null);
          return { success: true, total_pages };
        }
        if (status === "error") {
          setProcessingStatus(null);
          return { success: false, error: error || "Processing failed." };
        }
        setProcessingStatus({ processed_files, total_files, total_pages });
      } catch (_) {
        // network blip — keep retrying
      }
    }
    return { success: false, error: "Processing timed out after 3 minutes." };
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setMessage(null);
    setSlowNotice(false);
    setProcessingStatus(null);
    setFileProgresses(files.map(() => 0));

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    // Pre-compute cumulative byte offsets for per-file progress estimation
    const fileSizes = files.map((f) => f.size);
    const totalSize = fileSizes.reduce((s, n) => s + n, 0);

    const slowTimer = setTimeout(() => setSlowNotice(true), 5000);

    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 30000,
        onUploadProgress: (evt) => {
          if (!evt.total && totalSize === 0) return;
          const loaded = evt.loaded;
          const progresses = [];
          let cumulative = 0;
          for (const size of fileSizes) {
            if (loaded >= cumulative + size) {
              progresses.push(100);
            } else if (loaded > cumulative) {
              progresses.push(Math.round(((loaded - cumulative) / size) * 100));
            } else {
              progresses.push(0);
            }
            cumulative += size;
          }
          setFileProgresses(progresses);
        },
      });

      clearTimeout(slowTimer);
      setSlowNotice(false);
      setMessage({ type: "info", text: "Files uploaded — parsing in background..." });

      const result = await pollProcessingStatus(response.data.document_id);

      if (result.success) {
        navigate(`/review/${response.data.document_id}`);
      } else {
        setMessage({ type: "error", text: result.error || "Processing failed. Please try again." });
      }
    } catch (error) {
      clearTimeout(slowTimer);
      if (error.code === "ECONNABORTED") {
        setMessage({
          type: "error",
          text: "Upload timed out while the backend was waking up. Please try again.",
        });
      } else if (!error.response) {
        setMessage({
          type: "error",
          text: "The backend is unreachable right now. Give it a moment and retry.",
        });
      } else {
        setMessage({
          type: "error",
          text: error.response?.data?.detail || "Upload failed. Please try again.",
        });
      }
    } finally {
      clearTimeout(slowTimer);
      setUploading(false);
      setSlowNotice(false);
      setProcessingStatus(null);
      setFileProgresses([]);
    }
  };

  const openPicker = () => {
    if (folderMode) {
      folderInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="dashboard-focus">
      <section className="focus-hero-card">
        <div className="focus-hero-head">
          <p className="eyebrow">Exam Builder</p>
          <h1>Build your exam from source files</h1>
          <p className="focus-subcopy">
            Upload PDF or PPTX materials, then continue to exam setup. Keep the
            source focused for better generation quality.
          </p>
          <div className="focus-stepper" aria-label="Exam workflow steps">
            <span className="step-chip active">1. Upload</span>
            <span className="step-chip">2. Review</span>
            <span className="step-chip">3. Configure</span>
            <span className="step-chip">4. Take exam</span>
          </div>
        </div>

        <div className="focus-upload-shell">
          <div
            className={`upload-dropzone ${dragging ? "dragging" : ""}`}
            onClick={openPicker}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDrop={handleDrop}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openPicker();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <input
              accept=".pdf,.pptx"
              multiple
              onChange={(event) => {
                if (event.target.files.length > 0) addFiles(event.target.files);
                event.target.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />
            <input
              accept=".pdf,.pptx"
              onChange={(event) => {
                if (event.target.files.length > 0) addFiles(event.target.files);
                event.target.value = "";
              }}
              ref={folderInputRef}
              type="file"
              // eslint-disable-next-line react/no-unknown-property
              webkitdirectory=""
            />

            <div className="upload-dropzone-icon">+</div>
            <h3>Drag and drop your study material</h3>
            <p>{`Click to ${folderMode ? "select a folder" : "browse files"} or drop documents here.`}</p>
            <span>Accepted types: PDF, PPTX.</span>
          </div>

          <div className="focus-controls-row">
            <div className="hero-actions">
              <button
                className={`mode-toggle ${!folderMode ? "active" : ""}`}
                aria-pressed={!folderMode}
                onClick={() => setFolderMode(false)}
                type="button"
              >
                Select Files
              </button>
              <button
                className={`mode-toggle ${folderMode ? "active" : ""}`}
                aria-pressed={folderMode}
                onClick={() => setFolderMode(true)}
                type="button"
              >
                Select Folder
              </button>
            </div>

            <button
              className="primary-pill-button"
              disabled={files.length === 0 || uploading}
              onClick={handleUpload}
              type="button"
            >
              {uploading
                ? processingStatus
                  ? `Parsing… ${processingStatus.processed_files}/${processingStatus.total_files} files`
                  : "Uploading resources..."
                : "Continue to exam setup"}
            </button>
          </div>

          <div className="focus-inline-meta">
            <span>{`${files.length} queued`}</span>
            <span>{folderMode ? "Folder import" : "Multi-file import"}</span>
            <span>{uploading ? "Uploading" : "Ready"}</span>
          </div>

          {files.length > 0 && (
            <div className="focus-ready-strip" role="status" aria-live="polite">
              <strong>{`${files.length} resource${files.length === 1 ? "" : "s"} selected`}</strong>
              <span>{`Estimated processing: ${estimateProcessingLabel(files.length)}`}</span>
            </div>
          )}
        </div>

        {uploading && slowNotice && (
          <div className="feedback-banner info">
            The server is waking up. The first request can take a little longer
            than usual.
          </div>
        )}

        {message && (
          <div className={`feedback-banner ${message.type}`}>
            {message.text}
          </div>
        )}

        {uploading && processingStatus && (
          <div className="processing-progress" style={{ margin: "8px 0 0" }}>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${Math.round((processingStatus.processed_files / processingStatus.total_files) * 100)}%` }}
              />
            </div>
            <p className="progress-label">
              {processingStatus.processed_files}/{processingStatus.total_files} files parsed — {processingStatus.total_pages} sections extracted
            </p>
          </div>
        )}
      </section>

      {files.length > 0 && (
        <section className="focus-file-tray">
          <div className="file-panel">
            <div className="file-panel-header">
              <div>
                <h3>Selected resources</h3>
                <p>
                  Review and trim your upload queue before generating the exam
                  configuration.
                </p>
              </div>
              {!uploading && (
                <button
                  className="text-action"
                  onClick={clearFiles}
                  type="button"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="file-grid">
              {files.map((file, index) => {
                // Determine per-file state during upload/parsing
                const uploadPct = fileProgresses[index] ?? 0;
                const parsedCount = processingStatus?.processed_files ?? 0;
                const isParsed = uploading && processingStatus && index < parsedCount;
                const isParsing = uploading && processingStatus && index === parsedCount;
                const isUploading = uploading && !processingStatus;

                return (
                  <div
                    className={`file-card ${uploading ? "file-card-active" : ""}`}
                    key={`${file.name}_${file.size}`}
                  >
                    <div className="file-card-info">
                      <strong>{file.name}</strong>
                      <span>{formatSize(file.size)}</span>
                    </div>

                    {isUploading && (
                      <div className="file-upload-bar-shell">
                        <div
                          className="file-upload-bar-fill"
                          style={{ width: `${uploadPct}%` }}
                        />
                        <span className="file-upload-pct">{uploadPct}%</span>
                      </div>
                    )}

                    {uploading && processingStatus && (
                      <div className="file-upload-bar-shell">
                        <div
                          className={`file-upload-bar-fill ${isParsed ? "parsed" : isParsing ? "parsing" : "queued"}`}
                          style={{ width: isParsed ? "100%" : isParsing ? "50%" : "4px" }}
                        />
                        <span className="file-upload-pct">
                          {isParsed ? "✓ Done" : isParsing ? "Parsing…" : "Queued"}
                        </span>
                      </div>
                    )}

                    {!uploading && (
                      <button onClick={() => removeFile(index)} type="button">
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <details className="focus-accordion">
        <summary>How it works</summary>
        <ol className="workflow-list">
          <li>Upload one or more PDF or PPTX resources.</li>
          <li>Adjust exam structure and difficulty.</li>
          <li>Run the exam and review grading insights.</li>
        </ol>
      </details>
    </div>
  );
}

export default UploadDashboardPage;
