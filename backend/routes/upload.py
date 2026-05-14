import os
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from models.schema import (
    ConceptsResponse,
    DocumentContextResponse,
    IdeasResponse,
    QualityResponse,
    SectionsResponse,
    CourseMapResponse,
    UpdateCourseMapRequest,
    UpdateContextRequest,
    UpdateSectionsRequest,
    UploadResponse,
)
from services.concept_extractor import build_quality_report, concepts_to_chunks, extract_concepts
from services.course_map import build_course_map, build_rule_based_course_map, prune_course_map
from services.embedder import build_faiss_index
from services.parser import infer_document_type, parse_file

router = APIRouter()

ALLOWED_EXTENSIONS = {"pdf", "pptx", "docx", "txt", "md"}
DOCUMENT_TYPES = {"slides", "homework", "reading", "notes", "previous_test", "unknown"}


def _init_lightweight_artifacts(doc: dict) -> None:
    doc["quality_report"] = build_quality_report(doc.get("pages", []), doc.get("document_types", {}))
    doc.setdefault("concepts", [])
    doc.setdefault("concept_chunks", [])
    doc.setdefault("course_map", {})
    doc.setdefault("blueprints", {})
    doc.setdefault("exams", {})
    doc.setdefault("faiss_index", None)
    doc["artifacts_ready"] = bool(doc.get("concepts") and doc.get("course_map"))


def _rebuild_study_artifacts(document_id: str, doc: dict) -> None:
    doc["quality_report"] = build_quality_report(doc.get("pages", []), doc.get("document_types", {}))
    concepts = extract_concepts(doc.get("pages", []))
    concept_chunks = concepts_to_chunks(concepts)
    doc["concepts"] = concepts
    doc["concept_chunks"] = concept_chunks
    doc["course_map"] = build_course_map(doc.get("pages", []), concepts)
    doc.setdefault("blueprints", {})
    doc.setdefault("exams", {})
    doc["faiss_index"] = None
    if concept_chunks:
        try:
            index, indexed_chunks = build_faiss_index(concept_chunks, document_id)
            doc["faiss_index"] = index
            doc["concept_chunks"] = indexed_chunks
        except Exception:
            doc["faiss_index"] = None
    doc["artifacts_ready"] = True


def _ensure_study_artifacts(document_id: str, doc: dict) -> None:
    if doc.get("artifacts_ready") and doc.get("course_map"):
        return
    _rebuild_study_artifacts(document_id, doc)


def _build_fast_course_map_from_sections(doc: dict) -> None:
    if doc.get("course_map"):
        doc["course_map"] = prune_course_map(doc.get("course_map", {}))
        return
    doc["course_map"] = build_rule_based_course_map(doc.get("pages", []))
    doc["course_map_ready"] = True


@router.post("", response_model=UploadResponse)
async def upload_files(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    document_id = str(uuid.uuid4())
    upload_dir = "uploads"
    all_pages = []
    filenames = []
    document_types = {}

    for file in files:
        filename = file.filename
        # Strip directory path for folder uploads (e.g. "subdir/file.pdf" -> "file.pdf")
        safe_name = os.path.basename(filename)
        ext = safe_name.lower().rsplit(".", 1)[-1] if "." in safe_name else ""
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {safe_name}. Supported files: PDF, PPTX, DOCX, TXT, MD.",
            )

        # Save file to disk
        file_path = os.path.join(upload_dir, f"{document_id}_{safe_name}")
        content = await file.read()
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

        document_type = infer_document_type(safe_name, parsed_pages)
        document_types[safe_name] = document_type

        enriched_pages = []
        for page in parsed_pages:
            source = page["source"]
            enriched_pages.append({
                "filename": safe_name,
                "document_type": document_type,
                "section_id": page.get("section_id", source),
                "source": source,
                "source_label": f"{safe_name} - {source}",
                "title": page.get("title", ""),
                "raw_text": page.get("raw_text", page["content"]),
                "extraction_method": page.get("extraction_method", "text"),
                "content_quality": page.get("content_quality", "medium"),
                "needs_review": page.get("needs_review", False),
                "content": page["content"],
            })

        all_pages.extend(enriched_pages)
        filenames.append(safe_name)

    from app import documents_store
    documents_store[document_id] = {
        "document_id": document_id,
        "filenames": filenames,
        "pages": all_pages,
        "document_types": document_types,
        "quality_report": {},
        "concepts": [],
        "concept_chunks": [],
        "course_map": {},
        "faiss_index": None,
        "blueprints": {},
        "exams": {},
    }
    _init_lightweight_artifacts(documents_store[document_id])

    file_word = "file" if len(filenames) == 1 else "files"
    return UploadResponse(
        document_id=document_id,
        filenames=filenames,
        num_pages=len(all_pages),
        document_types=document_types,
        quality_report=documents_store[document_id]["quality_report"],
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
        quality_report=doc.get("quality_report", {}),
        sections=doc.get("pages", []),
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
        "document_type": "notes",
        "source": "edited_content",
        "source_label": "Edited content",
        "extraction_method": "text",
        "content_quality": "high",
        "needs_review": False,
        "content": body.content,
    }]
    documents_store[document_id]["document_types"] = {
        documents_store[document_id]["filenames"][0]: "notes"
    }
    _rebuild_study_artifacts(document_id, documents_store[document_id])

    return {"message": "Context updated."}


