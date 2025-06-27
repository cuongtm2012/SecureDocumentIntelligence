#!/usr/bin/env python3
"""
OpenCV Image Processing Microservice
Dedicated FastAPI service for advanced image preprocessing and OCR

Author: SecureDocumentIntelligence Team
Date: 2025-06-27
"""

import os
import sys
import json
import time
import logging
from typing import Dict, Any, List, Optional, Tuple
from pathlib import Path
import asyncio
import tempfile
import uuid
import base64
from io import BytesIO

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
        logging.FileHandler('opencv_service.log')
    ]
)
logger = logging.getLogger(__name__)

# Pydantic models
class ImageProcessingRequest(BaseModel):
    file_id: str
    enhance_contrast: bool = True
    denoise: bool = True
    sharpen: bool = True
    binarize: bool = False
    deskew: bool = True
    resize_factor: float = 1.5

class ImageProcessingResponse(BaseModel):
    success: bool
    file_id: str
    processed_image_path: str
    processing_time: float
    processing_method: str
    enhancements_applied: List[str]
    image_stats: Dict[str, Any]
    metadata: Dict[str, Any]

class OCRRequest(BaseModel):
    file_id: str
    language: str = "vie"
    use_tesseract: bool = True
    confidence_threshold: float = 60.0
    psm_mode: int = 6

class OCRResponse(BaseModel):
    success: bool
    file_id: str
    text: str
    confidence: float
    processing_time: float
    processing_method: str
    metadata: Dict[str, Any]

class HealthResponse(BaseModel):
    status: str
    opencv_available: bool
    tesseract_available: bool
    service_version: str
    supported_features: List[str]

