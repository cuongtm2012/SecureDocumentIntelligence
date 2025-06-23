#!/usr/bin/env python3
"""
Mock OCR Service for Testing Integration
When Tesseract is not available, this provides a mock service for testing

Author: SecureDocumentIntelligence Team  
Date: 2025-06-23
"""

import os
import sys
import json
import time
from pathlib import Path
from typing import Dict, Any
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# Mock OCR responses
MOCK_RESPONSES = {
    'vietnamese': {
        'text': '''CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Độc lập - Tự do - Hạnh phúc

GIẤY CHỨNG NHẬN ĐĂNG KÝ KINH DOANH

Số: 0123456789
Cấp lần đầu ngày: 15 tháng 06 năm 2023

1. Tên doanh nghiệp: CÔNG TY TNHH ABC
2. Địa chỉ trụ sở chính: 123 Đường Nguyễn Văn A, Phường 1, Quận 1, TP.HCM
3. Mã số thuế: 0123456789
4. Người đại diện pháp luật: Nguyễn Văn A
5. Ngành nghề kinh doanh: Kinh doanh thương mại điện tử

Giấy chứng nhận này có giá trị kể từ ngày cấp.''',
        'confidence': 87.5,
        'page_count': 1,
        'language': 'vie'
    },
    'english': {
        'text': '''CERTIFICATE OF BUSINESS REGISTRATION

Registration No: 0123456789
Date of first issuance: June 15, 2023

1. Enterprise name: ABC COMPANY LIMITED
2. Head office address: 123 Nguyen Van A Street, Ward 1, District 1, HCMC
3. Tax code: 0123456789  
4. Legal representative: Nguyen Van A
5. Business lines: E-commerce trading

This certificate is valid from the date of issuance.''',
        'confidence': 92.3,
        'page_count': 1,
        'language': 'eng'
    }
}

app = FastAPI(
    title="Mock Vietnamese OCR Service",
    description="Mock OCR service for testing when Tesseract is not available",
    version="1.0.0-mock"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class OCRResponse(BaseModel):
    success: bool
    file_id: str
    text: str
    confidence: float
    page_count: int
    processing_time: float
    metadata: Dict[str, Any]

@app.get("/health")
async def health_check():
    """Mock health check endpoint"""
    return {
        "status": "healthy",
        "service": "Mock Vietnamese OCR Service",
        "timestamp": time.time(),
        "tesseract_version": "5.3.0 (mock)",
        "note": "This is a mock service for testing. Install Tesseract for real OCR."
    }

@app.post("/ocr/process", response_model=OCRResponse)
async def process_ocr(
    file: UploadFile = File(...),
    language: str = "vie",
    confidence_threshold: float = 60.0
):
    """Mock OCR processing endpoint"""
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    # Simulate processing time
    processing_start = time.time()
    import asyncio
    await asyncio.sleep(0.5)  # Simulate processing delay
    processing_time = time.time() - processing_start
    
    # Choose mock response based on language
    if language == 'vie':
        mock_data = MOCK_RESPONSES['vietnamese']
    else:
        mock_data = MOCK_RESPONSES['english']
    
    file_id = f"mock_{int(time.time())}_{file.filename}"
    
    return OCRResponse(
        success=True,
        file_id=file_id,
        text=mock_data['text'],
        confidence=mock_data['confidence'],
        page_count=mock_data['page_count'],
        processing_time=processing_time,
        metadata={
            'character_count': len(mock_data['text']),
            'word_count': len(mock_data['text'].split()),
            'language': language,
            'confidence_threshold': confidence_threshold,
            'processing_timestamp': time.time(),
            'file_size_bytes': len(await file.read()),
            'mock_service': True
        }
    )

@app.post("/ocr/batch")
async def batch_process_ocr(files: list[UploadFile] = File(...)):
    """Mock batch processing endpoint"""
    results = []
    
    for i, file in enumerate(files):
        # Simulate processing each file
        import asyncio
        await asyncio.sleep(0.2)
        
        mock_data = MOCK_RESPONSES['vietnamese'] if i % 2 == 0 else MOCK_RESPONSES['english']
        file_id = f"batch_mock_{int(time.time())}_file_{i+1}_{file.filename}"
        
        results.append({
            'success': True,
            'file_id': file_id,
            'text': mock_data['text'][:200] + f"... (file {i+1})",
            'confidence': mock_data['confidence'] - (i * 2),  # Slight variation
            'page_count': 1,
            'processing_time': 0.2
        })
    
    return {
        'job_id': f"batch_mock_{int(time.time())}",
        'status': 'completed',
        'results': results,
        'total_files': len(files),
        'successful_files': len(files),
        'failed_files': 0,
        'start_time': time.time() - len(files) * 0.2,
        'end_time': time.time()
    }

@app.get("/ocr/languages")
async def get_supported_languages():
    """Mock supported languages endpoint"""
    return {
        "languages": ["vie", "eng", "fra", "deu", "spa"],
        "recommended": ["vie", "eng"],
        "default": "vie",
        "note": "Mock service - all languages return sample text"
    }

if __name__ == "__main__":
    print("🧪 Starting Mock OCR Service for Testing")
    print("=========================================")
    print("This is a mock service that simulates OCR processing")
    print("when Tesseract is not installed.")
    print("")
    print("To install real OCR capabilities:")
    print("1. Install Tesseract OCR:")
    print("   - Windows: https://github.com/UB-Mannheim/tesseract/wiki")
    print("   - Add Tesseract to your PATH")
    print("2. Install Vietnamese language data:")
    print("   - Download vie.traineddata")
    print("   - Copy to Tesseract tessdata folder")
    print("")
    print("🌐 Mock service will run on http://localhost:8001")
    print("📊 Health check: http://localhost:8001/health")
    print("")
    
    uvicorn.run(
        "test-mock-service:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )