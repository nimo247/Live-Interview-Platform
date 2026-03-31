FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app source
COPY . .

EXPOSE 8000

# Use $PORT env var - Fly.io sets this automatically
CMD ["sh", "-c", "uvicorn app.main:socket_app --host 0.0.0.0 --port ${PORT:-8000}"]