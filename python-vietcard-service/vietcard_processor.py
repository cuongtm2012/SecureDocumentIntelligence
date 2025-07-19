
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
        # Try different import methods for VietCardOCR
        try:
            from vietcardocr.vietcardocr import VietCardOCR
            logger.info("VietCardOCR imported successfully (method 1)")
        except ImportError:
            try:
                from vietcardocr import VietCardOCR
                logger.info("VietCardOCR imported successfully (method 2)")
            except ImportError:
                try:
                    import vietcardocr
                    VietCardOCR = vietcardocr.VietCardOCR
                    logger.info("VietCardOCR imported successfully (method 3)")
                except (ImportError, AttributeError):
                    # Fallback to simple OCR if VietCardOCR is not available
                    logger.warning("VietCardOCR not available, using fallback OCR")
                    return process_with_fallback_ocr(image_path, start_time)
        
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
                    'id': ['id', 'ID', 'Số', 'So', 'number', 'card_id'],
                    'name': ['name', 'Name', 'Họ và tên', 'Ho va ten', 'full_name'],
                    'date_of_birth': ['date_of_birth', 'dob', 'Ngày sinh', 'Ngay sinh', 'birth_date'],
                    'sex': ['sex', 'gender', 'Giới tính', 'Gioi tinh'],
                    'nationality': ['nationality', 'Quốc tịch', 'Quoc tich'],
                    'place_of_origin': ['place_of_origin', 'Quê quán', 'Que quan', 'hometown'],
                    'place_of_residence': ['place_of_residence', 'Nơi thường trú', 'Noi thuong tru', 'address'],
                    'personal_identification': ['personal_identification', 'Đặc điểm nhận dạng', 'Dac diem nhan dang'],
                    'date_of_issue': ['date_of_issue', 'Ngày cấp', 'Ngay cap', 'issue_date'],
                    'date_of_expiry': ['date_of_expiry', 'Có giá trị đến', 'Co gia tri den', 'expiry_date']
                }
                
                # Extract data based on field mapping
                for key, possible_keys in field_mapping.items():
                    for pkey in possible_keys:
                        if pkey in result:
                            extracted_data[key] = str(result[pkey]).strip()
                            break
                
                # Also include any other fields found
                for key, value in result.items():
                    if key not in [item for sublist in field_mapping.values() for item in sublist]:
                        raw_text += f"{key}: {value}\n"
            
            elif isinstance(result, str):
                # If result is just text, parse it
                raw_text = result
                extracted_data = parse_text_for_id_fields(result)
            
            elif isinstance(result, list):
                # If result is a list, try to extract from first item
                if len(result) > 0:
                    if isinstance(result[0], dict):
                        extracted_data = result[0]
                    else:
                        raw_text = str(result[0])
                        extracted_data = parse_text_for_id_fields(raw_text)
            
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
            
    except Exception as e:
        logger.error(f"VietCardOCR processing failed: {e}")
        # Fallback to simple OCR
        return process_with_fallback_ocr(image_path, start_time)

def process_with_fallback_ocr(image_path, start_time):
    """
    Fallback OCR processing using pytesseract
    """
    try:
        import pytesseract
        from PIL import Image
        
        logger.info("Using fallback pytesseract OCR")
        
        # Open and process image
        image = Image.open(image_path)
        
        # Extract text using Vietnamese language
        text = pytesseract.image_to_string(image, lang='vie')
        
        # Parse for ID card fields
        extracted_data = parse_text_for_id_fields(text)
        
        processing_time = time.time() - start_time
        
        return {
            "success": True,
            "extractedData": extracted_data,
            "confidence": max(50, len(extracted_data) * 10),
            "processingTime": processing_time,
            "rawText": text,
            "fieldsExtracted": len(extracted_data),
            "processingMethod": "fallback-tesseract"
        }
        
    except ImportError:
        return {
            "success": False,
            "error": "Neither VietCardOCR nor pytesseract available",
            "extractedData": {},
            "confidence": 0,
            "processingTime": time.time() - start_time
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Fallback OCR failed: {e}",
            "extractedData": {},
            "confidence": 0,
            "processingTime": time.time() - start_time
        }

def parse_text_for_id_fields(text):
    """
    Parse text for Vietnamese ID card fields
    """
    extracted_data = {}
    lines = text.split('\n')
    
    # Vietnamese ID card field patterns
    patterns = {
        'id': [r'số:\s*(\d+)', r'id:\s*(\d+)', r'cmnd:\s*(\d+)', r'cccd:\s*(\d+)', r'(\d{9,12})'],
        'name': [r'họ và tên:\s*(.+)', r'name:\s*(.+)', r'tên:\s*(.+)'],
        'date_of_birth': [r'ngày sinh:\s*(.+)', r'date of birth:\s*(.+)', r'sinh:\s*(.+)'],
        'sex': [r'giới tính:\s*(.+)', r'sex:\s*(.+)', r'giới:\s*(.+)'],
        'nationality': [r'quốc tịch:\s*(.+)', r'nationality:\s*(.+)'],
        'place_of_origin': [r'quê quán:\s*(.+)', r'place of origin:\s*(.+)', r'quê:\s*(.+)'],
        'place_of_residence': [r'nơi thường trú:\s*(.+)', r'place of residence:\s*(.+)', r'thường trú:\s*(.+)'],
        'date_of_issue': [r'ngày cấp:\s*(.+)', r'date of issue:\s*(.+)', r'cấp:\s*(.+)'],
        'date_of_expiry': [r'có giá trị đến:\s*(.+)', r'date of expiry:\s*(.+)', r'giá trị:\s*(.+)']
    }
    
    import re
    
    # Try to extract each field
    for field_name, field_patterns in patterns.items():
        for pattern in field_patterns:
            for line in lines:
                match = re.search(pattern, line, re.IGNORECASE)
                if match and match.group(1) and match.group(1).strip():
                    extracted_data[field_name] = match.group(1).strip()
                    break
            if field_name in extracted_data:
                break
    
    return extracted_data

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
