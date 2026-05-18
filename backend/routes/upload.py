"""Upload routes — files are saved instantly and parsed in a background thread."""
import os
import asyncio
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, UploadFile, File, HTTPException

from models.schema import (
    UploadResponse,
    UploadStatusResponse,
    DocumentContextResponse,
    UpdateContextRequest,
    IdeasResponse,
)
from services.parser import parse_file
from config import (
    ALLOWED_EXTENSIONS,
    MAX_FILES_PER_UPLOAD,
    MAX_FILE_SIZE_BYTES,
    MAX_TOTAL_SIZE_BYTES,
    MAX_PAGES_PER_FILE,
    MAX_TOTAL_PAGES,
)

logger = logging.getLogger("exam_generator.upload")

# Thread pool for CPU-bound / blocking I/O parsing work
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="upload-worker")

router = APIRouter()


# ---------------------------------------------------------------------------
# Background worker — must not touch the asyncio event loop directly
# ---------------------------------------------------------------------------

def _safe_remove(path: str) -> None:
    """Delete a temp file silently; ignores missing-file errors."""
    try:
        if os.path.exists(path):
            os.remove(path)
    except OSError:
        pass


def _process_files_sync(document_id: str, file_entries: list[dict]) -> None:
    """
    Parse all uploaded files for one document **in parallel** (up to 4 at once).

    Runs inside the outer ThreadPoolExecutor so the FastAPI event loop is never
    blocked. Each file is parsed in its own sub-thread; progress is reported
    via upload_tasks_store so the frontend can poll for live updates.
    """
    from app import documents_store, upload_tasks_store

    task = upload_tasks_store[document_id]

    # Per-file results keyed by safe_name; errors use a list so the closure
    # can write into it from multiple threads.
    results: dict[str, list] = {}
    errors: list[str] = []

    def _parse_one(entry: dict) -> None:
        """Parse a single file and store pages in results[safe_name]."""
        safe_name = entry["safe_name"]
        file_path = entry["file_path"]
        try:
            logger.info("[%s] Parsing %s …", document_id[:8], safe_name)
            pages = parse_file(file_path, safe_name)

            if not pages:
                errors.append(f"No text content found in {safe_name}.")
                logger.warning("[%s] No content in %s", document_id[:8], safe_name)
                return

            if len(pages) > MAX_PAGES_PER_FILE:
                errors.append(
                    f"{safe_name} has {len(pages)} pages, which exceeds "
                    f"the {MAX_PAGES_PER_FILE}-page limit per file."
                )
                return

            results[safe_name] = pages
            task["processed_files"] += 1
            logger.info(
                "[%s] ✓ %s — %d sections (%d/%d done)",
                document_id[:8], safe_name, len(pages),
                task["processed_files"], task["total_files"],
            )
        except Exception as exc:
            errors.append(f"Failed to parse {safe_name}: {exc}")
            logger.error("[%s] Parse error — %s: %s", document_id[:8], safe_name, exc)
        finally:
            _safe_remove(file_path)

    try:
        # Parse up to 4 files simultaneously
        worker_count = min(len(file_entries), 4)
        with ThreadPoolExecutor(
            max_workers=worker_count, thread_name_prefix="file-parser"
        ) as parse_pool:
            # submit all, then wait; each future updates task counter on completion
            futs = [parse_pool.submit(_parse_one, entry) for entry in file_entries]
            for fut in as_completed(futs):
                fut.result()  # re-raise any unexpected exception

        if errors:
            task.update({"status": "error", "error": errors[0]})
            logger.error("[%s] Processing failed: %s", document_id[:8], errors[0])
            return

        # Reassemble in original upload order
        all_pages: list[dict] = []
        for entry in file_entries:
            safe_name = entry["safe_name"]
            enriched = [
                {
                    "filename": safe_name,
                    "source": p["source"],
                    "source_label": f"{safe_name} - {p['source']}",
                    "extraction_method": p.get("extraction_method", "text"),
                    "content": p["content"],
                }
                for p in results[safe_name]
            ]
            all_pages.extend(enriched)

        if len(all_pages) > MAX_TOTAL_PAGES:
            task.update({
                "status": "error",
                "error": (
                    f"Total pages across all uploaded files exceeds the "
                    f"{MAX_TOTAL_PAGES}-page limit."
                ),
            })
            return

        documents_store[document_id] = {
            "filenames": task["filenames"],
            "pages": all_pages,
            "original_pages": list(all_pages),
        }
        task["status"] = "ready"
        task["total_pages"] = len(all_pages)
        logger.info(
            "[%s] Ready — %d file(s), %d sections total",
            document_id[:8], task["total_files"], len(all_pages),
        )

    except Exception as exc:
        task.update({"status": "error", "error": f"Unexpected error: {exc}"})
        logger.exception("[%s] Unexpected processing error", document_id[:8])

    finally:
        # Second-pass cleanup: remove any files not yet reached on early return
        for entry in file_entries:
            _safe_remove(entry["file_path"])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("", response_model=UploadResponse)
