#!/usr/bin/env python3
"""
Quick test script for PaddleOCR with PDF
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from paddleocr import PaddleOCR
    import cv2
    import numpy as np
    from pdf2image import convert_from_path
    print("✅ All imports successful!")
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("\nInstalling missing package...")
    os.system("pip install pdf2image")
    from pdf2image import convert_from_path
    print("✅ pdf2image installed!")

def test_paddleocr_with_pdf(pdf_path):
    """Test PaddleOCR with a PDF file"""
    
    print("=" * 60)
    print("🚀 Testing PaddleOCR with PDF")
    print("=" * 60)
    print(f"📄 PDF: {pdf_path}")
    print()
    
    # Initialize PaddleOCR
    print("🔧 Initializing PaddleOCR...")
    ocr = PaddleOCR(use_angle_cls=True, lang='vi', show_log=False)
    print("✅ PaddleOCR initialized!")
    print()
    
    # Convert PDF to images
    print("📄 Converting PDF to images...")
    try:
        images = convert_from_path(pdf_path, dpi=200)
        print(f"✅ Converted {len(images)} pages")
    except Exception as e:
        print(f"❌ PDF conversion failed: {e}")
        print("\nTrying alternative method...")
        # Fallback: assume it's an image
        images = [cv2.imread(pdf_path)]
        if images[0] is None:
            print("❌ Cannot read file")
            return
    
    print()
    
    # Process each page
    all_text = []
    total_confidence = 0
    
    for i, image in enumerate(images, 1):
        print(f"📄 Processing page {i}/{len(images)}...")
        
        # Convert PIL to numpy if needed
        if hasattr(image, 'convert'):
            image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
        
        # Preprocess
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # CLAHE enhancement
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        
        # Save temp
        temp_path = f'/tmp/test_page_{i}.png'
        cv2.imwrite(temp_path, enhanced)
        
        # OCR
        result = ocr.ocr(temp_path, cls=True)
        
        if result and result[0]:
            page_text = []
            page_conf = []
            
            for line in result[0]:
                text = line[1][0]
                conf = line[1][1] * 100
                page_text.append(text)
                page_conf.append(conf)
            
            avg_conf = sum(page_conf) / len(page_conf) if page_conf else 0
            
            print(f"   ✅ Page {i}: {len(page_text)} lines, {avg_conf:.1f}% confidence")
            
            all_text.extend(page_text)
            total_confidence += avg_conf
            
            # Show first few lines
            if page_text:
                print(f"   📝 Preview:")
                for line in page_text[:3]:
                    print(f"      {line}")
                if len(page_text) > 3:
                    print(f"      ... ({len(page_text) - 3} more lines)")
        else:
            print(f"   ⚠️  Page {i}: No text detected")
        
        print()
        
        # Cleanup
        try:
            os.unlink(temp_path)
        except:
            pass
    
    # Summary
    print("=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    print(f"Total pages: {len(images)}")
    print(f"Total lines: {len(all_text)}")
    print(f"Total characters: {sum(len(t) for t in all_text)}")
    
    if len(images) > 0:
        avg_confidence = total_confidence / len(images)
        print(f"Average confidence: {avg_confidence:.1f}%")
    
    print()
    print("📝 Full extracted text:")
    print("-" * 60)
    for text in all_text:
        print(text)
    print("-" * 60)
    print()
    print("✅ Test completed!")

if __name__ == "__main__":
    pdf_path = "/Users/jack/Desktop/1.PROJECT/3.OCR/SecureDocumentIntelligence/data_test/Chữ viết tay.pdf"
    
    if not os.path.exists(pdf_path):
        print(f"❌ File not found: {pdf_path}")
        sys.exit(1)
    
    test_paddleocr_with_pdf(pdf_path)
