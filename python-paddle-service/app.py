#!/usr/bin/env python3
"""
PaddleOCR Microservice
Dedicated FastAPI service for PaddleOCR processing

Author: SecureDocumentIntelligence Team
Date: 2025-06-27
"""

import os
import sys
import json
import time
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path
import asyncio
import tempfile
import uuid

# FastAPI and Pydantic imports
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('paddle_ocr_service.log')
    ]
)
logger = logging.getLogger(__name__)

# Pydantic models
class OCRRequest(BaseModel):
    file_id: str
    language: str = "ch"  # Chinese model works well for Vietnamese
    use_angle_cls: bool = True
    use_gpu: bool = False
    confidence_threshold: float = 0.6

class OCRResponse(BaseModel):
    success: bool
    file_id: str
    text: str
    confidence: float
    bounding_boxes: List[Dict[str, Any]]
    processing_time: float
    processing_method: str
    metadata: Dict[str, Any]

class HealthResponse(BaseModel):
    status: str
    paddle_ocr_available: bool
    service_version: str
    supported_languages: List[str]

# Initialize FastAPI app
app = FastAPI(
    title="PaddleOCR Microservice",
    description="Vietnamese Document OCR Processing with PaddleOCR",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global PaddleOCR instance
paddle_ocr = None
paddle_available = False

def initialize_paddle_ocr():
    """Initialize PaddleOCR with error handling"""
    global paddle_ocr, paddle_available
    
    try:
        from paddleocr import PaddleOCR
        import warnings
        warnings.filterwarnings("ignore")
        
        logger.info("Initializing PaddleOCR...")
        paddle_ocr = PaddleOCR(
            use_angle_cls=True, 
            lang='ch',  # Chinese model works well for Vietnamese
            use_gpu=False,
            show_log=False,
            drop_score=0.5
        )
        paddle_available = True
        logger.info("✅ PaddleOCR initialized successfully")
        
    except ImportError as e:
        logger.warning(f"⚠️ PaddleOCR not available: {e}")
        paddle_available = False
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize PaddleOCR: {e}")
        paddle_available = False

def mock_paddle_ocr_result(image_path: str, file_id: str) -> Dict[str, Any]:
    """Mock PaddleOCR result when real PaddleOCR is not available"""
    logger.info(f"Using mock PaddleOCR for {file_id}")
    
    return {
        "success": True,
        "text": "Vietnamese document text extracted with PaddleOCR\nMock processing completed successfully\nReady for DeepSeek API analysis",
        "confidence": 87.5,
        "bounding_boxes": [
            {
                "text": "Vietnamese document text extracted with PaddleOCR",
                "confidence": 89.2,
                "bbox": [[10, 10], [450, 10], [450, 35], [10, 35]]
            },
            {
                "text": "Mock processing completed successfully",
                "confidence": 85.8,
                "bbox": [[10, 50], [380, 50], [380, 75], [10, 75]]
            },
            {
                "text": "Ready for DeepSeek API analysis",
                "confidence": 87.5,
                "bbox": [[10, 90], [320, 90], [320, 115], [10, 115]]
            }
        ],
        "processing_method": "paddleocr-mock",
        "note": "Mock result - install PaddleOCR for real text extraction"
    }

async def process_with_paddle_ocr(image_path: str, file_id: str, use_angle_cls: bool = True) -> Dict[str, Any]:
    """Process image with PaddleOCR"""
    start_time = time.time()
    
    if not paddle_available or paddle_ocr is None:
        logger.warning("PaddleOCR not available, using mock result")
        return mock_paddle_ocr_result(image_path, file_id)
    
    try:
        logger.info(f"Processing {file_id} with PaddleOCR...")
        
        # Run PaddleOCR processing
        result = paddle_ocr.ocr(image_path, cls=use_angle_cls)
        
        # Extract text and bounding boxes
        texts = []
        confidences = []
        bounding_boxes = []
        
        if result and result[0]:
            for line in result[0]:
                if line and len(line) >= 2:
                    bbox = line[0]
                    text_info = line[1]
                    
                    text = text_info[0] if isinstance(text_info, tuple) else str(text_info)
                    confidence = text_info[1] if isinstance(text_info, tuple) and len(text_info) > 1 else 0.9
                    
                    texts.append(text)
                    confidences.append(confidence * 100)
                    bounding_boxes.append({
                        "text": text,
                        "confidence": confidence * 100,
                        "bbox": bbox
                    })
        
        final_text = "\n".join(texts)
        avg_confidence = sum(confidences) / len(confidences) if confidences else 0
        processing_time = time.time() - start_time
        
        logger.info(f"✅ PaddleOCR completed for {file_id}: {len(texts)} text blocks, {avg_confidence:.1f}% confidence")
        
        return {
            "success": True,
            "text": final_text,
            "confidence": avg_confidence,
            "bounding_boxes": bounding_boxes,
            "processing_method": "paddleocr-real",
            "processing_time": processing_time
        }
        
    except Exception as e:
        logger.error(f"❌ PaddleOCR processing failed for {file_id}: {e}")
        return {
            "success": False,
            "error": str(e),
            "text": "",
            "confidence": 0,
            "bounding_boxes": [],
            "processing_method": "paddleocr-error"
        }

@app.on_event("startup")
async def startup_event():
    """Initialize PaddleOCR on startup"""
    logger.info("🚀 Starting PaddleOCR Microservice...")
    initialize_paddle_ocr()

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        paddle_ocr_available=paddle_available,
        service_version="1.0.0",
        supported_languages=["ch", "en", "vi"] if paddle_available else ["mock"]
    )

@app.post("/paddle-ocr", response_model=OCRResponse)
async def process_ocr(
    file: UploadFile = File(...),
    language: str = Form("ch"),
    use_angle_cls: bool = Form(True),
    confidence_threshold: float = Form(0.6)
):
    """
    Process uploaded image/PDF with PaddleOCR
    """
    start_time = time.time()
    file_id = str(uuid.uuid4())
    
    logger.info(f"Received OCR request: {file.filename} (ID: {file_id})")
    
    try:
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # Process with PaddleOCR
        result = await process_with_paddle_ocr(temp_file_path, file_id, use_angle_cls)
        
        # Clean up temporary file
        os.unlink(temp_file_path)
        
        # Prepare response
        total_processing_time = time.time() - start_time
        
        return OCRResponse(
            success=result["success"],
            file_id=file_id,
            text=result.get("text", ""),
            confidence=result.get("confidence", 0),
            bounding_boxes=result.get("bounding_boxes", []),
            processing_time=total_processing_time,
            processing_method=result.get("processing_method", "unknown"),
            metadata={
                "original_filename": file.filename,
                "file_size": len(content),
                "language": language,
                "use_angle_cls": use_angle_cls,
                "confidence_threshold": confidence_threshold,
                "text_blocks_found": len(result.get("bounding_boxes", [])),
                "note": result.get("note", "")
            }
        )
        
    except Exception as e:
        logger.error(f"❌ OCR processing failed for {file_id}: {e}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

@app.get("/supported-languages")
async def get_supported_languages():
    """Get list of supported languages"""
    if paddle_available:
        return {
            "languages": ["ch", "en", "vi"],
            "default": "ch",
            "note": "Chinese model works well for Vietnamese text"
        }
    else:
        return {
            "languages": ["mock"],
            "default": "mock",
            "note": "PaddleOCR not available - using mock responses"
        }

if __name__ == "__main__":
    # Run the service
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8002,
        reload=False,
        log_level="info"
    )