#!/usr/bin/env python3
"""
Tesseract OCR Microservice
Dedicated FastAPI service for advanced Tesseract OCR processing with Vietnamese language support

Author: SecureDocumentIntelligence Team
Date: 2025-06-27
Version: 2.0
"""

import os
import sys
import json
import asyncio
import logging
import subprocess
import tempfile
import shutil
from typing import List, Dict, Any, Optional
from pathlib import Path
import time
from datetime import datetime

# Web framework
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Image processing
import cv2
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('tesseract_service.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Pydantic models for API requests/responses
class OCRRequest(BaseModel):
    file_id: str
    language: str = "vie"  # Vietnamese by default
    use_preprocessing: bool = True
    confidence_threshold: float = 60.0
    psm_mode: int = 3

class OCRResponse(BaseModel):
    success: bool
    file_id: str
    text: str
    confidence: float
    processing_time: float
    processing_method: str
    preprocessing_applied: str
    metadata: Dict[str, Any]

class HealthResponse(BaseModel):
    status: str
    tesseract_available: bool
    opencv_available: bool
    service_version: str
    supported_languages: List[str]

# Global variables for service status
TESSERACT_AVAILABLE = False
OPENCV_AVAILABLE = False
SUPPORTED_LANGUAGES = []

def initialize_tesseract():
    """Initialize and verify Tesseract OCR"""
    global TESSERACT_AVAILABLE, SUPPORTED_LANGUAGES
    
    try:
        # Check if tesseract is available
        result = subprocess.run(['tesseract', '--version'], 
                              capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            TESSERACT_AVAILABLE = True
            logger.info(f"✅ Tesseract initialized: {result.stdout.strip().split()[1]}")
            
            # Get supported languages
            lang_result = subprocess.run(['tesseract', '--list-langs'], 
                                       capture_output=True, text=True, timeout=10)
            if lang_result.returncode == 0:
                langs = lang_result.stdout.strip().split('\n')[1:]  # Skip header
                SUPPORTED_LANGUAGES = [lang.strip() for lang in langs if lang.strip()]
                logger.info(f"📝 Supported languages: {len(SUPPORTED_LANGUAGES)} languages available")
            
        else:
            logger.error("❌ Tesseract not available")
            
    except Exception as e:
        logger.error(f"❌ Tesseract initialization failed: {e}")

def initialize_opencv():
    """Initialize OpenCV for image preprocessing"""
    global OPENCV_AVAILABLE
    
    try:
        # Test basic OpenCV functionality
        test_img = np.ones((100, 100, 3), dtype=np.uint8) * 255
        gray = cv2.cvtColor(test_img, cv2.COLOR_BGR2GRAY)
        OPENCV_AVAILABLE = True
        logger.info("✅ OpenCV initialized successfully")
        
    except Exception as e:
        logger.error(f"❌ OpenCV initialization failed: {e}")

def apply_preprocessing_approach(image: np.ndarray, approach: str) -> np.ndarray:
    """Apply specific preprocessing approach to image"""
    
    if approach == "original":
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    
    elif approach == "user_preprocessing":
        # User's exact approach: equalizeHist + GaussianBlur + THRESH_OTSU
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        gray = cv2.equalizeHist(gray)
        blur = cv2.GaussianBlur(gray, (3, 3), 0)
        _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return thresh
    
    elif approach == "simple_threshold":
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        return thresh
    
    elif approach == "adaptive":
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        return cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
    
    elif approach == "enhanced_contrast":
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        return cv2.equalizeHist(gray)
    
    elif approach == "morphological":
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        return cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)
    
    else:
        # Default to original
        return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image

async def process_with_tesseract_multi_approach(image_path: str, file_id: str, language: str = "vie") -> Dict[str, Any]:
    """Process image with multiple Tesseract approaches and return the best result"""
    
    if not TESSERACT_AVAILABLE:
        return {
            "success": False,
            "error": "Tesseract not available",
            "text": "",
            "confidence": 0
        }
    
    start_time = time.time()
    
    try:
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not load image: {image_path}")
        
        # Define preprocessing approaches to test
        approaches = [
            "original",
            "user_preprocessing",  # User's exact approach
            "simple_threshold",
            "adaptive", 
            "enhanced_contrast",
            "morphological"
        ]
        
        best_result = None
        best_score = 0
        best_approach = "none"
        
        # Test each preprocessing approach
        for approach in approaches:
            try:
                # Apply preprocessing
                processed_img = apply_preprocessing_approach(image, approach)
                
                # Save processed image
                temp_path = image_path.replace('.png', f'_{approach}.png')
                cv2.imwrite(temp_path, processed_img)
                
                # Try different PSM modes and languages
                for lang in [language, 'eng'] if language != 'eng' else ['eng']:
                    for psm in [3, 6, 7, 8]:
                        try:
                            cmd = ['tesseract', temp_path, 'stdout', '-l', lang, '--psm', str(psm)]
                            result = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
                            
                            if result.returncode == 0:
                                text = result.stdout.strip()
                                text_length = len(text)
                                
                                if text_length > best_score:
                                    confidence = min(95, 50 + text_length // 2)
                                    best_result = {
                                        "success": True,
                                        "text": text,
                                        "confidence": confidence,
                                        "method": f"tesseract_{approach}_{lang}_psm{psm}",
                                        "preprocessing": approach
                                    }
                                    best_score = text_length
                                    best_approach = approach
                                    
                                    # If we got good results, we can stop early
                                    if text_length > 100:
                                        break
                        
                        except (subprocess.TimeoutExpired, Exception):
                            continue
                    
                    if best_score > 100:  # Good enough result found
                        break
                
                # Clean up temp file
                try:
                    os.unlink(temp_path)
                except:
                    pass
                    
            except Exception as e:
                logger.warning(f"Failed preprocessing approach {approach}: {e}")
                continue
        
        processing_time = time.time() - start_time
        
        if best_result and best_score >= 2:
            best_result["processing_time"] = processing_time
            best_result["file_id"] = file_id
            logger.info(f"✅ Best result: {best_approach} approach, {best_score} chars extracted")
            return best_result
        else:
            return {
                "success": True,  # Return success but with empty text
                "text": "",
                "confidence": 0,
                "method": "tesseract_no_text_found",
                "preprocessing": "none",
                "processing_time": processing_time,
                "file_id": file_id
            }
    
    except Exception as e:
        processing_time = time.time() - start_time
        logger.error(f"❌ Multi-approach processing failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "text": "",
            "confidence": 0,
            "processing_time": processing_time,
            "file_id": file_id
        }

# Initialize FastAPI app
app = FastAPI(
    title="Tesseract OCR Microservice",
    description="Advanced Tesseract OCR processing with Vietnamese language support",
    version="2.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("🚀 Starting Tesseract OCR Microservice...")
    initialize_tesseract()
    initialize_opencv()
    logger.info(f"🎯 Service ready - Tesseract: {TESSERACT_AVAILABLE}, OpenCV: {OPENCV_AVAILABLE}")

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy" if TESSERACT_AVAILABLE else "degraded",
        tesseract_available=TESSERACT_AVAILABLE,
        opencv_available=OPENCV_AVAILABLE,
        service_version="2.0.0",
        supported_languages=SUPPORTED_LANGUAGES
    )

@app.post("/process-ocr", response_model=OCRResponse)
async def process_ocr(
    file: UploadFile = File(...),
    language: str = Form("vie"),
    confidence_threshold: float = Form(60.0),
    use_preprocessing: bool = Form(True)
):
    """
    Process uploaded image/PDF with advanced multi-approach Tesseract OCR
    """
    file_id = f"tesseract_{int(time.time())}"
    start_time = time.time()
    
    logger.info(f"📄 Processing OCR request: {file.filename} (language: {language})")
    
    # Create temporary file
    temp_dir = tempfile.mkdtemp()
    try:
        # Save uploaded file
        file_path = os.path.join(temp_dir, f"{file_id}.png")
        
        with open(file_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        logger.info(f"📁 Saved file to: {file_path}")
        
        # Process with multi-approach Tesseract
        result = await process_with_tesseract_multi_approach(file_path, file_id, language)
        
        processing_time = time.time() - start_time
        
        if result["success"]:
            return OCRResponse(
                success=True,
                file_id=file_id,
                text=result.get("text", ""),
                confidence=result.get("confidence", 0),
                processing_time=processing_time,
                processing_method=result.get("method", "tesseract_multi_approach"),
                preprocessing_applied=result.get("preprocessing", "multi_approach"),
                metadata={
                    "file_size": len(content),
                    "language": language,
                    "confidence_threshold": confidence_threshold,
                    "preprocessing_enabled": use_preprocessing,
                    "timestamp": datetime.now().isoformat(),
                    "approaches_tested": 6,
                    "psm_modes_tested": 4
                }
            )
        else:
            raise HTTPException(
                status_code=500, 
                detail=f"OCR processing failed: {result.get('error', 'Unknown error')}"
            )
    
    except Exception as e:
        logger.error(f"❌ Processing failed: {e}")
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")
    
    finally:
        # Cleanup
        try:
            shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"⚠️ Cleanup failed: {e}")

@app.get("/supported-languages")
async def get_supported_languages():
    """Get list of supported OCR languages"""
    return {
        "languages": SUPPORTED_LANGUAGES,
        "total": len(SUPPORTED_LANGUAGES),
        "vietnamese_supported": "vie" in SUPPORTED_LANGUAGES,
        "english_supported": "eng" in SUPPORTED_LANGUAGES
    }

if __name__ == "__main__":
    import uvicorn
    
    # Start the service
    logger.info("🚀 Starting Tesseract OCR Microservice on port 8001...")
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
        log_level="info"
    )