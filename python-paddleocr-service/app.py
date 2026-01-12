#!/usr/bin/env python3
"""
PaddleOCR Hybrid Service - Production Ready
High-accuracy Vietnamese OCR with advanced preprocessing
Target: 95-99% accuracy
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR
import cv2
import numpy as np
import tempfile
import os
import logging
from typing import Dict, List, Any
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="PaddleOCR Hybrid Service",
    description="High-accuracy Vietnamese OCR with deep learning - Target 95-99%",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize PaddleOCR
logger.info("🚀 Initializing PaddleOCR...")
try:
    ocr_engine = PaddleOCR(
        use_angle_cls=True,      # Text direction detection
        lang='vi',               # Vietnamese
        use_gpu=False,           # CPU mode (set True if GPU available)
        show_log=False,
        det_db_thresh=0.3,       # Detection threshold
        det_db_box_thresh=0.5,   # Box threshold
        rec_batch_num=6,         # Batch processing
        use_space_char=True      # Recognize spaces
    )
    logger.info("✅ PaddleOCR initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize PaddleOCR: {e}")
    ocr_engine = None


class AdvancedPreprocessor:
    """Advanced image preprocessing for maximum accuracy"""
    
    @staticmethod
    def deskew(image: np.ndarray) -> np.ndarray:
        """Deskew image to correct rotation"""
        try:
            coords = np.column_stack(np.where(image > 0))
            if len(coords) == 0:
                return image
                
            angle = cv2.minAreaRect(coords)[-1]
            
            if angle < -45:
                angle = -(90 + angle)
            else:
                angle = -angle
                
            if abs(angle) > 0.5:  # Only deskew if needed
                (h, w) = image.shape[:2]
                center = (w // 2, h // 2)
                M = cv2.getRotationMatrix2D(center, angle, 1.0)
                image = cv2.warpAffine(
                    image, M, (w, h),
                    flags=cv2.INTER_CUBIC,
                    borderMode=cv2.BORDER_REPLICATE
                )
        except Exception as e:
            logger.warning(f"Deskew failed: {e}")
        
        return image
    
    @staticmethod
    def denoise(image: np.ndarray) -> np.ndarray:
        """Advanced denoising"""
        try:
            return cv2.fastNlMeansDenoising(image, None, 10, 7, 21)
        except:
            return image
    
    @staticmethod
    def enhance_contrast(image: np.ndarray) -> np.ndarray:
        """CLAHE contrast enhancement"""
        try:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            return clahe.apply(image)
        except:
            return image
    
    @staticmethod
    def adaptive_threshold(image: np.ndarray) -> np.ndarray:
        """Adaptive binarization"""
        try:
            return cv2.adaptiveThreshold(
                image, 255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY,
                11, 2
            )
        except:
            return image
    
    @classmethod
    def preprocess(cls, image_path: str) -> List[str]:
        """
        Create multiple preprocessed versions for ensemble
        Returns list of preprocessed image paths
        """
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        preprocessed_images = []
        base_path = image_path.replace('.png', '').replace('.jpg', '').replace('.jpeg', '')
        
        # Version 1: Deskew + Denoise + CLAHE (Best for scanned documents)
        v1 = cls.deskew(gray.copy())
        v1 = cls.denoise(v1)
        v1 = cls.enhance_contrast(v1)
        path1 = f"{base_path}_v1.png"
        cv2.imwrite(path1, v1)
        preprocessed_images.append(path1)
        
        # Version 2: Denoise + CLAHE + Adaptive Threshold (Best for receipts)
        v2 = cls.denoise(gray.copy())
        v2 = cls.enhance_contrast(v2)
        v2 = cls.adaptive_threshold(v2)
        path2 = f"{base_path}_v2.png"
        cv2.imwrite(path2, v2)
        preprocessed_images.append(path2)
        
        # Version 3: CLAHE only (Simple but effective)
        v3 = cls.enhance_contrast(gray.copy())
        path3 = f"{base_path}_v3.png"
        cv2.imwrite(path3, v3)
        preprocessed_images.append(path3)
        
        logger.info(f"✅ Created {len(preprocessed_images)} preprocessed versions")
        return preprocessed_images


def extract_text_with_confidence(image_path: str) -> Dict[str, Any]:
    """
    Extract text with multiple preprocessing approaches
    Returns best result based on confidence
    """
    if ocr_engine is None:
        raise RuntimeError("OCR engine not initialized")
    
    try:
        # Create multiple preprocessed versions
        preprocessed_paths = AdvancedPreprocessor.preprocess(image_path)
        
        best_result = None
        best_confidence = 0
        best_method = ""
        
        # Try each preprocessed version
        for idx, prep_path in enumerate(preprocessed_paths):
            try:
                logger.info(f"🔍 Processing version {idx+1}/{len(preprocessed_paths)}...")
                result = ocr_engine.ocr(prep_path, cls=True)
                
                if not result or not result[0]:
                    logger.warning(f"No text detected in version {idx+1}")
                    continue
                
                # Extract text and confidence
                texts = []
                confidences = []
                bboxes = []
                
                for line in result[0]:
                    bbox = line[0]
                    text = line[1][0]
                    conf = line[1][1]
                    
                    texts.append(text)
                    confidences.append(conf * 100)
                    bboxes.append(bbox)
                
                avg_confidence = np.mean(confidences) if confidences else 0
                
                logger.info(f"Version {idx+1}: {len(texts)} lines, {avg_confidence:.1f}% confidence")
                
                # Keep best result
                if avg_confidence > best_confidence:
                    best_confidence = avg_confidence
                    best_result = {
                        'text': '\n'.join(texts),
                        'confidence': avg_confidence,
                        'bounding_boxes': bboxes,
                        'line_count': len(texts),
                        'method': f'paddleocr_v{idx+1}'
                    }
                    best_method = f"preprocessing_v{idx+1}"
                
            except Exception as e:
                logger.warning(f"Preprocessing version {idx+1} failed: {e}")
                continue
            finally:
                # Cleanup preprocessed file
                try:
                    os.unlink(prep_path)
                except:
                    pass
        
        if best_result:
            best_result['preprocessing_method'] = best_method
            logger.info(f"✅ Best result: {best_method} with {best_confidence:.1f}% confidence")
            return best_result
        else:
            logger.warning("⚠️ No valid OCR results from any preprocessing version")
            return {
                'text': '',
                'confidence': 0,
                'bounding_boxes': [],
                'line_count': 0,
                'method': 'paddleocr_no_result',
                'preprocessing_method': 'none'
            }
            
    except Exception as e:
        logger.error(f"❌ OCR processing failed: {e}")
        raise


@app.post("/paddle-ocr")
async def process_ocr(file: UploadFile = File(...)):
    """
    Process document with PaddleOCR
    Returns high-accuracy OCR results (target 90-95%)
    """
    start_time = datetime.now()
    
    logger.info(f"📄 Received file: {file.filename}")
    
    # Save uploaded file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        # Extract text with advanced preprocessing
        result = extract_text_with_confidence(tmp_path)
        
        processing_time = (datetime.now() - start_time).total_seconds()
        
        logger.info(f"✨ Processing completed in {processing_time:.2f}s")
        
        return {
            "success": True,
            "text": result['text'],
            "confidence": result['confidence'],
            "bounding_boxes": result['bounding_boxes'],
            "line_count": result['line_count'],
            "method": "paddleocr_deep_learning",
            "preprocessing": result.get('preprocessing_method', 'unknown'),
            "processing_time": processing_time,
            "timestamp": datetime.now().isoformat(),
            "file_size": len(content)
        }
        
    except Exception as e:
        logger.error(f"❌ Processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    finally:
        # Cleanup
        try:
            os.unlink(tmp_path)
        except:
            pass


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if ocr_engine else "degraded",
        "engine": "PaddleOCR",
        "version": "2.7.0",
        "language": "Vietnamese",
        "preprocessing": "Advanced Multi-version (3 approaches)",
        "target_accuracy": "90-95%",
        "ocr_initialized": ocr_engine is not None
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "PaddleOCR Hybrid Service",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "ocr": "/paddle-ocr",
            "health": "/health",
            "docs": "/docs"
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    logger.info("=" * 60)
    logger.info("🚀 Starting PaddleOCR Hybrid Service")
    logger.info("=" * 60)
    logger.info("📍 Host: 0.0.0.0")
    logger.info("📍 Port: 8002")
    logger.info("📍 Target Accuracy: 90-95% (Hybrid: 95-99%)")
    logger.info("=" * 60)
    
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8002,
        reload=False,
        log_level="info"
    )
