from services.validator import validate_questions


def evaluate_document(doc: dict) -> dict:
    sections = doc.get("pages", [])
    concepts = doc.get("concepts", [])
    chunks = doc.get("concept_chunks", [])
    total_sections = len(sections)
    usable_sections = len([s for s in sections if s.get("content_quality") in {"high", "medium"}])
    low_quality_sections = len([s for s in sections if s.get("content_quality") == "low"])
    return {
        "total_sections": total_sections,
        "usable_sections": usable_sections,
        "extraction_coverage": round((usable_sections / total_sections) * 100, 1) if total_sections else 0,
        "low_quality_sections": low_quality_sections,
        "concept_count": len(concepts),
        "concept_chunk_count": len(chunks),
        "document_types": doc.get("document_types", {}),
    }


def evaluate_exam(exam_questions: list[dict], context_chunks: list[dict]) -> dict:
    valid, rejected = validate_questions(exam_questions, context_chunks)
    total = len(exam_questions)
    concepts = {q.get("concept_id") or q.get("concept") for q in exam_questions if q.get("concept_id") or q.get("concept")}
    with_evidence = len([q for q in exam_questions if q.get("evidence")])
    return {
        "total_questions": total,
        "valid_questions": len(valid),
        "rejected_questions": len(rejected),
        "grounding_rate": round((len(valid) / total) * 100, 1) if total else 0,
        "evidence_rate": round((with_evidence / total) * 100, 1) if total else 0,
        "concept_coverage": len(concepts),
        "reject_reasons": [q.get("reject_reason") for q in rejected],
    }
