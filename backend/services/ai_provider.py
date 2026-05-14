import json
import os
import re
import urllib.error
import urllib.request
from typing import Optional

import google.generativeai as genai
import numpy as np


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
OLLAMA_TEXT_MODEL = os.getenv("OLLAMA_TEXT_MODEL", "llama3")
OLLAMA_EXTRACT_MODEL = os.getenv("OLLAMA_EXTRACT_MODEL", OLLAMA_TEXT_MODEL)
OLLAMA_QUESTION_MODEL = os.getenv("OLLAMA_QUESTION_MODEL", OLLAMA_TEXT_MODEL)
OLLAMA_JUDGE_MODEL = os.getenv("OLLAMA_JUDGE_MODEL", OLLAMA_TEXT_MODEL)
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "8192"))
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "10m")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
AI_TEXT_PROVIDER = os.getenv("AI_TEXT_PROVIDER", "gemini").lower()
AI_EMBED_PROVIDER = os.getenv("AI_EMBED_PROVIDER", "ollama").lower()


def _post_json(url: str, payload: dict, timeout: int = 120) -> dict:
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _ollama_embed_one(text: str) -> list[float]:
    response = _post_json(
        f"{OLLAMA_BASE_URL}/api/embeddings",
        {"model": OLLAMA_EMBED_MODEL, "prompt": text},
        timeout=60,
    )
    return response["embedding"]


def _gemini_embed_texts(texts: list[str], task_type: str) -> np.ndarray:
    result = genai.embed_content(
        model="models/gemini-embedding-001",
        content=texts,
        task_type=task_type,
    )
    return np.array(result["embedding"], dtype=np.float32)


def embed_texts(texts: list[str], task_type: str = "retrieval_document") -> np.ndarray:
    clean_texts = [text or " " for text in texts]
    if AI_EMBED_PROVIDER == "ollama":
        try:
            return np.array([_ollama_embed_one(text) for text in clean_texts], dtype=np.float32)
        except (urllib.error.URLError, KeyError, TimeoutError):
            if not GEMINI_API_KEY:
                raise

    return _gemini_embed_texts(clean_texts, task_type)


def embed_query(query: str) -> np.ndarray:
    return embed_texts([query], task_type="retrieval_query").reshape(1, -1)


def _ollama_generate(
    prompt: str,
    temperature: float = 0.3,
    model: Optional[str] = None,
    json_mode: bool = False,
) -> str:
    payload = {
        "model": model or OLLAMA_TEXT_MODEL,
        "prompt": prompt,
        "stream": False,
        "keep_alive": OLLAMA_KEEP_ALIVE,
        "options": {
            "temperature": temperature,
            "num_ctx": OLLAMA_NUM_CTX,
        },
    }
    if json_mode:
        payload["format"] = "json"
    response = _post_json(f"{OLLAMA_BASE_URL}/api/generate", payload, timeout=240)
    return response.get("response", "").strip()


def generate_text(
    prompt: str,
    temperature: float = 0.3,
    prefer_local: bool = False,
    local_model: Optional[str] = None,
) -> str:
    use_local = prefer_local or AI_TEXT_PROVIDER == "ollama" or not GEMINI_API_KEY
    if use_local:
        try:
            return _ollama_generate(prompt, temperature=temperature, model=local_model)
        except (urllib.error.URLError, KeyError, TimeoutError):
            if not GEMINI_API_KEY:
                raise

    model = genai.GenerativeModel(
        GEMINI_MODEL,
        generation_config=genai.GenerationConfig(temperature=temperature),
    )
    return model.generate_content(prompt).text.strip()


def _extract_json_text(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start:end + 1]
    cleaned = cleaned.replace("\u201c", '"').replace("\u201d", '"')
    cleaned = cleaned.replace("\u2018", "'").replace("\u2019", "'")
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", cleaned)
    return cleaned


def _balance_json_delimiters(text: str) -> str:
    open_braces = text.count("{")
    close_braces = text.count("}")
    open_brackets = text.count("[")
    close_brackets = text.count("]")
    if close_brackets < open_brackets:
        text += "]" * (open_brackets - close_brackets)
    if close_braces < open_braces:
        text += "}" * (open_braces - close_braces)
    return text


def _parse_json_text(text: str) -> dict:
    cleaned = _extract_json_text(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        # Some models return one valid JSON object followed by commentary or
        # another object. raw_decode lets us keep the first complete object.
        if "Extra data" in str(exc):
            parsed, _ = json.JSONDecoder().raw_decode(cleaned)
            if isinstance(parsed, dict):
                return parsed
        balanced = _balance_json_delimiters(cleaned)
        if balanced != cleaned:
            return json.loads(balanced)
        raise


def _repair_json_text(text: str) -> dict:
    repair_prompt = f"""Convert the following malformed JSON-like text into valid strict JSON.
Return only JSON. Do not add commentary.

TEXT:
{text}
"""
    if GEMINI_API_KEY:
        model = genai.GenerativeModel(
            GEMINI_MODEL,
            generation_config=genai.GenerationConfig(
                temperature=0,
                response_mime_type="application/json",
            ),
        )
        repaired = model.generate_content(repair_prompt).text.strip()
        try:
            return _parse_json_text(repaired)
        except json.JSONDecodeError:
            return _parse_json_text(_balance_json_delimiters(repaired))

    repaired = generate_text(repair_prompt, temperature=0, prefer_local=True, local_model=OLLAMA_JUDGE_MODEL)
    try:
        return _parse_json_text(repaired)
    except json.JSONDecodeError:
        return _parse_json_text(_balance_json_delimiters(repaired))


def generate_json(
    prompt: str,
    temperature: float = 0.3,
    prefer_local: bool = False,
    local_model: Optional[str] = None,
) -> dict:
    use_local = prefer_local or AI_TEXT_PROVIDER == "ollama" or not GEMINI_API_KEY
    if use_local:
        text = _ollama_generate(
            prompt,
            temperature=temperature,
            model=local_model,
            json_mode=True,
        )
        try:
            return _parse_json_text(text)
        except json.JSONDecodeError:
            return _repair_json_text(text)

    model = genai.GenerativeModel(
        GEMINI_MODEL,
        generation_config=genai.GenerationConfig(
            temperature=temperature,
            response_mime_type="application/json",
        ),
    )
    text = model.generate_content(prompt).text.strip()
    try:
        return _parse_json_text(text)
    except json.JSONDecodeError:
        return _repair_json_text(text)