@router.get("/{document_id}/sections", response_model=SectionsResponse)
async def get_document_sections(document_id: str):
    from app import documents_store
    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")
    return SectionsResponse(
        document_id=document_id,
        sections=documents_store[document_id].get("pages", []),
    )


@router.put("/{document_id}/sections", response_model=SectionsResponse)
async def update_document_sections(document_id: str, body: UpdateSectionsRequest):
    from app import documents_store
    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")

    sanitized = []
    document_types = {}
    for index, section in enumerate(body.sections):
        content = str(section.get("content", "")).strip()
        if not content:
            continue
        filename = str(section.get("filename", "edited_material"))
        doc_type = str(section.get("document_type", "unknown"))
        if doc_type not in DOCUMENT_TYPES:
            doc_type = "unknown"
        source = str(section.get("source", f"section_{index + 1}"))
        sanitized.append({
            "filename": filename,
            "document_type": doc_type,
            "section_id": str(section.get("section_id", source)),
            "source": source,
            "source_label": str(section.get("source_label", f"{filename} - {source}")),
            "title": str(section.get("title", "")),
            "raw_text": str(section.get("raw_text", content)),
            "extraction_method": str(section.get("extraction_method", "text")),
            "content_quality": str(section.get("content_quality", "medium")),
            "needs_review": bool(section.get("needs_review", False)),
            "content": content,
        })
        document_types[filename] = doc_type

    if not sanitized:
        raise HTTPException(status_code=400, detail="At least one non-empty section is required.")

    documents_store[document_id]["pages"] = sanitized
    documents_store[document_id]["filenames"] = sorted(document_types.keys())
    documents_store[document_id]["document_types"] = document_types
    documents_store[document_id].pop("merged_content", None)
    _rebuild_study_artifacts(document_id, documents_store[document_id])

    return SectionsResponse(document_id=document_id, sections=sanitized)


@router.get("/{document_id}/course-map", response_model=CourseMapResponse)
async def get_course_map(document_id: str):
    from app import documents_store
    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")
    doc = documents_store[document_id]
    _build_fast_course_map_from_sections(doc)
    return CourseMapResponse(document_id=document_id, course_map=doc.get("course_map", {}))


@router.put("/{document_id}/course-map", response_model=CourseMapResponse)
async def update_course_map(document_id: str, body: UpdateCourseMapRequest):
    from app import documents_store
    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")
    documents_store[document_id]["course_map"] = prune_course_map(body.course_map)
    documents_store[document_id]["blueprints"] = {}
    return CourseMapResponse(document_id=document_id, course_map=documents_store[document_id]["course_map"])


@router.post("/{document_id}/course-map/refine", response_model=CourseMapResponse)
async def refine_course_map(document_id: str):
    from app import documents_store
    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")
    doc = documents_store[document_id]
    _rebuild_study_artifacts(document_id, doc)
    doc["course_map"] = prune_course_map(doc.get("course_map", {}))
    doc["blueprints"] = {}
    return CourseMapResponse(document_id=document_id, course_map=doc.get("course_map", {}))


@router.get("/{document_id}/quality", response_model=QualityResponse)
async def get_document_quality(document_id: str):
    from app import documents_store
    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")
    return QualityResponse(
        document_id=document_id,
        quality_report=documents_store[document_id].get("quality_report", {}),
    )


@router.get("/{document_id}/concepts", response_model=ConceptsResponse)
async def get_document_concepts(document_id: str):
    from app import documents_store
    if document_id not in documents_store:
        raise HTTPException(status_code=404, detail="Document not found.")
    _ensure_study_artifacts(document_id, documents_store[document_id])
    return ConceptsResponse(
        document_id=document_id,
        concepts=documents_store[document_id].get("concepts", []),
    )


@router.post("/{document_id}/ideas", response_model=IdeasResponse)
async def extract_document_ideas(document_id: str):
    from app import documents_store
    from services.generator import extract_main_ideas

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
