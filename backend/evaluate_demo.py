import argparse
import json

from app import documents_store, exams_store
from services.evaluator import evaluate_document, evaluate_exam


def main():
    parser = argparse.ArgumentParser(description="Print local evaluation metrics for an uploaded document or exam.")
    parser.add_argument("--document-id", help="Document id from the upload response")
    parser.add_argument("--exam-id", help="Exam id from the generation response")
    args = parser.parse_args()

    result = {}
    if args.document_id:
        doc = documents_store.get(args.document_id)
        if not doc:
            raise SystemExit(f"Document not found in current backend memory: {args.document_id}")
        result["document"] = evaluate_document(doc)

    if args.exam_id:
        exam = exams_store.get(args.exam_id)
        if not exam:
            raise SystemExit(f"Exam not found in current backend memory: {args.exam_id}")
        document_id = getattr(exam, "document_id", None)
        doc = documents_store.get(document_id, {})
        questions = [q.model_dump() for q in exam.questions]
        result["exam"] = evaluate_exam(questions, doc.get("concept_chunks", []))

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