async def upload_files(files: list[UploadFile] = File(...)):
    """
    Validate and save uploaded files, then immediately return a document_id
    with status='processing'.  Actual parsing runs in a background thread.
    Poll GET /{document_id}/status to track progress.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    if len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Maximum {MAX_FILES_PER_UPLOAD} files per upload.",
        )

    document_id = str(uuid.uuid4())
    upload_dir = "uploads"
    file_entries: list[dict] = []
    filenames: list[str] = []
    total_size_bytes = 0

    for file in files:
        safe_name = os.path.basename(file.filename)
        ext = safe_name.lower().rsplit(".", 1)[-1] if "." in safe_name else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unsupported file type: {safe_name}. "
                    "Only PDF and PPTX files are supported."
                ),
            )

        content = await file.read()
        file_size = len(content)

        if file_size > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"{safe_name} is too large ({file_size / 1024 / 1024:.1f} MB). "
                    f"Maximum allowed size per file is {MAX_FILE_SIZE_BYTES // 1024 // 1024} MB."
                ),
            )

        total_size_bytes += file_size
        if total_size_bytes > MAX_TOTAL_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=(
                    f"Combined upload size exceeds the "
                    f"{MAX_TOTAL_SIZE_BYTES // 1024 // 1024} MB limit."
                ),
            )

        file_path = os.path.join(upload_dir, f"{document_id}_{safe_name}")
        with open(file_path, "wb") as fh:
            fh.write(content)

        file_entries.append({"safe_name": safe_name, "file_path": file_path})
        filenames.append(safe_name)

    # Register the task BEFORE dispatching so GET /status always finds it
    from app import upload_tasks_store
    upload_tasks_store[document_id] = {
        "status": "processing",
        "processed_files": 0,
        "total_files": len(filenames),
        "total_pages": 0,
        "filenames": filenames,
        "error": None,
    }

    file_word = "file" if len(filenames) == 1 else "files"
    logger.info(
        "[%s] Queued %d %s: %s",
        document_id[:8], len(filenames), file_word, ", ".join(filenames),
    )

    # Dispatch to thread pool — returns immediately, does not block event loop
    loop = asyncio.get_running_loop()
    loop.run_in_executor(_executor, _process_files_sync, document_id, file_entries)

    return UploadResponse(
        document_id=document_id,
        filenames=filenames,
        status="processing",
        num_pages=0,
        message=f"Processing {len(filenames)} {file_word} in the background...",
    )


@router.get("/{document_id}/status", response_model=UploadStatusResponse)
async def get_upload_status(document_id: str):
    """Return the current processing state for an upload."""
    from app import upload_tasks_store, documents_store

    if document_id in upload_tasks_store:
        task = upload_tasks_store[document_id]
        return UploadStatusResponse(
            document_id=document_id,
            status=task["status"],
            processed_files=task["processed_files"],
            total_files=task["total_files"],
            total_pages=task["total_pages"],
            filenames=task["filenames"],
            error=task.get("error"),
        )

    # Fallback: document was created before task tracking existed
    if document_id in documents_store:
        doc = documents_store[document_id]
        return UploadStatusResponse(
            document_id=document_id,
            status="ready",
            processed_files=len(doc["filenames"]),
            total_files=len(doc["filenames"]),
            total_pages=len(doc["pages"]),
            filenames=doc["filenames"],
        )

    raise HTTPException(status_code=404, detail="Upload task not found.")


@router.get("/{document_id}/context", response_model=DocumentContextResponse)
async def get_document_context(document_id: str):
    from app import documents_store

    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc = documents_store[document_id]
    merged_content = doc.get("merged_content") or "\n\n".join(
        page["content"] for page in doc["pages"] if page.get("content", "").strip()
    )

    return DocumentContextResponse(
        document_id=document_id,
        filenames=doc["filenames"],
        num_sections=len(doc["pages"]),
        merged_content=merged_content,
    )


@router.put("/{document_id}/context")
async def update_document_context(document_id: str, body: UpdateContextRequest):
    from app import documents_store

    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")

    documents_store[document_id]["merged_content"] = body.content
    documents_store[document_id]["pages"] = [{
        "filename": documents_store[document_id]["filenames"][0],
        "source": "edited_content",
        "source_label": "Edited content",
        "extraction_method": "text",
        "content": body.content,
    }]

    return {"message": "Context updated."}


@router.post("/{document_id}/ideas", response_model=IdeasResponse)
async def extract_document_ideas(document_id: str):
    from app import documents_store
    from agents.content_summarizer import extract_main_ideas

    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc = documents_store[document_id]
    all_chunks = [
        {
            "source": page.get("source", ""),
            "source_label": page.get("source_label", page.get("source", "")),
            "content": page["content"],
        }
        for page in doc["pages"]
        if page.get("content", "").strip()
    ]

    if not all_chunks:
        raise HTTPException(status_code=400, detail="No text content found in the document.")

    try:
        ideas = extract_main_ideas(all_chunks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Idea extraction failed: {str(e)}")

    # Persist so the generator can use these topics as BM25 query seeds
    # for documents large enough to trigger retrieval.
    documents_store[document_id]["ideas"] = ideas

    return IdeasResponse(ideas=ideas)