# Initialize FastAPI app
app = FastAPI(
    title="OpenCV Image Processing Service",
    description="Advanced image preprocessing and OCR with OpenCV",
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

# Global service state
opencv_available = False
tesseract_available = False

def initialize_opencv():
    """Initialize OpenCV with error handling"""
    global opencv_available
    
    try:
        import cv2
        import numpy as np
        logger.info("✅ OpenCV initialized successfully")
        opencv_available = True
        return True
        
    except ImportError as e:
        logger.warning(f"⚠️ OpenCV not available: {e}")
        opencv_available = False
        return False
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize OpenCV: {e}")
        opencv_available = False
        return False

def initialize_tesseract():
    """Initialize Tesseract with error handling"""
    global tesseract_available
    
    try:
        import pytesseract
        import subprocess
        
        # Test Tesseract installation
        result = subprocess.run(['tesseract', '--version'], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            logger.info("✅ Tesseract initialized successfully")
            tesseract_available = True
            return True
        else:
            logger.warning("⚠️ Tesseract command not found")
            tesseract_available = False
            return False
            
    except ImportError as e:
        logger.warning(f"⚠️ PyTesseract not available: {e}")
        tesseract_available = False
        return False
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize Tesseract: {e}")
        tesseract_available = False
        return False

def enhance_image_opencv(image_path: str, file_id: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """Advanced image enhancement using OpenCV"""
    if not opencv_available:
        return mock_opencv_processing(image_path, file_id, options)
    
    try:
        import cv2
        import numpy as np
        
        logger.info(f"Processing image {file_id} with OpenCV...")
        start_time = time.time()
        
        # Read image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not read image: {image_path}")
        
        original_shape = image.shape
        enhancements_applied = []
        
        # Convert to grayscale for processing
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        processed = gray.copy()
        
        # 1. Noise reduction
        if options.get('denoise', True):
            processed = cv2.fastNlMeansDenoising(processed)
            enhancements_applied.append("noise_reduction")
        
        # 2. Contrast enhancement
        if options.get('enhance_contrast', True):
            # CLAHE (Contrast Limited Adaptive Histogram Equalization)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            processed = clahe.apply(processed)
            enhancements_applied.append("contrast_enhancement")
        
        # 3. Deskewing
        if options.get('deskew', True):
            # Find text lines and calculate skew angle
            edges = cv2.Canny(processed, 50, 150, apertureSize=3)
            lines = cv2.HoughLines(edges, 1, np.pi/180, threshold=100)
            
            if lines is not None and len(lines) > 0:
                angles = []
                for rho, theta in lines[:min(10, len(lines))]:
                    angle = theta * 180 / np.pi - 90
                    if abs(angle) < 45:  # Only consider reasonable skew angles
                        angles.append(angle)
                
                if angles:
                    avg_angle = np.mean(angles)
                    if abs(avg_angle) > 0.5:  # Only correct if skew is significant
                        h, w = processed.shape
                        center = (w // 2, h // 2)
                        rotation_matrix = cv2.getRotationMatrix2D(center, avg_angle, 1.0)
                        processed = cv2.warpAffine(processed, rotation_matrix, (w, h), 
                                                 flags=cv2.INTER_CUBIC, 
                                                 borderMode=cv2.BORDER_REPLICATE)
                        enhancements_applied.append(f"deskew_{avg_angle:.2f}deg")
        
        # 4. Resize for better OCR
        resize_factor = options.get('resize_factor', 1.5)
        if resize_factor != 1.0:
            h, w = processed.shape
            new_w, new_h = int(w * resize_factor), int(h * resize_factor)
            processed = cv2.resize(processed, (new_w, new_h), interpolation=cv2.INTER_CUBIC)
            enhancements_applied.append(f"resize_{resize_factor}x")
        
        # 5. Sharpening
        if options.get('sharpen', True):
            kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
            processed = cv2.filter2D(processed, -1, kernel)
            enhancements_applied.append("sharpening")
        
        # 6. Binarization (optional)
        if options.get('binarize', False):
            _, processed = cv2.threshold(processed, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            enhancements_applied.append("binarization")
        
        # Save processed image
        output_path = image_path.replace('.', '_opencv_processed.')
        cv2.imwrite(output_path, processed)
        
        processing_time = time.time() - start_time
        
        # Calculate image statistics
        image_stats = {
            "original_size": f"{original_shape[1]}x{original_shape[0]}",
            "processed_size": f"{processed.shape[1]}x{processed.shape[0]}",
            "mean_intensity": float(np.mean(processed)),
            "std_intensity": float(np.std(processed)),
            "contrast_ratio": float(np.std(processed) / np.mean(processed)) if np.mean(processed) > 0 else 0
        }
        
        logger.info(f"✅ OpenCV processing completed for {file_id}: {len(enhancements_applied)} enhancements")
        
        return {
            "success": True,
            "processed_image_path": output_path,
            "processing_time": processing_time,
            "enhancements_applied": enhancements_applied,
            "image_stats": image_stats,
            "processing_method": "opencv-real"
        }
        
    except Exception as e:
        logger.error(f"❌ OpenCV processing failed for {file_id}: {e}")
        return {
            "success": False,
            "error": str(e),
            "processed_image_path": image_path,
            "processing_time": 0,
            "enhancements_applied": [],
            "image_stats": {},
            "processing_method": "opencv-error"
        }

def mock_opencv_processing(image_path: str, file_id: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """Mock OpenCV processing when OpenCV is not available"""
    logger.info(f"Using mock OpenCV processing for {file_id}")
    
    # Just copy the original file for mock processing
    output_path = image_path.replace('.', '_mock_processed.')
    try:
        import shutil
        shutil.copy2(image_path, output_path)
    except:
        output_path = image_path
    
    return {
        "success": True,
        "processed_image_path": output_path,
        "processing_time": 0.5,
        "enhancements_applied": ["mock_processing"],
        "image_stats": {
            "original_size": "unknown",
            "processed_size": "unknown",
            "mean_intensity": 128.0,
            "std_intensity": 64.0,
            "contrast_ratio": 0.5
        },
        "processing_method": "opencv-mock",
        "note": "Mock result - install OpenCV for real image processing"
    }

def run_tesseract_ocr(image_path: str, file_id: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """Run Tesseract OCR on processed image"""
    if not tesseract_available:
        return mock_tesseract_ocr(image_path, file_id, options)
    
    try:
        import pytesseract
        import subprocess
        
        logger.info(f"Running Tesseract OCR for {file_id}...")
        start_time = time.time()
        
        language = options.get('language', 'vie')
        psm_mode = options.get('psm_mode', 6)
        confidence_threshold = options.get('confidence_threshold', 60.0)
        
        # Build Tesseract command
        tesseract_config = f'--psm {psm_mode} -c preserve_interword_spaces=1'
        
        # Run Tesseract
        result = subprocess.run([
            'tesseract', image_path, 'stdout', 
            '-l', language,
            '--psm', str(psm_mode),
            '-c', 'preserve_interword_spaces=1'
        ], capture_output=True, text=True, timeout=30)
        
        if result.returncode == 0:
            text = result.stdout.strip()
            
            # Try to extract confidence from stderr
            confidence_match = None
            if result.stderr:
                import re
                confidence_match = re.search(r'Mean confidence: (\d+)', result.stderr)
            
            confidence = float(confidence_match.group(1)) if confidence_match else 85.0
            processing_time = time.time() - start_time
            
            logger.info(f"✅ Tesseract OCR completed for {file_id}: {confidence}% confidence")
            
            return {
                "success": True,
                "text": text,
                "confidence": confidence,
                "processing_time": processing_time,
                "processing_method": "tesseract-real"
            }
        else:
            raise Exception(f"Tesseract failed: {result.stderr}")
            
    except Exception as e:
        logger.error(f"❌ Tesseract OCR failed for {file_id}: {e}")
        return {
            "success": False,
            "error": str(e),
            "text": "",
            "confidence": 0,
            "processing_time": 0,
            "processing_method": "tesseract-error"
        }

def mock_tesseract_ocr(image_path: str, file_id: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """Mock Tesseract OCR when not available"""
    logger.info(f"Using mock Tesseract OCR for {file_id}")
    
    return {
        "success": True,
        "text": "Vietnamese document text extracted with OpenCV preprocessing\nTesseract OCR processing completed\nEnhanced text recognition accuracy",
        "confidence": 88.5,
        "processing_time": 1.2,
        "processing_method": "tesseract-mock",
        "note": "Mock result - install Tesseract for real OCR"
    }

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("🚀 Starting OpenCV Image Processing Service...")
    initialize_opencv()
    initialize_tesseract()

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    features = []
    if opencv_available:
        features.extend(["image_enhancement", "noise_reduction", "deskewing", "contrast_adjustment"])
    if tesseract_available:
        features.append("ocr_processing")
    if not features:
        features.append("mock_processing")
    
    return HealthResponse(
        status="healthy",
        opencv_available=opencv_available,
        tesseract_available=tesseract_available,
        service_version="1.0.0",
        supported_features=features
    )

@app.post("/process-image", response_model=ImageProcessingResponse)
async def process_image(
    file: UploadFile = File(...),
    enhance_contrast: bool = Form(True),
    denoise: bool = Form(True),
    sharpen: bool = Form(True),
    binarize: bool = Form(False),
    deskew: bool = Form(True),
    resize_factor: float = Form(1.5)
):
    """
    Process uploaded image with OpenCV enhancements
    """
    start_time = time.time()
    file_id = str(uuid.uuid4())
    
    logger.info(f"Received image processing request: {file.filename} (ID: {file_id})")
    
    try:
        # Save uploaded file to temporary location
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # Process with OpenCV
        options = {
            "enhance_contrast": enhance_contrast,
            "denoise": denoise,
            "sharpen": sharpen,
            "binarize": binarize,
            "deskew": deskew,
            "resize_factor": resize_factor
        }
        
        result = enhance_image_opencv(temp_file_path, file_id, options)
        
        # Clean up original temporary file
        os.unlink(temp_file_path)
        
        # Prepare response
        total_processing_time = time.time() - start_time
        
        return ImageProcessingResponse(
            success=result["success"],
            file_id=file_id,
            processed_image_path=result["processed_image_path"],
            processing_time=total_processing_time,
            processing_method=result["processing_method"],
            enhancements_applied=result["enhancements_applied"],
            image_stats=result["image_stats"],
            metadata={
                "original_filename": file.filename,
                "file_size": len(content),
                "options": options,
                "note": result.get("note", "")
            }
        )
        
    except Exception as e:
        logger.error(f"❌ Image processing failed for {file_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")

@app.post("/ocr", response_model=OCRResponse)
async def process_ocr(
    file: UploadFile = File(...),
    language: str = Form("vie"),
    confidence_threshold: float = Form(60.0),
    psm_mode: int = Form(6),
    preprocess: bool = Form(True)
):
    """
    Process uploaded image with OCR (with optional OpenCV preprocessing)
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
        
        processed_image_path = temp_file_path
        
        # Apply OpenCV preprocessing if requested
        if preprocess:
            options = {
                "enhance_contrast": True,
                "denoise": True,
                "sharpen": True,
                "binarize": False,
                "deskew": True,
                "resize_factor": 1.5
            }
            
            preprocessing_result = enhance_image_opencv(temp_file_path, file_id, options)
            if preprocessing_result["success"]:
                processed_image_path = preprocessing_result["processed_image_path"]
        
        # Run OCR on processed image
        ocr_options = {
            "language": language,
            "confidence_threshold": confidence_threshold,
            "psm_mode": psm_mode
        }
        
        ocr_result = run_tesseract_ocr(processed_image_path, file_id, ocr_options)
        
        # Clean up temporary files
        os.unlink(temp_file_path)
        if processed_image_path != temp_file_path:
            try:
                os.unlink(processed_image_path)
            except:
                pass
        
        # Prepare response
        total_processing_time = time.time() - start_time
        
        return OCRResponse(
            success=ocr_result["success"],
            file_id=file_id,
            text=ocr_result.get("text", ""),
            confidence=ocr_result.get("confidence", 0),
            processing_time=total_processing_time,
            processing_method=ocr_result["processing_method"],
            metadata={
                "original_filename": file.filename,
                "file_size": len(content),
                "language": language,
                "psm_mode": psm_mode,
                "preprocessing_applied": preprocess,
                "note": ocr_result.get("note", "")
            }
        )
        
    except Exception as e:
        logger.error(f"❌ OCR processing failed for {file_id}: {e}")
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

@app.get("/supported-languages")
async def get_supported_languages():
    """Get list of supported OCR languages"""
    if tesseract_available:
        return {
            "languages": ["vie", "eng", "chi_sim", "chi_tra"],
            "default": "vie",
            "note": "Tesseract OCR with Vietnamese language support"
        }
    else:
        return {
            "languages": ["mock"],
            "default": "mock",
            "note": "Tesseract not available - using mock responses"
        }

if __name__ == "__main__":
    # Run the service
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8003,
        reload=False,
        log_level="info"
    )