FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# Download public datasets, import them (idempotent), then serve.
CMD ["sh", "-c", "(python scripts/download_data.py || echo 'download failed; continuing'); (python scripts/seed_database.py || echo 'seed failed; continuing'); uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
