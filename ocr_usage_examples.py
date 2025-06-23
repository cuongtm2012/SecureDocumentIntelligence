#!/usr/bin/env python3
"""
Simple Usage Example for Vietnamese PDF OCR Processor

This script demonstrates basic usage of the VietnameseOCRProcessor
with the PDF files available in your uploads directory.
"""

import sys
import os
from pathlib import Path

# Import our OCR processor
from vietnamese_pdf_ocr import VietnameseOCRProcessor

def simple_ocr_example():
    """
    Simple example: Process a PDF without API integration.
    """
    print("🇻🇳 Vietnamese PDF OCR - Simple Example")
    print("=" * 50)
    
    # Find Vietnamese PDF in uploads directory
    uploads_dir = Path("uploads")
    vietnamese_pdfs = list(uploads_dir.glob("*.pdf"))
    
    if not vietnamese_pdfs:
        print("❌ No PDF files found in uploads directory")
        print("Please add a Vietnamese PDF file to the uploads/ folder")
        return
    
    # Use the first PDF found
    pdf_file = vietnamese_pdfs[0]
    print(f"📄 Processing: {pdf_file.name}")
    
    try:
        # Initialize processor (without API)
        processor = VietnameseOCRProcessor(output_dir="simple_ocr_output")
        
        # Process the PDF
        extracted_text, output_file, stats = processor.process_pdf(str(pdf_file))
        
        # Display results
        print(f"\n✅ OCR Processing Successful!")
        print(f"📊 Statistics:")
        print(f"   - Pages processed: {stats['total_pages']}")
        print(f"   - Characters extracted: {stats['total_characters']}")
        print(f"   - Average confidence: {stats['average_confidence']:.1f}%")
        print(f"   - Processing time: {stats['processing_time_seconds']:.1f} seconds")
        print(f"💾 Output saved to: {output_file}")
        
        # Show first 200 characters
        if extracted_text:
            print(f"\n📝 Text Preview (first 200 characters):")
            print("-" * 40)
            print(extracted_text[:200] + "..." if len(extracted_text) > 200 else extracted_text)
            print("-" * 40)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    return True

def api_integration_example():
    """
    Advanced example: Process PDF and send to API.
    """
    print("\n🌐 Vietnamese PDF OCR - API Integration Example")
    print("=" * 50)
    
    # API Configuration (replace with your actual API details)
    API_URL = "http://localhost:5000/api/ocr/vietnamese"  # Your local API
    API_TOKEN = "your-api-token-here"  # Replace with real token
    
    # Find PDF file
    uploads_dir = Path("uploads")
    vietnamese_pdfs = list(uploads_dir.glob("*.pdf"))
    
    if not vietnamese_pdfs:
        print("❌ No PDF files found in uploads directory")
        return
    
    pdf_file = vietnamese_pdfs[0]
    print(f"📄 Processing: {pdf_file.name}")
    print(f"🌐 API Endpoint: {API_URL}")
    
    try:
        # Initialize processor with API configuration
        processor = VietnameseOCRProcessor(
            api_url=API_URL,
            api_token=API_TOKEN,
            output_dir="api_ocr_output"
        )
        
        # Process PDF and send to API
        results = processor.process_and_send(str(pdf_file))
        
        if results['success']:
            print(f"\n✅ Complete Processing Successful!")
            stats = results['processing_stats']
            print(f"📊 OCR Statistics:")
            print(f"   - Pages: {stats['total_pages']}")
            print(f"   - Characters: {stats['total_characters']}")
            print(f"   - Confidence: {stats['average_confidence']:.1f}%")
            print(f"💾 Local file: {results['output_file']}")
            
            if results['api_response']:
                print(f"📡 API Response: Success")
            else:
                print(f"⚠️ API not available (processing completed locally)")
        
        else:
            print(f"❌ Processing failed: {results['error']}")
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    
    return True

def batch_processing_example():
    """
    Batch processing example: Process multiple PDFs.
    """
    print("\n📚 Vietnamese PDF OCR - Batch Processing Example")
    print("=" * 50)
    
    # Find all PDFs in uploads directory
    uploads_dir = Path("uploads")
    pdf_files = list(uploads_dir.glob("*.pdf"))
    
    if not pdf_files:
        print("❌ No PDF files found in uploads directory")
        return
    
    print(f"📄 Found {len(pdf_files)} PDF file(s)")
    
    # Initialize processor
    processor = VietnameseOCRProcessor(output_dir="batch_ocr_output")
    
    # Process each PDF
    successful = 0
    failed = 0
    
    for i, pdf_file in enumerate(pdf_files, 1):
        print(f"\n[{i}/{len(pdf_files)}] Processing: {pdf_file.name}")
        
        try:
            extracted_text, output_file, stats = processor.process_pdf(str(pdf_file))
            print(f"✅ Success: {stats['total_characters']} characters, {stats['average_confidence']:.1f}% confidence")
            successful += 1
            
        except Exception as e:
            print(f"❌ Failed: {e}")
            failed += 1
    
    print(f"\n📊 Batch Processing Summary:")
    print(f"   ✅ Successful: {successful}")
    print(f"   ❌ Failed: {failed}")
    print(f"   📈 Success rate: {(successful/(successful+failed)*100):.1f}%")

def main():
    """
    Main function to run all examples.
    """
    print("🇻🇳 Vietnamese PDF OCR Processor - Usage Examples")
    print("=" * 60)
    print("This script demonstrates different ways to use the OCR processor")
    print()
    
    # Check if we have any PDF files
    uploads_dir = Path("uploads")
    if not uploads_dir.exists():
        print("❌ uploads/ directory not found")
        print("Please create uploads/ directory and add Vietnamese PDF files")
        return
    
    pdf_files = list(uploads_dir.glob("*.pdf"))
    if not pdf_files:
        print("❌ No PDF files found in uploads/ directory")
        print("Please add Vietnamese PDF files to uploads/ folder")
        print("Example files you can test with:")
        print("- Government documents")
        print("- Academic papers")
        print("- Business documents")
        print("- Scanned books or articles")
        return
    
    print(f"📁 Found {len(pdf_files)} PDF file(s) in uploads/:")
    for pdf in pdf_files:
        print(f"   - {pdf.name}")
    print()
    
    # Run examples
    print("1️⃣ Running Simple OCR Example...")
    if simple_ocr_example():
        print("✅ Simple example completed successfully")
    
    print("\n2️⃣ Running API Integration Example...")
    if api_integration_example():
        print("✅ API example completed successfully")
    
    print("\n3️⃣ Running Batch Processing Example...")
    batch_processing_example()
    
    print("\n🎉 All examples completed!")
    print("\n📖 Next Steps:")
    print("1. Check the output directories for extracted text files")
    print("2. Modify API_URL and API_TOKEN for your actual API")
    print("3. Adjust OCR settings in vietnamese_pdf_ocr.py as needed")
    print("4. Add more PDF files to uploads/ for testing")

if __name__ == "__main__":
    main()
