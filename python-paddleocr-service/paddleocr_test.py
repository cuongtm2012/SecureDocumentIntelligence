#!/usr/bin/env python3
"""
Quick PaddleOCR test with version 3.3.1
"""

import os
import sys

print("=" * 60)
print("🚀 PaddleOCR 3.3.1 Test")
print("=" * 60)

# Use the already converted image
image_path = "/tmp/test_page_1.png"

if not os.path.exists(image_path):
    print(f"❌ Image not found: {image_path}")
    print("Run simple_test.py first")
    sys.exit(1)

print(f"📄 Image: {image_path}")
print()

try:
    print("🔧 Initializing PaddleOCR 3.3.1...")
    from paddleocr import PaddleOCR
    import cv2
    import numpy as np
    
    # Initialize with Vietnamese
    ocr = PaddleOCR(
        use_angle_cls=True,
        lang='vi',
        show_log=False,
        use_gpu=False
    )
    print("✅ PaddleOCR initialized!")
    print()
    
    # Load and preprocess image
    print("🔍 Processing image...")
    img = cv2.imread(image_path)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # CLAHE enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    # Save preprocessed
    temp_path = "/tmp/test_enhanced.png"
    cv2.imwrite(temp_path, enhanced)
    
    # Run OCR
    print("🤖 Running PaddleOCR...")
    result = ocr.ocr(temp_path, cls=True)
    
    if result and result[0]:
        texts = []
        confidences = []
        
        for line in result[0]:
            text = line[1][0]
            conf = line[1][1] * 100
            texts.append(text)
            confidences.append(conf)
        
        avg_conf = sum(confidences) / len(confidences) if confidences else 0
        
        print(f"✅ PaddleOCR completed!")
        print(f"📊 Lines detected: {len(texts)}")
        print(f"📊 Confidence: {avg_conf:.1f}%")
        print(f"📝 Characters: {sum(len(t) for t in texts)}")
        print()
        print("📝 Extracted Text (PaddleOCR 3.3.1):")
        print("-" * 60)
        for text in texts:
            print(text)
        print("-" * 60)
        print()
        
        # Cleanup
        try:
            os.unlink(temp_path)
        except:
            pass
            
    else:
        print("⚠️  No text detected")
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()

print()
print("=" * 60)
print("✅ Test completed!")
print("=" * 60)
