#!/usr/bin/env python3
"""
Vietnamese PDF OCR Processor

This script processes scanned PDF files in Vietnamese using Tesseract OCR,
extracts all text, saves it to a .txt file, and sends it to a specified API endpoint.

Requirements:
- pdf2image: pip install pdf2image
- pytesseract: pip install pytesseract
- Pillow: pip install Pillow
- requests: pip install requests
- Tesseract OCR with Vietnamese language data installed

Author: SecureDocumentIntelligence OCR System
Date: 2025-06-23
"""

import os
import sys
import logging
from pathlib import Path
from typing import Optional, List, Tuple
import json
from datetime import datetime

# Core libraries
import requests
from PIL import Image
import pytesseract
from pdf2image import convert_from_path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('vietnamese_ocr.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class VietnameseOCRProcessor:
    """
    A comprehensive OCR processor for Vietnamese PDF documents.
    
    This class handles PDF to image conversion, OCR text extraction,
    file output, and API communication.
    """
    
    def __init__(self, api_url: str = None, api_token: str = None, output_dir: str = "output"):
        """
        Initialize the OCR processor.
        
        Args:
            api_url (str): API endpoint URL for sending extracted text
            api_token (str): Authentication token for API requests
            output_dir (str): Directory to save output files
        """
        self.api_url = api_url
        self.api_token = api_token
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(exist_ok=True)
        
        # Tesseract configuration for Vietnamese
        self.tesseract_config = r'--oem 3 --psm 6 -l vie'
        
        # Verify Tesseract installation
        self._verify_tesseract_installation()
    
    def _verify_tesseract_installation(self) -> None:
        """
        Verify that Tesseract is installed and Vietnamese language data is available.
        
        Raises:
            SystemExit: If Tesseract or Vietnamese language data is not found
        """
        try:
            # Check if Tesseract is installed
            pytesseract.get_tesseract_version()
            logger.info(f"Tesseract version: {pytesseract.get_tesseract_version()}")
            
            # Check available languages
            available_languages = pytesseract.get_languages(config='')
            logger.info(f"Available languages: {available_languages}")
            
            if 'vie' not in available_languages:
                logger.error("Vietnamese language data not found in Tesseract!")
                logger.error("Please install Vietnamese language data:")
                logger.error("- Windows: Download vie.traineddata to Tesseract tessdata folder")
                logger.error("- Ubuntu/Debian: sudo apt-get install tesseract-ocr-vie")
                logger.error("- macOS: brew install tesseract-lang")
                sys.exit(1)
            
            logger.info("✅ Tesseract with Vietnamese language support is ready")
            
        except Exception as e:
            logger.error(f"Tesseract installation error: {e}")
            logger.error("Please install Tesseract OCR:")
            logger.error("- Windows: https://github.com/UB-Mannheim/tesseract/wiki")
            logger.error("- Ubuntu/Debian: sudo apt-get install tesseract-ocr")
            logger.error("- macOS: brew install tesseract")
            sys.exit(1)
    
    def pdf_to_images(self, pdf_path: str, dpi: int = 300) -> List[Image.Image]:
        """
        Convert PDF pages to PIL Image objects.
        
        Args:
            pdf_path (str): Path to the PDF file
            dpi (int): DPI for image conversion (higher = better quality, larger file)
        
        Returns:
            List[Image.Image]: List of PIL Image objects, one per page
        
        Raises:
            FileNotFoundError: If PDF file doesn't exist
            Exception: If PDF conversion fails
        """
        pdf_file = Path(pdf_path)
        
        if not pdf_file.exists():
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
        
        logger.info(f"Converting PDF to images: {pdf_file.name}")
        logger.info(f"Using DPI: {dpi}")
        
        try:
            # Convert PDF pages to images
            # pdf2image automatically handles multi-page PDFs
            images = convert_from_path(
                pdf_path,
                dpi=dpi,
                fmt='PNG',  # Use PNG for better quality
                thread_count=4,  # Use multiple threads for faster conversion
                poppler_path=None  # Use system poppler installation
            )
            
            logger.info(f"✅ Successfully converted {len(images)} pages to images")
            return images
            
        except Exception as e:
            logger.error(f"Failed to convert PDF to images: {e}")
            logger.error("Make sure poppler is installed:")
            logger.error("- Windows: Download poppler binaries")
            logger.error("- Ubuntu/Debian: sudo apt-get install poppler-utils")
            logger.error("- macOS: brew install poppler")
            raise
    
    def extract_text_from_image(self, image: Image.Image, page_num: int = 1) -> Tuple[str, float]:
        """
        Extract Vietnamese text from a single image using Tesseract OCR.
        
        Args:
            image (Image.Image): PIL Image object
            page_num (int): Page number for logging purposes
        
        Returns:
            Tuple[str, float]: Extracted text and confidence score (0-100)
        """
        logger.info(f"Extracting text from page {page_num}...")
        
        try:
            # Extract text with Vietnamese language support
            extracted_text = pytesseract.image_to_string(
                image, 
                config=self.tesseract_config
            )
            
            # Get OCR confidence data
            try:
                ocr_data = pytesseract.image_to_data(
                    image, 
                    config=self.tesseract_config,
                    output_type=pytesseract.Output.DICT
                )
                
                # Calculate average confidence (excluding -1 values)
                confidences = [int(conf) for conf in ocr_data['conf'] if int(conf) > 0]
                avg_confidence = sum(confidences) / len(confidences) if confidences else 0
                
            except Exception as conf_error:
                logger.warning(f"Could not calculate confidence: {conf_error}")
                avg_confidence = 0.0
            
            # Clean up the extracted text
            cleaned_text = self._clean_vietnamese_text(extracted_text)
            
            logger.info(f"Page {page_num}: Extracted {len(cleaned_text)} characters")
            logger.info(f"Page {page_num}: OCR confidence: {avg_confidence:.1f}%")
            
            return cleaned_text, avg_confidence
            
        except Exception as e:
            logger.error(f"OCR failed for page {page_num}: {e}")
            return "", 0.0
    
    def _clean_vietnamese_text(self, text: str) -> str:
        """
        Clean and normalize Vietnamese text extracted from OCR.
        
        Args:
            text (str): Raw OCR text
        
        Returns:
            str: Cleaned text
        """
        if not text:
            return ""
        
        # Remove excessive whitespace
        text = ' '.join(text.split())
        
        # Remove common OCR artifacts
        text = text.replace('|', 'I')  # Common OCR mistake
        text = text.replace('0', 'O')  # In names, 0 is often O
        
        # Fix common Vietnamese character recognition issues
        vietnamese_fixes = {
            'đ': ['d', 'ð'],
            'Đ': ['D', 'Ð'],
            'ă': ['a'],
            'â': ['a'],
            'ê': ['e'],
            'ô': ['o'],
            'ơ': ['o'],
            'ư': ['u'],
        }
        
        # Apply fixes (this is a simplified version)
        # In production, you might want more sophisticated text correction
        
        return text.strip()
    
    def process_pdf(self, pdf_path: str, output_filename: str = None) -> Tuple[str, str, dict]:
        """
        Process a complete PDF file: convert to images, extract text, save to file.
        
        Args:
            pdf_path (str): Path to the PDF file
            output_filename (str): Custom output filename (optional)
        
        Returns:
            Tuple[str, str, dict]: (extracted_text, output_file_path, processing_stats)
        """
        pdf_file = Path(pdf_path)
        
        # Generate output filename
        if output_filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_filename = f"{pdf_file.stem}_vietnamese_ocr_{timestamp}.txt"
        
        output_path = self.output_dir / output_filename
        
        logger.info(f"🚀 Starting Vietnamese OCR processing for: {pdf_file.name}")
        start_time = datetime.now()
        
        try:
            # Step 1: Convert PDF to images
            images = self.pdf_to_images(pdf_path)
            
            # Step 2: Extract text from each page
            all_text_parts = []
            page_stats = []
            
            for i, image in enumerate(images, 1):
                page_text, confidence = self.extract_text_from_image(image, i)
                
                if page_text.strip():
                    all_text_parts.append(f"=== TRANG {i} ===\n{page_text}\n")
                    page_stats.append({
                        'page': i,
                        'characters': len(page_text),
                        'confidence': confidence
                    })
                else:
                    logger.warning(f"No text extracted from page {i}")
                    page_stats.append({
                        'page': i,
                        'characters': 0,
                        'confidence': 0
                    })
            
            # Step 3: Combine all text
            full_text = "\n".join(all_text_parts)
            
            # Step 4: Save to file
            self._save_text_to_file(full_text, output_path, pdf_file.name)
            
            # Calculate processing statistics
            end_time = datetime.now()
            processing_time = (end_time - start_time).total_seconds()
            
            stats = {
                'source_file': pdf_file.name,
                'output_file': str(output_path),
                'total_pages': len(images),
                'total_characters': len(full_text),
                'average_confidence': sum(p['confidence'] for p in page_stats) / len(page_stats) if page_stats else 0,
                'processing_time_seconds': processing_time,
                'page_stats': page_stats,
                'timestamp': datetime.now().isoformat()
            }
            
            logger.info(f"✅ OCR processing completed successfully!")
            logger.info(f"📄 Total pages processed: {stats['total_pages']}")
            logger.info(f"📝 Total characters extracted: {stats['total_characters']}")
            logger.info(f"🎯 Average confidence: {stats['average_confidence']:.1f}%")
            logger.info(f"⏱️ Processing time: {processing_time:.1f} seconds")
            logger.info(f"💾 Output saved to: {output_path}")
            
            return full_text, str(output_path), stats
            
        except Exception as e:
            logger.error(f"PDF processing failed: {e}")
            raise
    
    def _save_text_to_file(self, text: str, output_path: Path, source_filename: str) -> None:
        """
        Save extracted text to a file with metadata header.
        
        Args:
            text (str): Extracted text
            output_path (Path): Output file path
            source_filename (str): Original PDF filename
        """
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                # Write metadata header
                f.write(f"Vietnamese OCR Extraction Results\n")
                f.write(f"=" * 50 + "\n")
                f.write(f"Source File: {source_filename}\n")
                f.write(f"Processing Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"OCR Engine: Tesseract with Vietnamese language support\n")
                f.write(f"Total Characters: {len(text)}\n")
                f.write(f"=" * 50 + "\n\n")
                
                # Write extracted text
                f.write(text)
            
            logger.info(f"✅ Text saved to: {output_path}")
            
        except Exception as e:
            logger.error(f"Failed to save text file: {e}")
            raise
    
    def send_to_api(self, text: str, metadata: dict = None) -> dict:
        """
        Send extracted text to API endpoint.
        
        Args:
            text (str): Extracted text to send
            metadata (dict): Additional metadata to include
        
        Returns:
            dict: API response data
        
        Raises:
            ValueError: If API URL or token not configured
            requests.RequestException: If API request fails
        """
        if not self.api_url:
            raise ValueError("API URL not configured")
        
        if not self.api_token:
            raise ValueError("API token not configured")
        
        logger.info(f"📡 Sending text to API: {self.api_url}")
        
        # Prepare request data
        request_data = {
            'text': text,
            'language': 'vietnamese',
            'source': 'tesseract_ocr',
            'timestamp': datetime.now().isoformat()
        }
        
        # Add metadata if provided
        if metadata:
            request_data['metadata'] = metadata
        
        # Prepare headers
        headers = {
            'Authorization': f'Bearer {self.api_token}',
            'Content-Type': 'application/json',
            'User-Agent': 'VietnameseOCR-Processor/1.0'
        }
        
        try:
            # Send POST request
            response = requests.post(
                self.api_url,
                headers=headers,
                json=request_data,  # Use json parameter for proper encoding
                timeout=30  # 30 second timeout
            )
            
            # Check response status
            response.raise_for_status()
            
            # Parse response
            response_data = response.json() if response.content else {}
            
            logger.info(f"✅ API request successful!")
            logger.info(f"📊 Response status: {response.status_code}")
            logger.info(f"📨 Response data: {json.dumps(response_data, indent=2, ensure_ascii=False)}")
            
            return response_data
            
        except requests.exceptions.Timeout:
            logger.error("❌ API request timed out")
            raise
        except requests.exceptions.ConnectionError:
            logger.error("❌ API connection failed")
            raise
        except requests.exceptions.HTTPError as e:
            logger.error(f"❌ API HTTP error: {e}")
            logger.error(f"Response content: {response.text}")
            raise
        except requests.exceptions.RequestException as e:
            logger.error(f"❌ API request failed: {e}")
            raise
    
    def process_and_send(self, pdf_path: str, output_filename: str = None) -> dict:
        """
        Complete workflow: process PDF and send to API.
        
        Args:
            pdf_path (str): Path to PDF file
            output_filename (str): Custom output filename (optional)
        
        Returns:
            dict: Complete processing results including API response
        """
        try:
            # Process the PDF
            extracted_text, output_file, stats = self.process_pdf(pdf_path, output_filename)
            
            # Send to API if configured
            api_response = None
            if self.api_url and self.api_token:
                try:
                    api_response = self.send_to_api(extracted_text, stats)
                except Exception as api_error:
                    logger.warning(f"API sending failed: {api_error}")
                    # Continue even if API fails
            
            # Return complete results
            results = {
                'success': True,
                'extracted_text': extracted_text,
                'output_file': output_file,
                'processing_stats': stats,
                'api_response': api_response
            }
            
            return results
            
        except Exception as e:
            logger.error(f"Complete processing failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'extracted_text': None,
                'output_file': None,
                'processing_stats': None,
                'api_response': None
            }


def main():
    """
    Example usage of the VietnameseOCRProcessor.
    """
    # Configuration
    API_URL = "https://api.example.com/ocr/vietnamese"  # Replace with your API endpoint
    API_TOKEN = "your-api-token-here"  # Replace with your API token
    
    # Test with files from your uploads directory
    test_pdf_files = [
        "uploads/SYLL NguyenTranDuy.pdf",  # Vietnamese PDF in your uploads
        # Add more PDF files here as needed
    ]
    
    # Initialize processor
    processor = VietnameseOCRProcessor(
        api_url=API_URL,
        api_token=API_TOKEN,
        output_dir="ocr_output"
    )
    
    # Process each PDF file
    for pdf_file in test_pdf_files:
        if os.path.exists(pdf_file):
            logger.info(f"\n{'='*60}")
            logger.info(f"Processing: {pdf_file}")
            logger.info(f"{'='*60}")
            
            try:
                # Process PDF and optionally send to API
                results = processor.process_and_send(pdf_file)
                
                if results['success']:
                    print(f"\n✅ SUCCESS: {pdf_file}")
                    print(f"📄 Characters extracted: {results['processing_stats']['total_characters']}")
                    print(f"💾 Output file: {results['output_file']}")
                    
                    if results['api_response']:
                        print(f"📡 API response received")
                    
                else:
                    print(f"\n❌ FAILED: {pdf_file}")
                    print(f"Error: {results['error']}")
                
            except Exception as e:
                logger.error(f"Failed to process {pdf_file}: {e}")
        
        else:
            logger.warning(f"File not found: {pdf_file}")
    
    logger.info("\n🎉 Vietnamese OCR processing completed!")


if __name__ == "__main__":
    main()
