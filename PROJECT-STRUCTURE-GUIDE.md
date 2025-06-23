# 🏗️ Integrated OCR Project Structure & Workflow

## 📁 Recommended Project Structure

```
SecureDocumentIntelligence/
├── 📂 client/                          # React Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── advanced-ocr-dashboard.tsx
│   │   │   ├── enhanced-upload-manager.tsx
│   │   │   └── ...existing components...
│   │   ├── services/
│   │   │   ├── api.ts                  # API communication layer
│   │   │   └── upload.ts               # File upload utilities
│   │   └── types/
│   │       └── ocr.ts                  # OCR-related TypeScript interfaces
│   └── package.json
│
├── 📂 server/                          # Express Backend
│   ├── controllers/
│   │   ├── document.controller.ts      # Document upload/processing endpoints
│   │   └── ocr.controller.ts           # OCR-specific endpoints
│   ├── services/
│   │   ├── ocr.service.ts              # OCR orchestration service
│   │   ├── python-ocr.service.ts       # Python script interface
│   │   └── file-handler.service.ts     # File management
│   ├── middleware/
│   │   ├── upload.middleware.ts        # Multer configuration
│   │   ├── validation.middleware.ts    # Request validation
│   │   └── security.middleware.ts      # Security headers
│   ├── utils/
│   │   ├── process-manager.ts          # Child process management
│   │   └── error-handler.ts            # Centralized error handling
│   ├── routes.ts                       # Main routes
│   └── index.ts
│
├── 📂 python-ocr/                      # Python OCR Microservice
│   ├── 📂 app/
│   │   ├── __init__.py
│   │   ├── main.py                     # FastAPI app entry point
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   └── ocr.py                  # OCR endpoints
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── ocr_processor.py        # Core OCR logic
│   │   │   └── vietnamese_ocr.py       # Vietnamese-specific OCR
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── request.py              # Request models
│   │   │   └── response.py             # Response models
│   │   └── utils/
│   │       ├── __init__.py
│   │       ├── file_utils.py           # File handling utilities
│   │       └── config.py               # Configuration management
│   ├── requirements.txt
│   ├── Dockerfile                      # For containerization
│   └── run.py                          # Development server
│
├── 📂 shared/                          # Shared Types & Utilities
│   ├── types/
│   │   ├── ocr.ts                      # OCR-related interfaces
│   │   └── api.ts                      # API response types
│   └── schema.ts
│
├── 📂 uploads/                         # File Storage
│   ├── temp/                          # Temporary uploads
│   ├── processed/                     # Processed files
│   └── thumbnails/                    # Generated thumbnails
│
├── 📂 config/                          # Configuration
│   ├── development.json
│   ├── production.json
│   └── ocr-settings.json
│
├── 📂 scripts/                         # Deployment & Utility Scripts
│   ├── setup-python-env.sh
│   ├── install-tesseract.sh
│   └── health-check.py
│
├── 📂 docs/                           # Documentation
│   ├── api-documentation.md
│   ├── ocr-workflow.md
│   └── deployment-guide.md
│
├── docker-compose.yml                 # Multi-service orchestration
├── package.json                       # Node.js dependencies
├── requirements.txt                   # Python dependencies
└── README.md
```

## 🔄 Workflow Description

### Step 1: Frontend Upload
```typescript
// client/src/services/upload.ts
export async function uploadPDFForOCR(file: File): Promise<OCRResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('language', 'vie'); // Vietnamese
  formData.append('options', JSON.stringify({ 
    confidence_threshold: 0.7,
    preprocess: true 
  }));
  
  const response = await fetch('/api/documents/upload-and-process', {
    method: 'POST',
    body: formData
  });
  
  return response.json();
}
```

### Step 2: Express Backend Processing
```typescript
// server/controllers/document.controller.ts
export async function uploadAndProcessPDF(req: Request, res: Response) {
  try {
    // 1. Validate and save uploaded file
    const file = req.file;
    if (!file) throw new Error('No file uploaded');
    
    // 2. Call Python OCR service
    const ocrResult = await pythonOCRService.processDocument(file.path, {
      language: req.body.language || 'vie',
      options: JSON.parse(req.body.options || '{}')
    });
    
    // 3. Save to database
    const document = await storage.createDocument({
      ...file,
      extractedText: ocrResult.text,
      confidence: ocrResult.confidence,
      processingStatus: 'completed'
    });
    
    // 4. Return result
    res.json({
      document,
      ocrResult,
      message: 'OCR processing completed successfully'
    });
    
  } catch (error) {
    errorHandler.handleOCRError(error, res);
  }
}
```

### Step 3: Python OCR Service Integration

## 🐍 Python OCR Microservice Implementation

### Option A: FastAPI Microservice (Recommended)

