import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from models.schema import UploadResponse, DocumentContextResponse, UpdateContextRequest, IdeasResponse
from services.parser import parse_file
from config import (
    ALLOWED_EXTENSIONS,
    MAX_FILES_PER_UPLOAD,
    MAX_FILE_SIZE_BYTES,
    MAX_TOTAL_SIZE_BYTES,
    MAX_PAGES_PER_FILE,
    MAX_TOTAL_PAGES,
)

router = APIRouter()


@router.post("", response_model=UploadResponse)
async def upload_files(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    if len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Maximum {MAX_FILES_PER_UPLOAD} files per upload.",
        )

    document_id = str(uuid.uuid4())
    upload_dir = "uploads"
    all_pages = []
    filenames = []
    total_size_bytes = 0

    for file in files:
        filename = file.filename
        # Strip directory path for folder uploads (e.g. "subdir/file.pdf" -> "file.pdf")
        safe_name = os.path.basename(filename)
        ext = safe_name.lower().rsplit(".", 1)[-1] if "." in safe_name else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {safe_name}. Only PDF and PPTX files are supported.",
            )

        # Read content and enforce per-file and total size limits before writing to disk
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

        # Save file to disk
        file_path = os.path.join(upload_dir, f"{document_id}_{safe_name}")
        with open(file_path, "wb") as f:
            f.write(content)

        # Parse the file
        try:
            parsed_pages = parse_file(file_path, safe_name)
        except Exception as e:
            os.remove(file_path)
            raise HTTPException(status_code=500, detail=f"Failed to parse {safe_name}: {str(e)}")

        if not parsed_pages:
            os.remove(file_path)
            raise HTTPException(status_code=400, detail=f"No text content found in {safe_name}.")

        if len(parsed_pages) > MAX_PAGES_PER_FILE:
            os.remove(file_path)
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{safe_name} has {len(parsed_pages)} pages, which exceeds the "
                    f"{MAX_PAGES_PER_FILE}-page limit per file."
                ),
            )

        # Raw file is no longer needed — all content is in parsed_pages.
        os.remove(file_path)

        enriched_pages = []
        for page in parsed_pages:
            source = page["source"]
            enriched_pages.append({
                "filename": safe_name,
                "source": source,
                "source_label": f"{safe_name} - {source}",
                "extraction_method": page.get("extraction_method", "text"),
                "content": page["content"],
            })

        all_pages.extend(enriched_pages)
        filenames.append(safe_name)

        if len(all_pages) > MAX_TOTAL_PAGES:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Total pages across all uploaded files exceeds the "
                    f"{MAX_TOTAL_PAGES}-page limit."
                ),
            )

    # Store aggregated parsed data under a single document_id.
    # original_pages is kept intact for BM25 retrieval even after the user
    # edits the context in the review step (which overwrites "pages").
    from app import documents_store
    documents_store[document_id] = {
        "filenames": filenames,
        "pages": all_pages,
        "original_pages": list(all_pages),
    }

    file_word = "file" if len(filenames) == 1 else "files"
    return UploadResponse(
        document_id=document_id,
        filenames=filenames,
        num_pages=len(all_pages),
        message=f"Successfully parsed {len(all_pages)} sections from {len(filenames)} {file_word}",
    )


@router.get("/{document_id}/context", response_model=DocumentContextResponse)
async def get_document_context(document_id: str):
    from app import documents_store

    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")

    doc = documents_store[document_id]

    # Return a single merged content block
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

    # Store the edited content as a single merged block.
    # generate.py reads doc["pages"], so replace with one unified page.
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

    return IdeasResponse(ideas=ideas)
