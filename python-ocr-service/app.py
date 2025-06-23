#!/usr/bin/env python3
"""
Python OCR Microservice for SecureDocumentIntelligence
FastAPI-based service for Vietnamese PDF OCR processing

Author: SecureDocumentIntelligence Team
Date: 2025-01-21
"""

import os
import io
import sys
import logging
import tempfile
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime
import json
import base64

# FastAPI and async libraries
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# OCR libraries
from PIL import Image
import pytesseract
from pdf2image import convert_from_path
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('ocr_service.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="Vietnamese OCR Service",
    description="Professional OCR service for Vietnamese PDF documents",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class OCRRequest(BaseModel):
    file_id: str
    language: str = "vie"
    confidence_threshold: float = 60.0
    psm_mode: int = 6

class OCRResponse(BaseModel):
    success: bool
    file_id: str
    text: str
    confidence: float
    page_count: int
    processing_time: float
    metadata: Dict[str, Any]

class BatchOCRRequest(BaseModel):
    file_ids: List[str]
    language: str = "vie"
    confidence_threshold: float = 60.0

# Global OCR processor instance
class VietnameseOCRService:
    """
    Professional OCR service for Vietnamese documents with FastAPI integration
    """
    
    def __init__(self):
        self.tesseract_config = r'--oem 3 --psm 6 -l vie'
        self.temp_dir = Path(tempfile.gettempdir()) / "ocr_service"
        self.temp_dir.mkdir(exist_ok=True)
        self._verify_tesseract_installation()
    
    def _verify_tesseract_installation(self) -> None:
        """Verify Tesseract installation and Vietnamese language support"""
        try:
            version = pytesseract.get_tesseract_version()
            languages = pytesseract.get_languages(config='')
            
            logger.info(f"Tesseract version: {version}")
            logger.info(f"Available languages: {languages}")
            
            if 'vie' not in languages:
                logger.error("Vietnamese language data not found!")
                raise SystemError("Vietnamese OCR language pack not installed")
            
            logger.info("✅ Vietnamese OCR service ready")
            
        except Exception as e:
            logger.error(f"Tesseract verification failed: {e}")
            raise SystemError(f"OCR service initialization failed: {e}")
    
    async def process_pdf_file(self, file_content: bytes, file_id: str, 
                              language: str = "vie", confidence_threshold: float = 60.0) -> OCRResponse:
        """
        Process PDF file and extract text using OCR
        
        Args:
            file_content: PDF file content as bytes
            file_id: Unique identifier for the file
            language: OCR language (default: Vietnamese)
            confidence_threshold: Minimum confidence score
            
        Returns:
            OCRResponse with extracted text and metadata
        """
        start_time = datetime.now()
        temp_pdf_path = None
        
        try:
            # Save uploaded file to temporary location
            temp_pdf_path = self.temp_dir / f"{file_id}.pdf"
            with open(temp_pdf_path, 'wb') as f:
                f.write(file_content)
            
            # Convert PDF to images
            logger.info(f"Converting PDF {file_id} to images...")
            images = convert_from_path(str(temp_pdf_path), dpi=300)
            
            # Process each page with OCR
            all_text = []
            total_confidence = 0
            page_count = len(images)
            
            for i, image in enumerate(images):
                logger.info(f"Processing page {i+1}/{page_count} for {file_id}")
                
                # Get OCR data with confidence scores
                ocr_data = pytesseract.image_to_data(
                    image, 
                    config=f'--oem 3 --psm 6 -l {language}',
                    output_type=pytesseract.Output.DICT
                )
                
                # Extract text with confidence filtering
                page_text = []
                page_confidences = []
                
                for j, confidence in enumerate(ocr_data['conf']):
                    if int(confidence) > confidence_threshold:
                        text = ocr_data['text'][j].strip()
                        if text:
                            page_text.append(text)
                            page_confidences.append(int(confidence))
                
                if page_text:
                    all_text.append(' '.join(page_text))
                    total_confidence += sum(page_confidences) / len(page_confidences)
            
            # Calculate processing metrics
            processing_time = (datetime.now() - start_time).total_seconds()
            avg_confidence = total_confidence / page_count if page_count > 0 else 0
            extracted_text = '\n\n'.join(all_text)
            
            # Prepare metadata
            metadata = {
                'page_count': page_count,
                'character_count': len(extracted_text),
                'word_count': len(extracted_text.split()),
                'language': language,
                'confidence_threshold': confidence_threshold,
                'processing_timestamp': datetime.now().isoformat(),
                'file_size_bytes': len(file_content)
            }
            
            logger.info(f"✅ OCR completed for {file_id}: {len(extracted_text)} chars, {avg_confidence:.1f}% confidence")
            
            return OCRResponse(
                success=True,
                file_id=file_id,
                text=extracted_text,
                confidence=avg_confidence,
                page_count=page_count,
                processing_time=processing_time,
                metadata=metadata
            )
            
        except Exception as e:
            logger.error(f"OCR processing failed for {file_id}: {e}")
            return OCRResponse(
                success=False,
                file_id=file_id,
                text="",
                confidence=0.0,
                page_count=0,
                processing_time=(datetime.now() - start_time).total_seconds(),
                metadata={"error": str(e)}
            )
        
        finally:
            # Clean up temporary files
            if temp_pdf_path and temp_pdf_path.exists():
                temp_pdf_path.unlink()

# Initialize OCR service
ocr_service = VietnameseOCRService()

# API Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Vietnamese OCR Service",
        "timestamp": datetime.now().isoformat(),
        "tesseract_version": str(pytesseract.get_tesseract_version())
    }

