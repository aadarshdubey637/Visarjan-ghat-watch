FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    DATABASE_URL=sqlite:////data/ghat_sentinel.db \
    DATA_DIR=/data

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts
COPY docs ./docs

# Non-root user; /data holds the SQLite file and the downloaded CSVs (mount a volume here to keep them).
RUN useradd --create-home --uid 1000 appuser && mkdir -p /data && chown -R appuser /data /app
USER appuser
VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD python -c "import os,urllib.request;urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/v1/health',timeout=4)" || exit 1

# Download public datasets (skipped if already in /data/raw), import them (idempotent), then serve.
# A failed download does not stop the API from starting; /api/v1/health then reports data_loaded=false.
CMD ["sh", "-c", "(python scripts/download_data.py || echo 'download failed; continuing'); (python scripts/seed_database.py || echo 'seed failed; continuing'); exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