```python
# python-ocr/app/main.py
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from .services.ocr_processor import VietnameseOCRProcessor
from .models.response import OCRResponse

app = FastAPI(title="Vietnamese OCR Service", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000"],  # Your Express server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ocr_processor = VietnameseOCRProcessor()

@app.post("/process-pdf", response_model=OCRResponse)
async def process_pdf(
    file: UploadFile = File(...),
    language: str = "vie",
    confidence_threshold: float = 0.7
):
    """Process PDF file and extract Vietnamese text using OCR"""
    try:
        # Validate file type
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are supported")
        
        # Process the file
        result = await ocr_processor.process_pdf(
            file=file,
            language=language,
            confidence_threshold=confidence_threshold
        )
        
        return OCRResponse(
            success=True,
            text=result['text'],
            confidence=result['confidence'],
            page_count=result['page_count'],
            processing_time=result['processing_time'],
            metadata=result['metadata']
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "Vietnamese OCR Service"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
```

### Option B: Command Line Integration

```typescript
// server/services/python-ocr.service.ts
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export class PythonOCRService {
  private pythonPath: string;
  private scriptPath: string;

  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python';
    this.scriptPath = path.join(process.cwd(), 'python-ocr', 'vietnamese_pdf_ocr.py');
  }

  async processDocument(
    filePath: string, 
    options: { language?: string; confidence_threshold?: number } = {}
  ): Promise<OCRResult> {
    return new Promise((resolve, reject) => {
      const args = [
        this.scriptPath,
        '--input', filePath,
        '--language', options.language || 'vie',
        '--confidence', (options.confidence_threshold || 0.7).toString(),
        '--format', 'json'
      ];

      const pythonProcess = spawn(this.pythonPath, args);
      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            resolve(result);
          } catch (error) {
            reject(new Error(`Failed to parse OCR result: ${error.message}`));
          }
        } else {
          reject(new Error(`OCR process failed with code ${code}: ${errorOutput}`));
        }
      });

      // Set timeout for long-running processes
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('OCR process timeout'));
      }, 120000); // 2 minutes timeout
    });
  }
}
```

## 📡 API Communication Layer

### Express to Python OCR Service

```typescript
// server/services/ocr.service.ts
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

export class OCRService {
  private pythonServiceUrl: string;

  constructor() {
    this.pythonServiceUrl = process.env.PYTHON_OCR_URL || 'http://localhost:8001';
  }

  async processViaPythonAPI(filePath: string, options: any): Promise<OCRResult> {
    try {
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      formData.append('language', options.language || 'vie');
      formData.append('confidence_threshold', options.confidence_threshold || 0.7);

      const response = await axios.post(
        `${this.pythonServiceUrl}/process-pdf`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${process.env.OCR_SERVICE_TOKEN}`
          },
          timeout: 120000 // 2 minutes
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(`Python OCR service error: ${error.message}`);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.pythonServiceUrl}/health`);
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
```

## 🔒 Security Considerations

### File Upload Security

```typescript
// server/middleware/upload.middleware.ts
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'uploads', 'temp'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req: any, file: any, cb: any) => {
  // Only allow PDF files
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

export const uploadPDF = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 1
  }
});
```

### Inter-service Authentication

```typescript
// server/middleware/security.middleware.ts
export function validateOCRServiceToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || token !== process.env.OCR_SERVICE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized OCR service access' });
  }
  
  next();
}
```

## ⚠️ Error Handling Strategy

```typescript
// server/utils/error-handler.ts
export class OCRErrorHandler {
  static handleOCRError(error: Error, res: Response) {
    console.error('OCR Error:', error);

    if (error.message.includes('timeout')) {
      return res.status(408).json({
        error: 'OCR_TIMEOUT',
        message: 'OCR processing timed out. Please try with a smaller file.',
        code: 'OCR_TIMEOUT'
      });
    }

    if (error.message.includes('language not supported')) {
      return res.status(400).json({
        error: 'LANGUAGE_NOT_SUPPORTED',
        message: 'The specified language is not supported.',
        code: 'LANG_ERROR'
      });
    }

    if (error.message.includes('file not found')) {
      return res.status(404).json({
        error: 'FILE_NOT_FOUND',
        message: 'The uploaded file could not be found.',
        code: 'FILE_ERROR'
      });
    }

    // Generic OCR error
    return res.status(500).json({
      error: 'OCR_PROCESSING_FAILED',
      message: 'OCR processing failed. Please try again.',
      code: 'OCR_ERROR'
    });
  }
}
```

## 🚀 Deployment Configuration

### Docker Compose for Multi-Service Setup

```yaml
# docker-compose.yml
version: '3.8'

services:
  web:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PYTHON_OCR_URL=http://python-ocr:8001
      - OCR_SERVICE_TOKEN=${OCR_SERVICE_TOKEN}
    volumes:
      - ./uploads:/app/uploads
    depends_on:
      - python-ocr
      - postgres

  python-ocr:
    build: ./python-ocr
    ports:
      - "8001:8001"
    environment:
      - TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
    volumes:
      - ./uploads:/app/uploads

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=secure_ocr
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

This architecture provides:
- ✅ Clean separation of concerns
- ✅ Scalable microservice architecture
- ✅ Robust error handling
- ✅ Security best practices
- ✅ Easy deployment and monitoring
- ✅ Support for both REST API and command-line integration
