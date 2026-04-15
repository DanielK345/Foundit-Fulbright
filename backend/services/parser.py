import io
import os

import pdfplumber
import pypdfium2 as pdfium
from PIL import Image
from pptx import Presentation

try:
    import pytesseract
except ImportError:
    pytesseract = None

try:
    import google.generativeai as genai
    _GEMINI_KEY = os.getenv("GEMINI_API_KEY")
    if _GEMINI_KEY:
        genai.configure(api_key=_GEMINI_KEY)
    _GEMINI_AVAILABLE = bool(_GEMINI_KEY)
except ImportError:
    genai = None
    _GEMINI_AVAILABLE = False


EXTRACTION_PROMPT = (
    "You are extracting content from a document page or presentation slide for exam question generation. "
    "Extract ALL content comprehensively: every title, bullet point, label, and body text; "
    "describe any diagrams, charts, or tables including their data and what they illustrate; "
    "explain any visual concepts shown. "
    "Write in clear prose that fully preserves the educational meaning. "
    "Output only the extracted content — no commentary, no headings like 'Here is the content'."
)


def _resize_for_gemini(image: Image.Image, max_px: int = 1500) -> Image.Image:
    """Resize image so the longest side is at most max_px."""
    w, h = image.size
    if w <= max_px and h <= max_px:
        return image
    scale = max_px / max(w, h)
    return image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)


def _gemini_extract_image(image: Image.Image, raw_text: str = "") -> str:
    """Send a rendered page/slide image to Gemini Vision for rich extraction."""
    model = genai.GenerativeModel("gemini-2.0-flash")
    parts = []
    if raw_text.strip():
        parts.append(f"Raw text found on this page (may be incomplete):\n{raw_text}\n\n")
    parts.append(_resize_for_gemini(image))
    parts.append(EXTRACTION_PROMPT)
    response = model.generate_content(parts)
    return response.text.strip()


def _gemini_extract_slide(text_blocks: list[str], images: list[Image.Image]) -> str:
    """Send slide text + embedded images to Gemini for rich extraction."""
    model = genai.GenerativeModel("gemini-2.0-flash")
    parts = []
    if text_blocks:
        parts.append("Text found on this slide:\n" + "\n".join(text_blocks) + "\n\n")
    for img in images:
        parts.append(_resize_for_gemini(img))
    parts.append(EXTRACTION_PROMPT)
    response = model.generate_content(parts)
    return response.text.strip()


# ── fallback helpers (no Gemini) ────────────────────────────────────────────

def _ocr_available() -> bool:
    if pytesseract is None:
        return False
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def _clean_text_blocks(blocks: list[str]) -> list[str]:
    cleaned, seen = [], set()
    for block in blocks:
        text = block.strip()
        if not text:
            continue
        normalized = " ".join(text.split())
        if normalized in seen:
            continue
        seen.add(normalized)
        cleaned.append(text)
    return cleaned


def _ocr_image(image: Image.Image) -> str:
    if not _ocr_available():
        return ""
    grayscale = image.convert("L")
    return pytesseract.image_to_string(grayscale).strip()


def _render_pdf_page(page: pdfium.PdfPage, scale: float = 2.0) -> Image.Image:
    bitmap = page.render(scale=scale)
    try:
        return bitmap.to_pil()
    finally:
        bitmap.close()


# ── main parsers ─────────────────────────────────────────────────────────────