@app.post("/ocr/process", response_model=OCRResponse)
async def process_ocr(
    file: UploadFile = File(...),
    language: str = "vie",
    confidence_threshold: float = 60.0
):
    """
    Process a single PDF file with OCR
    
    Args:
        file: PDF file to process
        language: OCR language (default: Vietnamese)
        confidence_threshold: Minimum confidence score
        
    Returns:
        OCR results with extracted text and metadata
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    try:
        # Read file content
        file_content = await file.read()
        file_id = f"ocr_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        
        # Process OCR
        result = await ocr_service.process_pdf_file(
            file_content=file_content,
            file_id=file_id,
            language=language,
            confidence_threshold=confidence_threshold
        )
        
        return result
        
    except Exception as e:
        logger.error(f"OCR endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

@app.post("/ocr/batch")
async def batch_process_ocr(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    language: str = "vie",
    confidence_threshold: float = 60.0
):
    """
    Process multiple PDF files with OCR in batch
    
    Args:
        files: List of PDF files to process
        language: OCR language (default: Vietnamese)
        confidence_threshold: Minimum confidence score
        
    Returns:
        Batch processing job ID and status
    """
    job_id = f"batch_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    
    # Validate files
    for file in files:
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(
                status_code=400, 
                detail=f"File {file.filename} is not a PDF"
            )
    
    # Start background processing
    background_tasks.add_task(
        process_batch_files,
        files=files,
        job_id=job_id,
        language=language,
        confidence_threshold=confidence_threshold
    )
    
    return {
        "job_id": job_id,
        "status": "processing",
        "file_count": len(files),
        "message": f"Batch OCR processing started for {len(files)} files"
    }

async def process_batch_files(files: List[UploadFile], job_id: str, 
                            language: str, confidence_threshold: float):
    """Background task for batch processing"""
    results = []
    
    for i, file in enumerate(files):
        try:
            file_content = await file.read()
            file_id = f"{job_id}_file_{i+1}_{file.filename}"
            
            result = await ocr_service.process_pdf_file(
                file_content=file_content,
                file_id=file_id,
                language=language,
                confidence_threshold=confidence_threshold
            )
            
            results.append(result.dict())
            logger.info(f"Batch job {job_id}: Completed {i+1}/{len(files)} files")
            
        except Exception as e:
            logger.error(f"Batch processing error for {file.filename}: {e}")
            results.append({
                "success": False,
                "file_id": file.filename,
                "error": str(e)
            })
    
    # Save results (in production, save to database or cache)
    results_file = Path(f"batch_results_{job_id}.json")
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    logger.info(f"✅ Batch job {job_id} completed: {len(results)} files processed")

@app.get("/ocr/languages")
async def get_supported_languages():
    """Get list of supported OCR languages"""
    try:
        languages = pytesseract.get_languages(config='')
        return {
            "languages": list(languages),
            "recommended": ["vie", "eng"],
            "default": "vie"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get languages: {str(e)}")

if __name__ == "__main__":
    # Run the service
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )
