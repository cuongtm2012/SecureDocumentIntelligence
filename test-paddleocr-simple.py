#!/usr/bin/env python3
"""
Simple PaddleOCR test to verify if it can initialize and work
"""
import sys
import json

try:
    print("Testing PaddleOCR installation...")
    
    # Test import
    from paddleocr import PaddleOCR
    print("✓ PaddleOCR import successful")
    
    # Test initialization with minimal config
    print("Initializing PaddleOCR...")
    ocr = PaddleOCR(
        lang='vi',
        use_textline_orientation=False  # Disable orientation detection for simplicity
    )
    print("✓ PaddleOCR initialization successful")
    
    # Test with a simple image if provided
    if len(sys.argv) > 1:
        img_path = sys.argv[1]
        print(f"Testing OCR on: {img_path}")
        result = ocr.ocr(img_path, cls=False)
        
        if result and result[0]:
            print(f"✓ OCR successful, found {len(result[0])} text boxes")
            for i, line in enumerate(result[0][:3]):  # Show first 3 lines
                text = line[1][0]
                confidence = line[1][1]
                print(f"  Line {i+1}: {text} (confidence: {confidence:.2f})")
        else:
            print("✗ No text detected")
    
    print("PaddleOCR test completed successfully!")
    
except Exception as e:
    print(f"✗ PaddleOCR test failed: {str(e)}")
    sys.exit(1)