def parse_pdf(file_path: str) -> list[dict]:
    """Extract text from each PDF page.

    Uses Gemini Vision when available (renders page → image → Gemini).
    Falls back to pdfplumber text + Tesseract OCR otherwise.
    """
    pages = []

    with pdfplumber.open(file_path) as pdf, pdfium.PdfDocument(file_path) as pdf_doc:
        for i, page in enumerate(pdf.pages):
            raw_text = (page.extract_text() or "").strip()

            if _GEMINI_AVAILABLE:
                pdf_page = pdf_doc[i]
                rendered = _render_pdf_page(pdf_page)
                try:
                    content = _gemini_extract_image(rendered, raw_text)
                    extraction_method = "gemini"
                except Exception:
                    content = raw_text
                    extraction_method = "text"
                finally:
                    rendered.close()
                    pdf_page.close()
            else:
                # Fallback: text + OCR
                blocks = []
                if raw_text:
                    blocks.append(raw_text)
                if len(raw_text) < 40:
                    pdf_page = pdf_doc[i]
                    rendered = _render_pdf_page(pdf_page)
                    try:
                        ocr_text = _ocr_image(rendered)
                    finally:
                        rendered.close()
                        pdf_page.close()
                    if ocr_text:
                        blocks.append(f"[OCR]\n{ocr_text}")
                content_blocks = _clean_text_blocks(blocks)
                content = "\n\n".join(content_blocks)
                extraction_method = "text" if raw_text else "ocr"

            if content:
                pages.append({
                    "source": f"page_{i + 1}",
                    "content": content,
                    "extraction_method": extraction_method,
                })

    return pages


def parse_pptx(file_path: str) -> list[dict]:
    """Extract text from each PPTX slide.

    Uses Gemini with slide text + embedded images when available.
    Falls back to plain text extraction + Tesseract OCR otherwise.
    """
    prs = Presentation(file_path)
    slides = []

    for i, slide in enumerate(prs.slides):
        text_blocks = []
        embedded_images = []

        for shape in slide.shapes:
            if getattr(shape, "has_text_frame", False):
                for paragraph in shape.text_frame.paragraphs:
                    text = paragraph.text.strip()
                    if text:
                        text_blocks.append(text)

            if getattr(shape, "shape_type", None) == 13 and hasattr(shape, "image"):
                try:
                    img = Image.open(io.BytesIO(shape.image.blob))
                    embedded_images.append(img.copy())
                    img.close()
                except Exception:
                    pass

        # Also grab speaker notes — often contain the real explanations
        notes_text = ""
        try:
            notes_slide = slide.notes_slide
            for para in notes_slide.notes_text_frame.paragraphs:
                t = para.text.strip()
                if t:
                    notes_text += t + "\n"
            notes_text = notes_text.strip()
        except Exception:
            pass

        if not text_blocks and not embedded_images and not notes_text:
            continue

        if _GEMINI_AVAILABLE:
            all_text = _clean_text_blocks(text_blocks)
            if notes_text:
                all_text.append(f"[Speaker notes]\n{notes_text}")
            try:
                content = _gemini_extract_slide(all_text, embedded_images)
                extraction_method = "gemini"
            except Exception:
                content = "\n\n".join(_clean_text_blocks(text_blocks))
                extraction_method = "text"
        else:
            # Fallback: text + OCR on embedded images
            has_ocr = False
            for img in embedded_images:
                ocr_text = _ocr_image(img)
                if ocr_text:
                    text_blocks.append(f"[Image OCR]\n{ocr_text}")
                    has_ocr = True
            if notes_text:
                text_blocks.append(f"[Speaker notes]\n{notes_text}")
            content_blocks = _clean_text_blocks(text_blocks)
            content = "\n\n".join(content_blocks)
            has_text = any(not b.startswith("[Image OCR]") for b in content_blocks)
            extraction_method = "text+ocr" if has_text and has_ocr else ("ocr" if has_ocr else "text")

        for img in embedded_images:
            img.close()

        if content:
            slides.append({
                "source": f"slide_{i + 1}",
                "content": content,
                "extraction_method": extraction_method,
            })

    return slides


def parse_file(file_path: str, filename: str) -> list[dict]:
    """Route to the correct parser based on file extension."""
    ext = filename.lower().rsplit(".", 1)[-1]
    if ext == "pdf":
        return parse_pdf(file_path)
    elif ext == "pptx":
        return parse_pptx(file_path)
    else:
        raise ValueError(f"Unsupported file type: {ext}")
