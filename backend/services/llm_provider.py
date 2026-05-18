"""
llm_provider.py — Unified Gemini LLM client for the exam-generator backend.

Centralises everything needed to call the Gemini API:
  • API-key configuration   (single configure() at import time)
  • Model instantiation     (per-call temperature / JSON-mode / system instruction)
  • Retry with back-off     (exponential + jitter, up to max_retries extra attempts)
  • Model fallback          (gemini-1.5-flash when the primary model is exhausted)
  • Response validation     (safety blocks, empty text, MAX_TOKENS truncation)
  • Typed exception hierarchy for precise error handling in callers

Retry schedule (seconds before ±2 s jitter):
  Attempt 1 → wait 10 s
  Attempt 2 → wait 20 s
  Attempt 3 → wait 40 s

Retried errors
--------------
  429 ResourceExhausted      — rate limit
  503 ServiceUnavailable     — transient backend outage
  500 InternalServerError    — transient server error
  DeadlineExceeded           — request timeout
  Aborted                    — transient abort / server-side cancellation

Never retried
-------------
  SAFETY / RECITATION finish_reason — content was blocked; rephrasing is needed
  Empty response after all retries  — escalated as LLMEmptyError
  400 InvalidArgument               — bad prompt or parameters
  401 Unauthenticated               — wrong API key
  403 PermissionDenied              — key lacks access to the requested model

Public API
----------
generate(prompt, *, temperature, use_json, system_instruction, ...) -> str
    Returns response.text (stripped).

Exception hierarchy (all subclass LLMError)
-------------------------------------------
  LLMConfigError       GEMINI_API_KEY not set
  LLMRateLimitError    429 after all retries + fallback
  LLMUnavailableError  503 / 500 / timeout after all retries + fallback
  LLMSafetyError       Response blocked by safety / recitation filter
  LLMEmptyError        Model returned empty text after all retries
  LLMInvalidError      400-class error — bad prompt or parameters
"""

import os
import random
import time
import logging
from typing import Optional

import google.generativeai as genai
from google.api_core.exceptions import (
    ResourceExhausted,
    ServiceUnavailable,
    InternalServerError,
    DeadlineExceeded,
    Aborted,
    InvalidArgument,
    PermissionDenied,
    Unauthenticated,
)

logger = logging.getLogger("exam_generator.llm_provider")

# ---------------------------------------------------------------------------
# Model identifiers
# ---------------------------------------------------------------------------
PRIMARY_MODEL = "gemini-2.0-flash"
FALLBACK_MODEL = "gemini-1.5-flash"

# ---------------------------------------------------------------------------
# Retry configuration
# ---------------------------------------------------------------------------
# Seconds to wait BEFORE each successive retry (before jitter is applied).
_RETRY_DELAYS: list[int] = [10, 20, 40]
_JITTER: float = 2.0          # uniform ±seconds added to each delay
_EMPTY_RETRY_CAP: float = 5.0 # max initial wait for empty-response retries

# Exception groups used directly in except clauses.
_RETRYABLE = (
    ResourceExhausted,
    ServiceUnavailable,
    InternalServerError,
    DeadlineExceeded,
    Aborted,
)
_FATAL = (InvalidArgument, PermissionDenied, Unauthenticated)


# ---------------------------------------------------------------------------
# Public exception hierarchy
# ---------------------------------------------------------------------------

class LLMError(Exception):
    """Base class for all LLM-provider errors."""


class LLMConfigError(LLMError):
    """GEMINI_API_KEY not set or the genai client is misconfigured."""


class LLMRateLimitError(LLMError):
    """429 ResourceExhausted after all retries (and fallback, if enabled)."""


class LLMUnavailableError(LLMError):
    """503 / 500 / timeout after all retries (and fallback, if enabled)."""


class LLMSafetyError(LLMError):
    """Response was blocked by a Gemini safety or recitation filter."""


class LLMEmptyError(LLMError):
    """Model returned empty text after all retries."""


class LLMInvalidError(LLMError):
    """400-class error — malformed prompt or bad parameters; never retried."""


