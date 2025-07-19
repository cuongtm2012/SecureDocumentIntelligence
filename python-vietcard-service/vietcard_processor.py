
#!/usr/bin/env python3
"""
VietCardOCR Processor
Processes Vietnamese ID cards using the VietCardOCR library

Author: SecureDocumentIntelligence Team
Date: 2025-01-27
"""

import sys
import json
import time
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def process_vietnamese_id_card(image_path):
    """
    Process Vietnamese ID card using VietCardOCR
    
    Args:
        image_path (str): Path to the ID card image
    
    Returns:
        dict: Processing results with extracted data
    """
    start_time = time.time()
    
    try:
        # Import VietCardOCR
        from vietcardocr import VietCardOCR
        
        logger.info(f"Processing ID card: {image_path}")
        
        # Initialize VietCardOCR detector
        detector = VietCardOCR()
        
        # Process the image
        result = detector.predict(image_path)
        
        processing_time = time.time() - start_time
        
        if result:
            # Extract structured data
            extracted_data = {}
            raw_text = ""
            
            # VietCardOCR typically returns a dictionary with detected fields
            if isinstance(result, dict):
                # Common ID card fields in Vietnamese
                field_mapping = {
                    'id': ['id', 'ID', 'Số', 'So'],
                    'name': ['name', 'Name', 'Họ và tên', 'Ho va ten'],
                    'date_of_birth': ['date_of_birth', 'dob', 'Ngày sinh', 'Ngay sinh'],
                    'sex': ['sex', 'gender', 'Giới tính', 'Gioi tinh'],
                    'nationality': ['nationality', 'Quốc tịch', 'Quoc tich'],
                    'place_of_origin': ['place_of_origin', 'Quê quán', 'Que quan'],
                    'place_of_residence': ['place_of_residence', 'Nơi thường trú', 'Noi thuong tru'],
                    'personal_identification': ['personal_identification', 'Đặc điểm nhận dạng', 'Dac diem nhan dang'],
                    'date_of_issue': ['date_of_issue', 'Ngày cấp', 'Ngay cap'],
                    'date_of_expiry': ['date_of_expiry', 'Có giá trị đến', 'Co gia tri den']
                }
                
                # Extract data based on field mapping
                for key, possible_keys in field_mapping.items():
                    for pkey in possible_keys:
                        if pkey in result:
                            extracted_data[key] = result[pkey]
                            break
                
                # Also include any other fields found
                for key, value in result.items():
                    if key not in extracted_data.values():
                        raw_text += f"{key}: {value}\n"
            
            elif isinstance(result, str):
                # If result is just text, parse it
                raw_text = result
                lines = result.split('\n')
                
                # Simple parsing for common patterns
                for line in lines:
                    line = line.strip()
                    if 'Số:' in line or 'ID:' in line:
                        extracted_data['id'] = line.split(':')[-1].strip()
                    elif 'Họ và tên:' in line or 'Name:' in line:
                        extracted_data['name'] = line.split(':')[-1].strip()
                    elif 'Ngày sinh:' in line or 'Date of birth:' in line:
                        extracted_data['date_of_birth'] = line.split(':')[-1].strip()
                    elif 'Giới tính:' in line or 'Sex:' in line:
                        extracted_data['sex'] = line.split(':')[-1].strip()
                    elif 'Quốc tịch:' in line or 'Nationality:' in line:
                        extracted_data['nationality'] = line.split(':')[-1].strip()
            
            # Calculate confidence based on number of fields extracted
            confidence = min(95, 60 + len(extracted_data) * 5)
            
            return {
                "success": True,
                "extractedData": extracted_data,
                "confidence": confidence,
                "processingTime": processing_time,
                "rawText": raw_text.strip(),
                "fieldsExtracted": len(extracted_data)
            }
        
        else:
            return {
                "success": False,
                "error": "No data extracted from ID card",
                "extractedData": {},
                "confidence": 0,
                "processingTime": processing_time
            }
            
    except ImportError as e:
        logger.error(f"VietCardOCR library not available: {e}")
        return {
            "success": False,
            "error": f"VietCardOCR library not installed: {e}",
            "extractedData": {},
            "confidence": 0,
            "processingTime": 0
        }
    
    except Exception as e:
        logger.error(f"VietCardOCR processing failed: {e}")
        return {
            "success": False,
            "error": f"Processing failed: {e}",
            "extractedData": {},
            "confidence": 0,
            "processingTime": time.time() - start_time
        }

def main():
    """Main function to process command line arguments"""
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python vietcard_processor.py <image_path>",
            "extractedData": {},
            "confidence": 0
        }))
        sys.exit(1)
    
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
