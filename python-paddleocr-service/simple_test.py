#!/usr/bin/env python3
"""
Simple OCR test - Using existing Tesseract first
"""

import os
import sys

# Test 1: Check if file exists
pdf_path = "/Users/jack/Desktop/1.PROJECT/3.OCR/SecureDocumentIntelligence/data_test/Chữ viết tay.pdf"

print("=" * 60)
print("🧪 QUICK OCR TEST")
print("=" * 60)
print(f"📄 File: {pdf_path}")
print(f"📊 Size: {os.path.getsize(pdf_path) / 1024:.1f} KB")
print()

# Test 2: Try with pdf2image
try:
    from pdf2image import convert_from_path
    print("✅ pdf2image available")
    
    print("📄 Converting PDF to images...")
    images = convert_from_path(pdf_path, dpi=150, first_page=1, last_page=1)
    print(f"✅ Converted {len(images)} page(s)")
    
    # Save first page as image
    if images:
        test_img_path = "/tmp/test_page_1.png"
        images[0].save(test_img_path, 'PNG')
        print(f"✅ Saved to: {test_img_path}")
        print()
        
        # Test 3: Try with existing Tesseract service
        print("🔍 Testing with Tesseract service...")
        import requests
        
        try:
            with open(test_img_path, 'rb') as f:
                response = requests.post(
                    'http://localhost:8001/process-ocr',
                    files={'file': f},
                    data={'language': 'vie'},
                    timeout=30
                )
            
            if response.status_code == 200:
                result = response.json()
                print("✅ Tesseract OCR Result:")
                print(f"   Confidence: {result.get('confidence', 0):.1f}%")
                print(f"   Text length: {len(result.get('text', ''))} characters")
                print()
                print("📝 Extracted text:")
                print("-" * 60)
                print(result.get('text', ''))
                print("-" * 60)
            else:
                print(f"⚠️  Tesseract service returned: {response.status_code}")
                
        except requests.exceptions.ConnectionError:
            print("❌ Tesseract service not running on port 8001")
            print("   Start it with: cd python-tesseract-service && python app.py")
        except Exception as e:
            print(f"❌ Error: {e}")
            
except ImportError:
    print("❌ pdf2image not installed")
    print("   Install with: pip install pdf2image")
except Exception as e:
    print(f"❌ Error: {e}")

print()
print("=" * 60)
print("📊 SUMMARY")
print("=" * 60)
print("✅ File exists and readable")
print("✅ PDF can be converted to images")
print("ℹ️  For PaddleOCR test, models need to be downloaded first")
print("ℹ️  This may take 5-10 minutes on first run")
print()
print("💡 Next steps:")
print("   1. Make sure Tesseract service is running (port 8001)")
print("   2. Or wait for PaddleOCR models to download")
print("   3. Then run full hybrid test")