# ---------------------------------------------------------------------------
# One-time API key configuration
# ---------------------------------------------------------------------------

def _configure() -> None:
    """Read GEMINI_API_KEY from the environment and configure the genai client."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise LLMConfigError(
            "GEMINI_API_KEY environment variable is not set. "
            "Export it before starting the server."
        )
    genai.configure(api_key=api_key)


_configure()


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _make_model(
    model_name: str,
    temperature: float,
    use_json: bool,
    system_instruction: Optional[str],
) -> genai.GenerativeModel:
    """Instantiate a GenerativeModel with the given configuration."""
    gen_cfg: dict = {"temperature": temperature}
    if use_json:
        gen_cfg["response_mime_type"] = "application/json"

    kwargs: dict = {
        "model_name": model_name,
        "generation_config": genai.GenerationConfig(**gen_cfg),
    }
    if system_instruction:
        kwargs["system_instruction"] = system_instruction

    return genai.GenerativeModel(**kwargs)


def _validate_response(response) -> str:
    """
    Inspect a Gemini response and return the text (stripped).

    Finish-reason checks
    --------------------
    SAFETY / RECITATION  → raise LLMSafetyError  (never retry)
    MAX_TOKENS           → log a warning, still return the partial text

    Text checks
    -----------
    ValueError on .text  → SDK signals a blocked response → LLMSafetyError
    Empty / whitespace   → raise LLMEmptyError  (caller may retry)
    """
    # --- finish_reason -------------------------------------------------------
    try:
        candidate = response.candidates[0]
        reason_name: str = candidate.finish_reason.name  # "STOP", "MAX_TOKENS", …

        if reason_name in ("SAFETY", "RECITATION"):
            raise LLMSafetyError(
                f"Gemini blocked the response (finish_reason={reason_name}). "
                "Rephrase the prompt and try again."
            )
        if reason_name == "MAX_TOKENS":
            logger.warning(
                "Gemini response was truncated at MAX_TOKENS. "
                "Consider reducing the prompt size or requesting fewer questions."
            )
    except LLMSafetyError:
        raise
    except Exception:
        # Older SDK versions or some response shapes don't expose
        # candidates / finish_reason — skip the check rather than crash.
        pass

    # --- text extraction -----------------------------------------------------
    try:
        text = response.text
    except ValueError as exc:
        # The SDK raises ValueError on .text access when the response is blocked.
        raise LLMSafetyError(f"Gemini blocked the response: {exc}") from exc
    except AttributeError:
        text = ""

    if not text or not text.strip():
        raise LLMEmptyError("Gemini returned an empty response.")

    return text.strip()


def _call_with_retry(
    model: genai.GenerativeModel,
    prompt: str,
    max_retries: int,
) -> str:
    """
    Inner retry loop for a single model instance.

    Retry policy
    ------------
    Transient network / rate-limit errors (_RETRYABLE):
        Exponential back-off with ±jitter; up to max_retries additional attempts.

    Empty responses (LLMEmptyError):
        Same policy but initial wait is capped at _EMPTY_RETRY_CAP seconds,
        since these are less predictable and often resolve quickly.

    Safety / recitation blocks (LLMSafetyError):
        Re-raised immediately — retrying will not change the outcome.

    Fatal API errors (_FATAL — 400 / 401 / 403):
        Wrapped in LLMInvalidError and re-raised without any delay.

    Any other exception:
        Propagates unchanged; callers should not silence unknown errors.

    Returns
    -------
    Validated response text (stripped) on success.
    """
    last_exc: Exception = RuntimeError("_call_with_retry: no attempts completed")

    for attempt in range(max_retries + 1):
        try:
            response = model.generate_content(prompt)
            return _validate_response(response)

        except LLMSafetyError:
            raise  # deterministic — a retry will produce the same block

        except LLMEmptyError as exc:
            last_exc = exc
            if attempt >= max_retries:
                break
            raw_delay = _RETRY_DELAYS[min(attempt, len(_RETRY_DELAYS) - 1)]
            wait = max(1.0, min(_EMPTY_RETRY_CAP, raw_delay) + random.uniform(0, _JITTER))
            logger.warning(
                "Gemini returned an empty response (attempt %d/%d) — retrying in %.1f s",
                attempt + 1, max_retries, wait,
            )
            time.sleep(wait)

        except _FATAL as exc:  # type: ignore[misc]
            raise LLMInvalidError(
                f"Non-retryable Gemini error ({type(exc).__name__}): {exc}"
            ) from exc

        except _RETRYABLE as exc:  # type: ignore[misc]
            last_exc = exc
            if attempt >= max_retries:
                break
            delay = _RETRY_DELAYS[min(attempt, len(_RETRY_DELAYS) - 1)]
            wait = max(1.0, delay + random.uniform(-_JITTER, _JITTER))
            logger.warning(
                "Gemini %s (attempt %d/%d) — retrying in %.1f s: %s",
                type(exc).__name__, attempt + 1, max_retries, wait, exc,
            )
            time.sleep(wait)

        # Any other exception (SDK bug, network stack, etc.) propagates immediately.

    raise last_exc


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate(
    prompt: str,
    *,
    temperature: float = 0.7,
    use_json: bool = False,
    system_instruction: Optional[str] = None,
    model_name: str = PRIMARY_MODEL,
    max_retries: int = 3,
    allow_fallback: bool = True,
) -> str:
    """
    Generate content from Gemini and return the response text (stripped).

    All retry, fallback, and response-validation logic is handled internally.
    See the module docstring for the full exception reference.

    Parameters
    ----------
    prompt             Full prompt string to send.
    temperature        Sampling temperature 0.0–2.0.  Default 0.7.
    use_json           Set response_mime_type="application/json".  Default False.
    system_instruction Optional system-role instruction prepended to the session.
    model_name         Gemini model identifier.  Defaults to PRIMARY_MODEL.
    max_retries        Extra retry attempts for transient errors.  Default 3.
    allow_fallback     Try FALLBACK_MODEL once after the primary model exhausts
                       its retries.  Default True.

    Returns
    -------
    str  Response text, stripped of leading/trailing whitespace.

    Raises
    ------
    LLMConfigError      GEMINI_API_KEY not set.
    LLMRateLimitError   429 after all retries (and fallback, if enabled).
    LLMUnavailableError 503 / 500 / timeout after all retries (and fallback).
    LLMSafetyError      Response blocked by safety / recitation filter.
    LLMEmptyError       Empty text returned after all retries.
    LLMInvalidError     400-class error — bad parameters or prompt.
    """
    model = _make_model(model_name, temperature, use_json, system_instruction)

    try:
        return _call_with_retry(model, prompt, max_retries)

    except _RETRYABLE as primary_exc:  # type: ignore[misc]
        if allow_fallback and model_name == PRIMARY_MODEL:
            logger.error(
                "Primary model %s exhausted all retries (%s). "
                "Switching to fallback model %s.",
                model_name, type(primary_exc).__name__, FALLBACK_MODEL,
            )
            fallback_model = _make_model(FALLBACK_MODEL, temperature, use_json, system_instruction)
            try:
                return _call_with_retry(fallback_model, prompt, max_retries=1)
            except ResourceExhausted as fb_exc:
                raise LLMRateLimitError(
                    f"Both {PRIMARY_MODEL} and {FALLBACK_MODEL} are rate-limited. "
                    "Wait a minute and try again."
                ) from fb_exc
            except _RETRYABLE as fb_exc:  # type: ignore[misc]
                raise LLMUnavailableError(
                    f"Both {PRIMARY_MODEL} and {FALLBACK_MODEL} are unavailable. "
                    "Try again later."
                ) from fb_exc
            # LLMSafetyError / LLMEmptyError / LLMInvalidError from fallback
            # propagate unchanged — no further wrapping needed.

        # Fallback disabled or already on a non-primary model.
        if isinstance(primary_exc, ResourceExhausted):
            raise LLMRateLimitError(
                f"Rate limit exhausted after {max_retries} retries."
            ) from primary_exc
        raise LLMUnavailableError(
            f"Service unavailable after {max_retries} retries."
        ) from primary_exc
