# Dockerfile for Python OCR Microservice
# Professional containerized Vietnamese OCR service

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for OCR
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-vie \
    tesseract-ocr-eng \
    libtesseract-dev \
    poppler-utils \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install additional language data if needed
RUN wget -q https://github.com/tesseract-ocr/tessdata/raw/main/vie.traineddata -O /usr/share/tesseract-ocr/4.00/tessdata/vie.traineddata || true

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py .
COPY cli.py .

# Create directories for processing
RUN mkdir -p /tmp/ocr_service /app/logs

# Expose the service port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/4.00/tessdata

# Run the FastAPI service
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
