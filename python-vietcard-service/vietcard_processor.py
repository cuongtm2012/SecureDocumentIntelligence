
#!/usr/bin/env python3
"""
VietOCR + Qdrant Processor
Advanced Vietnamese OCR with vector-based search using VietOCR and Qdrant

Author: SecureDocumentIntelligence Team
Date: 2025-01-27
"""

import sys
import json
import time
import logging
import uuid
from pathlib import Path
import cv2
import numpy as np
from typing import Dict, List, Any, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class VietOCRQdrantProcessor:
    """
    Advanced Vietnamese OCR processor with vector search capabilities
    """
    
    def __init__(self):
        self.viet_ocr = None
        self.qdrant_client = None
        self.sentence_model = None
        self.collection_name = "vietnamese_documents"
        self.initialize_models()
    
    def initialize_models(self):
        """Initialize VietOCR and Qdrant models"""
        try:
            # Initialize VietOCR
            from vietocr.tool.predictor import Predictor
            from vietocr.tool.config import Cfg
            
            config = Cfg.load_config_from_name('vgg_transformer')
            config['weights'] = 'https://drive.google.com/uc?id=13327Y1tz1ohsm5YZMyXVMPIOjoOA0OaA'
            config['cnn']['pretrained'] = False
            config['device'] = 'cpu'  # Use CPU for Replit compatibility
            config['predictor']['beamsearch'] = False
            
            self.viet_ocr = Predictor(config)
            logger.info("✅ VietOCR model initialized successfully")
            
            # Initialize Qdrant client
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams, PointStruct
            
            # Use in-memory Qdrant for simplicity (can be changed to server later)
            self.qdrant_client = QdrantClient(":memory:")
            
            # Create collection if it doesn't exist
            try:
                self.qdrant_client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(size=384, distance=Distance.COSINE)
                )
                logger.info("✅ Qdrant collection created")
            except Exception as e:
                logger.info(f"Qdrant collection already exists or error: {e}")
            
            # Initialize sentence transformer for embeddings
            from sentence_transformers import SentenceTransformer
            self.sentence_model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')
            logger.info("✅ Sentence transformer model initialized")
            
        except Exception as e:
            logger.error(f"Failed to initialize models: {e}")
            self.viet_ocr = None
            self.qdrant_client = None
            self.sentence_model = None
    
    def preprocess_image(self, image_path: str) -> np.ndarray:
        """
        Preprocess image for better OCR results
        """
        try:
            # Read image
            image = cv2.imread(image_path)
            if image is None:
                raise ValueError(f"Could not read image: {image_path}")
            
            # Convert to RGB
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # Apply preprocessing techniques
            # 1. Resize if too large
            height, width = image.shape[:2]
            if width > 2000 or height > 2000:
                scale = min(2000/width, 2000/height)
                new_width = int(width * scale)
                new_height = int(height * scale)
                image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_LANCZOS4)
            
            # 2. Convert to grayscale for processing
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            
            # 3. Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            enhanced = clahe.apply(gray)
            
            # 4. Noise reduction
            denoised = cv2.fastNlMeansDenoising(enhanced)
            
            # 5. Convert back to RGB
            processed = cv2.cvtColor(denoised, cv2.COLOR_GRAY2RGB)
            
            logger.info(f"Image preprocessed: {image.shape} -> {processed.shape}")
            return processed
            
        except Exception as e:
            logger.error(f"Image preprocessing failed: {e}")
            # Return original image if preprocessing fails
            image = cv2.imread(image_path)
            return cv2.cvtColor(image, cv2.COLOR_BGR2RGB) if image is not None else None
    
    def extract_text_regions(self, image: np.ndarray) -> List[Dict]:
        """
        Extract text regions from image using OpenCV
        """
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
            
            # Apply morphological operations to find text regions
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            
            # Gradient
            grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, kernel)
            
            # Binarize
            _, bw = cv2.threshold(grad, 0.0, 255.0, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
            
            # Connect horizontally oriented regions
            kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 1))
            connected = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, kernel)
            
            # Find contours
            contours, _ = cv2.findContours(connected.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            
            # Filter and sort contours
            text_regions = []
            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)
                # Filter by size
                if w > 20 and h > 8 and w * h > 200:
                    # Extract region
                    region = image[y:y+h, x:x+w]
                    text_regions.append({
                        'bbox': (x, y, w, h),
                        'region': region
                    })
            
            # Sort by position (top to bottom, left to right)
            text_regions.sort(key=lambda r: (r['bbox'][1], r['bbox'][0]))
            
            logger.info(f"Extracted {len(text_regions)} text regions")
            return text_regions
            
        except Exception as e:
            logger.error(f"Text region extraction failed: {e}")
            return [{'bbox': (0, 0, image.shape[1], image.shape[0]), 'region': image}]
    
    def process_with_vietocr(self, image_path: str) -> Dict[str, Any]:
        """
        Process image with VietOCR
        """
        start_time = time.time()
        
        try:
            if self.viet_ocr is None:
                return self.fallback_processing(image_path, start_time)
            
            logger.info(f"Processing with VietOCR: {image_path}")
            
            # Preprocess image
            processed_image = self.preprocess_image(image_path)
            if processed_image is None:
                raise ValueError("Failed to preprocess image")
            
            # Extract text regions
            text_regions = self.extract_text_regions(processed_image)
            
            # Process each region with VietOCR
            all_text = []
            region_results = []
            
            for i, region_data in enumerate(text_regions):
                try:
                    region = region_data['region']
                    bbox = region_data['bbox']
                    
                    # Convert to PIL Image for VietOCR
                    from PIL import Image
                    pil_image = Image.fromarray(region)
                    
                    # OCR with VietOCR
                    text = self.viet_ocr.predict(pil_image)
                    
                    if text and text.strip():
                        all_text.append(text.strip())
                        region_results.append({
                            'text': text.strip(),
                            'bbox': bbox,
                            'confidence': 0.9  # VietOCR doesn't provide confidence, estimate high
                        })
                        
                        logger.info(f"Region {i+1}: {text.strip()[:50]}...")
                
                except Exception as e:
                    logger.warning(f"Failed to process region {i+1}: {e}")
                    continue
            
            # Combine all text
            combined_text = '\n'.join(all_text)
            
            # Extract structured data
            extracted_data = self.parse_vietnamese_id_card_text(combined_text)
            
            # Store in Qdrant for future search
            if self.qdrant_client and self.sentence_model and combined_text.strip():
                try:
                    self.store_in_qdrant(combined_text, extracted_data, image_path)
                except Exception as e:
                    logger.warning(f"Failed to store in Qdrant: {e}")
            
            processing_time = time.time() - start_time
            confidence = min(95, 70 + len(extracted_data) * 3)
            
            return {
                "success": True,
                "extractedData": extracted_data,
                "confidence": confidence,
                "processingTime": processing_time,
                "rawText": combined_text,
                "fieldsExtracted": len(extracted_data),
                "processingMethod": "vietocr-qdrant",
                "regions": region_results
            }
            
        except Exception as e:
            logger.error(f"VietOCR processing failed: {e}")
            return self.fallback_processing(image_path, start_time)
    
    def store_in_qdrant(self, text: str, structured_data: Dict, image_path: str):
        """
        Store OCR results in Qdrant for vector search
        """
        try:
            # Generate embedding
            embedding = self.sentence_model.encode(text).tolist()
            
            # Create point
            point_id = str(uuid.uuid4())
            point = PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "text": text,
                    "structured_data": structured_data,
                    "image_path": image_path,
                    "timestamp": time.time(),
                    "document_type": "vietnamese_id_card"
                }
            )
            
            # Upsert to Qdrant
            self.qdrant_client.upsert(
                collection_name=self.collection_name,
                points=[point]
            )
            
            logger.info(f"Stored document in Qdrant with ID: {point_id}")
            
        except Exception as e:
            logger.error(f"Failed to store in Qdrant: {e}")
    
    def search_similar_documents(self, query: str, limit: int = 5) -> List[Dict]:
        """
        Search for similar documents using vector similarity
        """
        try:
            if not self.qdrant_client or not self.sentence_model:
                return []
            
            # Generate query embedding
            query_embedding = self.sentence_model.encode(query).tolist()
            
            # Search in Qdrant
            search_results = self.qdrant_client.search(
                collection_name=self.collection_name,
                query_vector=query_embedding,
                limit=limit
            )
            
            # Format results
            results = []
            for result in search_results:
                results.append({
                    "id": result.id,
                    "score": result.score,
                    "text": result.payload.get("text", ""),
                    "structured_data": result.payload.get("structured_data", {}),
                    "image_path": result.payload.get("image_path", ""),
                    "timestamp": result.payload.get("timestamp", 0)
                })
            
            return results
            
        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []
    
    def parse_vietnamese_id_card_text(self, text: str) -> Dict[str, str]:
        """
        Parse Vietnamese ID card text using improved patterns
        """
        extracted_data = {}
        lines = text.split('\n')
        
        # Enhanced Vietnamese ID card field patterns
        patterns = {
            'id': [
                r'số:\s*(\d+)',
                r'id:\s*(\d+)', 
                r'cmnd:\s*(\d+)',
                r'cccd:\s*(\d+)',
                r'số cmnd:\s*(\d+)',
                r'số cccd:\s*(\d+)',
                r'(\d{9,12})'
            ],
            'name': [
                r'họ và tên:\s*(.+)',
                r'họ tên:\s*(.+)',
                r'name:\s*(.+)',
                r'tên:\s*(.+)',
                r'full name:\s*(.+)'
            ],
            'date_of_birth': [
                r'ngày sinh:\s*(.+)',
                r'sinh:\s*(.+)',
                r'date of birth:\s*(.+)',
                r'dob:\s*(.+)',
                r'(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})'
            ],
            'sex': [
                r'giới tính:\s*(.+)',
                r'giới:\s*(.+)',
                r'sex:\s*(.+)',
                r'gender:\s*(.+)'
            ],
            'nationality': [
                r'quốc tịch:\s*(.+)',
                r'nationality:\s*(.+)',
                r'quốc gia:\s*(.+)'
            ],
            'place_of_origin': [
                r'quê quán:\s*(.+)',
                r'nơi sinh:\s*(.+)',
                r'place of origin:\s*(.+)',
                r'quê:\s*(.+)',
                r'hometown:\s*(.+)'
            ],
            'place_of_residence': [
                r'nơi thường trú:\s*(.+)',
                r'địa chỉ:\s*(.+)',
                r'place of residence:\s*(.+)',
                r'thường trú:\s*(.+)',
                r'address:\s*(.+)'
            ],
            'date_of_issue': [
                r'ngày cấp:\s*(.+)',
                r'cấp ngày:\s*(.+)',
                r'date of issue:\s*(.+)',
                r'issued:\s*(.+)'
            ],
            'date_of_expiry': [
                r'có giá trị đến:\s*(.+)',
                r'giá trị đến:\s*(.+)',
                r'date of expiry:\s*(.+)',
                r'expires:\s*(.+)',
                r'hết hạn:\s*(.+)'
            ]
        }
        
        import re
        
        # Extract fields using patterns
        for field_name, field_patterns in patterns.items():
            for pattern in field_patterns:
                for line in lines:
                    match = re.search(pattern, line, re.IGNORECASE)
                    if match and match.group(1) and match.group(1).strip():
                        value = match.group(1).strip()
                        # Clean up the value
                        value = re.sub(r'\s+', ' ', value)
                        extracted_data[field_name] = value
                        break
                if field_name in extracted_data:
                    break
        
        logger.info(f"Extracted {len(extracted_data)} fields from text")
        return extracted_data
    
    def fallback_processing(self, image_path: str, start_time: float) -> Dict[str, Any]:
        """
        Fallback to pytesseract if VietOCR fails
        """
        try:
            import pytesseract
            from PIL import Image
            
            logger.info("Using fallback pytesseract OCR")
            
            image = Image.open(image_path)
            text = pytesseract.image_to_string(image, lang='vie')
            
            extracted_data = self.parse_vietnamese_id_card_text(text)
            processing_time = time.time() - start_time
            
            return {
                "success": True,
                "extractedData": extracted_data,
                "confidence": max(50, len(extracted_data) * 8),
                "processingTime": processing_time,
                "rawText": text,
                "fieldsExtracted": len(extracted_data),
                "processingMethod": "fallback-tesseract"
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": f"All processing methods failed: {e}",
                "extractedData": {},
                "confidence": 0,
                "processingTime": time.time() - start_time,
                "processingMethod": "failed"
            }

def process_vietnamese_id_card(image_path: str) -> Dict[str, Any]:
    """
    Main processing function
    """
    processor = VietOCRQdrantProcessor()
    return processor.process_with_vietocr(image_path)

def search_documents(query: str, limit: int = 5) -> List[Dict]:
    """
    Search for similar documents
    """
    processor = VietOCRQdrantProcessor()
    return processor.search_similar_documents(query, limit)

def main():
    """Main function to process command line arguments"""
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python vietcard_processor.py <image_path> [search_query]",
            "extractedData": {},
            "confidence": 0
        }))
        sys.exit(1)
    
    if len(sys.argv) == 3 and sys.argv[1] == "search":
        # Search mode
        query = sys.argv[2]
        results = search_documents(query)
        print(json.dumps({
            "success": True,
            "search_results": results,
            "query": query
        }, ensure_ascii=False, indent=2))
        return
    
    image_path = sys.argv[1]
    
    # Check if file exists
    if not Path(image_path).exists():
        print(json.dumps({
            "success": False,
            "error": f"Image file not found: {image_path}",
            "extractedData": {},
            "confidence": 0
        }))
        sys.exit(1)
    
    # Process the ID card
    result = process_vietnamese_id_card(image_path)
    
    # Output result as JSON
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
