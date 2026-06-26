# ==========================================
# Stage 1: Build dependencies
# ==========================================
FROM python:3.13-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# Install dependencies into virtualenv
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

# ==========================================
# Stage 2: Runtime image
# ==========================================
FROM python:3.13-slim AS runner

WORKDIR /app

# Install runtime system packages for Pillow (JPEG/PNG compression)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Copy virtualenv from builder stage
COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"
ENV FLASK_ENV=production
ENV PYTHONUNBUFFERED=1

# Create a non-privileged system user for security
RUN groupadd -g 1000 appuser && \
    useradd -r -u 1000 -g appuser appuser

# Copy application files
COPY --chown=appuser:appuser app/ ./app
COPY --chown=appuser:appuser run.py .
COPY --chown=appuser:appuser loveedit.db .

# Ensure storage permissions are configured
RUN mkdir -p app/static/uploads app/static/images && \
    chown -R appuser:appuser app/static/uploads app/static/images

USER appuser

EXPOSE 9000

# Run with Gunicorn on startup
CMD ["gunicorn", "--bind", "0.0.0.0:9000", "--workers", "4", "--threads", "2", "--timeout", "120", "run:app"]
