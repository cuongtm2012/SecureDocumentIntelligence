# Python OCR Service Integration Guide
**SecureDocumentIntelligence - Vietnamese OCR System**

## 🚀 Quick Start

### 1. Development Setup (Local)

```powershell
# Install Python dependencies for OCR service
cd python-ocr-service
pip install -r requirements.txt

# Start Python OCR service
python app.py

# In another terminal, start the main application
npm run dev
```

### 2. Production Setup (Docker)

```powershell
# Build and start all services
docker-compose up --build

# Or for development with hot reloading
docker-compose -f docker-compose.dev.yml up --build
```

## 📁 Project Architecture

```
SecureDocumentIntelligence/
├── client/                     # React/TypeScript frontend
│   ├── src/components/
│   │   ├── advanced-ocr-dashboard.tsx
│   │   ├── enhanced-upload-manager.tsx
│   │   ├── pdf-ocr-viewer.tsx
│   │   └── ...
│   └── ...
├── server/                     # Node.js/Express backend
│   ├── controllers/
│   │   └── ocr.controller.ts   # Enhanced OCR endpoints
│   ├── services/
│   │   └── python-ocr.service.ts  # Python integration
│   └── routes.ts               # API routes
├── python-ocr-service/         # Python OCR microservice
│   ├── app.py                  # FastAPI service
│   ├── cli.py                  # Command-line interface
│   ├── requirements.txt        # Python dependencies
│   └── Dockerfile              # Python service container
├── vietnamese_pdf_ocr.py       # Original OCR script
├── docker-compose.yml          # Production setup
├── docker-compose.dev.yml      # Development setup
└── package.json               # Node.js dependencies
```

## 🔧 Service Integration

### Python OCR Service Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health check |
| `/ocr/process` | POST | Process single PDF file |
| `/ocr/batch` | POST | Process multiple files |
| `/ocr/languages` | GET | Get supported languages |

### Node.js API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ocr/health` | GET | Python service health |
| `/api/ocr/process` | POST | Enhanced OCR processing |
| `/api/ocr/batch` | POST | Batch OCR processing |
| `/api/ocr/jobs/:jobId` | GET | Get batch job status |
| `/api/ocr/languages` | GET | Supported languages |
| `/api/ocr/info` | GET | Service information |

## 💻 Usage Examples

### 1. Process Single PDF File

```javascript
// Frontend React component
const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', 'vie');
  formData.append('confidenceThreshold', '60');

  const response = await fetch('/api/ocr/process', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();
  console.log('OCR Result:', result);
};
```

### 2. Batch Processing

```javascript
// Process multiple files
const processBatch = async (files) => {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });
  formData.append('language', 'vie');

  const response = await fetch('/api/ocr/batch', {
    method: 'POST',
    body: formData
  });

  const batchResult = await response.json();
  
  // Poll for job status
  const checkStatus = async () => {
    const statusResponse = await fetch(\`/api/ocr/jobs/\${batchResult.jobId}\`);
    const status = await statusResponse.json();
    
    if (status.status === 'completed') {
      console.log('Batch completed:', status.results);
    } else if (status.status === 'processing') {
      setTimeout(checkStatus, 2000); // Check again in 2 seconds
    }
  };
  
  checkStatus();
};
```

### 3. CLI Usage

```bash
# Process single file
python python-ocr-service/cli.py process --file document.pdf --output results.txt

# Batch process directory
python python-ocr-service/cli.py batch --input-dir ./pdfs --output-dir ./results

# Health check
python python-ocr-service/cli.py health
```

## 🔄 Service Communication Modes

### 1. API Mode (Recommended)
- **FastAPI Service**: Python service runs on port 8001
- **HTTP Communication**: Node.js → Python via REST API
- **Features**: Concurrent processing, health monitoring, structured responses

### 2. CLI Mode (Fallback)
- **Command Line**: Node.js spawns Python processes
- **File-based**: Results saved to temporary files
- **Features**: Reliable fallback, direct script execution

### 3. Hybrid Mode (Automatic)
- **Smart Fallback**: Try API first, fallback to CLI if unavailable
- **Resilient**: Handles service failures gracefully
- **Configurable**: Environment variable controls

## 🐳 Docker Deployment

### Production Deployment

```powershell
# Start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs app
docker-compose logs python-ocr

# Scale Python OCR service
docker-compose up -d --scale python-ocr=3
```

### Development with Hot Reloading

```powershell
# Development setup
docker-compose -f docker-compose.dev.yml up

# Rebuild specific service
docker-compose -f docker-compose.dev.yml build python-ocr-dev
```

## 📊 Monitoring & Health Checks

### Health Check Endpoints

```bash
# Check Python OCR service
curl http://localhost:8001/health

# Check main application
curl http://localhost:5000/api/ocr/health

# Get service information
curl http://localhost:5000/api/ocr/info
```

