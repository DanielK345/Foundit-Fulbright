import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8010";
const ALLOWED_EXTENSIONS = ["pdf", "pptx"];

function UploadPage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [folderMode, setFolderMode] = useState(false);
  const [slowNotice, setSlowNotice] = useState(false);
  const [processingStatus, setProcessingStatus] = useState(null);
  const fileInputRef = useRef();
  const folderInputRef = useRef();
  const navigate = useNavigate();

  const isValidFile = (name) => {
    const ext = name.split(".").pop().toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
  };

  const addFiles = (newFiles) => {
    const fileArray = Array.from(newFiles);
    const valid = fileArray.filter((f) => isValidFile(f.name));
    const rejected = fileArray.length - valid.length;

    if (valid.length === 0) {
      setMessage({ type: "error", text: "No valid files found. Only PDF and PPTX files are supported." });
      return;
    }

    // Deduplicate by name + size
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const unique = valid.filter((f) => !existing.has(`${f.name}_${f.size}`));
      return [...prev, ...unique];
    });

    if (rejected > 0) {
      setMessage({
        type: "error",
        text: `${rejected} file(s) skipped — only PDF and PPTX files are supported.`,
      });
    } else {
      setMessage(null);
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearFiles = () => {
    setFiles([]);
    setMessage(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setMessage(null);
    setSlowNotice(false);
    setProcessingStatus(null);

    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    const slowTimer = setTimeout(() => setSlowNotice(true), 5000);

    try {
      const { data } = await axios.post(`${API_URL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        // Only needs time to save bytes — parsing is now async
        timeout: 30000,
      });

      clearTimeout(slowTimer);
      setSlowNotice(false);
      setMessage({ type: "info", text: "Files uploaded — parsing in background..." });

      const result = await pollProcessingStatus(data.document_id);

      if (result.success) {
        setMessage({ type: "success", text: `Ready! ${result.total_pages} sections extracted.` });
        setTimeout(() => navigate(`/config/${data.document_id}`), 800);
      } else {
        setMessage({ type: "error", text: result.error || "Processing failed. Please try again." });
      }
    } catch (err) {
      clearTimeout(slowTimer);
      if (err.code === "ECONNABORTED") {
        setMessage({ type: "error", text: "Request timed out. The server may be starting up — please try again." });
      } else if (!err.response) {
        setMessage({ type: "error", text: "Cannot reach the server. It may be waking up — please wait a moment and try again." });
      } else {
        const detail = err.response?.data?.detail || "Upload failed. Please try again.";
        setMessage({ type: "error", text: detail });
      }
    } finally {
      clearTimeout(slowTimer);
      setUploading(false);
      setSlowNotice(false);
      setProcessingStatus(null);
    }
  };

  const pollProcessingStatus = async (documentId) => {
    const maxAttempts = 180; // 3-minute ceiling
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

        // Still processing — update the progress display
        setProcessingStatus({ processed_files, total_files, total_pages });
        setMessage({
          type: "info",
          text: `Parsing files... ${processed_files}/${total_files} done, ${total_pages} sections so far`,
        });
      } catch (_) {
        // Network blip — keep retrying
      }
    }
    return { success: false, error: "Processing timed out after 3 minutes." };
  };

  const openPicker = () => {
    if (folderMode) {
      folderInputRef.current.click();
    } else {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="upload-container">
      <h2>Upload Your Documents</h2>
      <p style={{ color: "#64748b", marginTop: 8 }}>
        Upload lecture slides or documents to generate an exam
      </p>

      {/* Toggle between file and folder mode */}
      <div className="upload-mode-toggle">
        <button
          className={`toggle-btn ${!folderMode ? "active" : ""}`}
          onClick={() => setFolderMode(false)}
        >
          Select Files
        </button>
        <button
          className={`toggle-btn ${folderMode ? "active" : ""}`}
          onClick={() => setFolderMode(true)}
        >
          Select Folder
        </button>
      </div>

      <div
        className={`upload-zone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={openPicker}
      >
        {/* Hidden file input for multi-file select */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".pdf,.pptx"
          multiple
          onChange={(e) => { if (e.target.files.length > 0) addFiles(e.target.files); e.target.value = ""; }}
        />
        {/* Hidden folder input */}
        <input
          type="file"
          ref={folderInputRef}
          accept=".pdf,.pptx"
          // eslint-disable-next-line react/no-unknown-property
          webkitdirectory=""
          onChange={(e) => { if (e.target.files.length > 0) addFiles(e.target.files); e.target.value = ""; }}
        />

        <p style={{ fontSize: "2rem" }}>&#128196;</p>
        <p>
          <strong>Click to {folderMode ? "select a folder" : "select files"}</strong> or drag and drop
        </p>
        <p style={{ fontSize: "0.85rem" }}>PDF or PPTX files only — multiple files supported</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="file-list">
          <div className="file-list-header">
            <span>{files.length} file{files.length !== 1 ? "s" : ""} selected</span>
            <button className="btn-clear" onClick={clearFiles}>Clear all</button>
          </div>
          {files.map((file, i) => (
            <div key={`${file.name}_${file.size}`} className="file-list-item">
              <span className="file-name">{file.name}</span>
              <span className="file-size">{(file.size / 1024).toFixed(0)} KB</span>
              <button className="btn-remove" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleUpload}
        disabled={files.length === 0 || uploading}
      >
        {uploading ? "Uploading..." : `Upload ${files.length || ""} Document${files.length !== 1 ? "s" : ""}`}
      </button>
      {uploading && processingStatus && (
        <div className="processing-progress">
          <div className="progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.round((processingStatus.processed_files / processingStatus.total_files) * 100)}%`,
              }}
            />
          </div>
          <p className="progress-label">
            {processingStatus.processed_files}/{processingStatus.total_files} files &mdash;{" "}
            {processingStatus.total_pages} sections extracted
          </p>
        </div>
      )}
      {uploading && slowNotice && (
        <div className="status-message info">
          Server is waking up — this may take up to a minute on first request.
        </div>
      )}

      {message && (
        <div className={`status-message ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

export default UploadPage;
