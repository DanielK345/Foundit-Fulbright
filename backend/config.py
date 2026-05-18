# ─────────────────────────────────────────────────────────────────────────────
# Upload limits
# ─────────────────────────────────────────────────────────────────────────────

# Accepted file extensions
ALLOWED_EXTENSIONS: frozenset[str] = frozenset({"pdf", "pptx"})

# Maximum number of files allowed in a single upload request
MAX_FILES_PER_UPLOAD: int = 10

# Maximum size for a single file (50 MB)
MAX_FILE_SIZE_BYTES: int = 50 * 1024 * 1024

# Maximum combined size of all files in one upload request (100 MB)
MAX_TOTAL_SIZE_BYTES: int = 100 * 1024 * 1024

# Maximum pages / slides extracted from a single file
MAX_PAGES_PER_FILE: int = 500

# Maximum pages / slides across all files in one upload request
MAX_TOTAL_PAGES: int = 1000

# ─────────────────────────────────────────────────────────────────────────────
# Exam generation limits
# ─────────────────────────────────────────────────────────────────────────────

MAX_MCQ: int = 50
MAX_TRUE_FALSE: int = 50
MAX_SHORT_ANSWER: int = 20
MAX_CODING: int = 10

MIN_TIME_LIMIT: int = 5    # minutes
MAX_TIME_LIMIT: int = 180  # minutes

# ─────────────────────────────────────────────────────────────────────────────
# BM25 retrieval
# ─────────────────────────────────────────────────────────────────────────────

# Documents with more pages than this threshold use BM25; shorter ones get full context
BM25_FULL_CONTEXT_THRESHOLD: int = 15

# BM25 candidates returned per topic query
BM25_TOP_K_PER_TOPIC: int = 3

# Hard cap on total pages passed to the generator
BM25_MAX_TOTAL: int = 20

# Minimum retrieved pages before falling back to full context
BM25_MIN_RETRIEVAL_CHUNKS: int = 5