### Service Monitoring

```javascript
// Frontend health monitoring
const checkServices = async () => {
  try {
    const response = await fetch('/api/ocr/health');
    const health = await response.json();
    
    if (health.status === 'healthy') {
      console.log('✅ OCR service is healthy');
    } else {
      console.log('⚠️ OCR service issues:', health);
    }
  } catch (error) {
    console.log('❌ OCR service unavailable');
  }
};
```

## 🔧 Configuration

### Environment Variables

```bash
# Python OCR Service
PYTHON_OCR_SERVICE_URL=http://localhost:8001
PYTHON_OCR_SERVICE_PORT=8001

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ocr_db

# AI Services
OPENAI_API_KEY=your_deepseek_api_key

# Features
OCR_USE_API=true
OCR_MAX_FILE_SIZE=50MB
OCR_BATCH_TIMEOUT=300000
```

### Tesseract Configuration

```bash
# Install Vietnamese language data
# Windows: Download vie.traineddata to Tesseract tessdata folder
# Ubuntu: sudo apt-get install tesseract-ocr-vie
# macOS: brew install tesseract-lang
```

## 🚨 Troubleshooting

### Common Issues

1. **Python Service Not Starting**
   ```bash
   # Check Python dependencies
   cd python-ocr-service
   pip install -r requirements.txt
   
   # Test Tesseract installation
   python -c "import pytesseract; print(pytesseract.get_tesseract_version())"
   ```

2. **Vietnamese OCR Not Working**
   ```bash
   # Verify Vietnamese language data
   python -c "import pytesseract; print('vie' in pytesseract.get_languages())"
   
   # Install if missing
   # Windows: Copy vie.traineddata to Tesseract tessdata folder
   ```

3. **Service Communication Errors**
   ```bash
   # Check service availability
   curl http://localhost:8001/health
   
   # Check firewall/ports
   netstat -an | findstr :8001
   ```

4. **Memory Issues with Large Files**
   ```bash
   # Increase Docker memory limits
   # Reduce image DPI in OCR settings
   # Process files in smaller batches
   ```

## 📈 Performance Optimization

### Production Recommendations

1. **Resource Allocation**
   - Python OCR Service: 2GB RAM minimum
   - Node.js Application: 1GB RAM minimum
   - PostgreSQL: 512MB RAM minimum

2. **Scaling Strategy**
   ```yaml
   # docker-compose.yml
   python-ocr:
     deploy:
       replicas: 3
       resources:
         limits:
           memory: 2G
         reservations:
           memory: 1G
   ```

3. **Caching & Optimization**
   - Redis for job queue management
   - File upload streaming
   - Result caching for repeated processing

## 🔐 Security Considerations

1. **File Upload Security**
   - File type validation
   - Size limits enforcement  
   - Malware scanning (optional)

2. **Service Communication**
   - Internal network isolation
   - API authentication tokens
   - Request rate limiting

3. **Data Protection**
   - Temporary file cleanup
   - Encrypted database storage
   - Audit logging

## 📝 API Response Examples

### OCR Processing Response

```json
{
  "success": true,
  "fileId": "ocr_1642781234567_document.pdf",
  "text": "Extracted Vietnamese text content...",
  "confidence": 87.5,
  "pageCount": 3,
  "processingTime": 12.45,
  "metadata": {
    "characterCount": 1250,
    "wordCount": 185,
    "language": "vie",
    "confidenceThreshold": 60.0,
    "processingTimestamp": "2025-01-21T10:30:45.123Z",
    "fileSizeBytes": 2458624
  }
}
```

### Batch Processing Response

```json
{
  "jobId": "batch_1642781234567",
  "status": "completed",
  "results": [
    {
      "success": true,
      "fileId": "batch_1642781234567_file_1_doc1.pdf",
      "text": "Content from document 1...",
      "confidence": 89.2
    },
    {
      "success": true,
      "fileId": "batch_1642781234567_file_2_doc2.pdf", 
      "text": "Content from document 2...",
      "confidence": 85.7
    }
  ],
  "totalFiles": 2,
  "successfulFiles": 2,
  "failedFiles": 0,
  "startTime": "2025-01-21T10:25:00.000Z",
  "endTime": "2025-01-21T10:27:15.456Z"
}
```

## 🎯 Next Steps

1. **Testing**: Run the complete integration test suite
2. **Deployment**: Set up production Docker environment
3. **Monitoring**: Implement comprehensive logging and metrics
4. **Scaling**: Configure load balancing for multiple OCR workers
5. **Enhancement**: Add ML-based confidence scoring and validation

---

**📞 Support**: For issues or questions, check the troubleshooting section or create an issue in the repository.
