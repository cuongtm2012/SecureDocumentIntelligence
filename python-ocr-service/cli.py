#!/usr/bin/env python3
"""
Vietnamese OCR Service - Command Line Interface
Alternative CLI interface for the OCR service when FastAPI is not available

Usage:
    python cli.py process --file document.pdf --output results.txt
    python cli.py batch --input-dir ./pdfs --output-dir ./results
    python cli.py health

Author: SecureDocumentIntelligence Team
Date: 2025-01-21
"""

import os
import sys
import argparse
import json
import logging
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

# Import the OCR processor from the original script
sys.path.append(str(Path(__file__).parent.parent))
from vietnamese_pdf_ocr import VietnameseOCRProcessor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class OCRCLIService:
    """Command line interface for Vietnamese OCR service"""
    
    def __init__(self):
        self.ocr_processor = VietnameseOCRProcessor()
    
    def process_single_file(self, file_path: str, output_path: str = None, 
                           confidence_threshold: float = 60.0) -> Dict[str, Any]:
        """
        Process a single PDF file
        
        Args:
            file_path: Path to PDF file
            output_path: Output text file path
            confidence_threshold: Minimum OCR confidence
            
        Returns:
            Processing results dictionary
        """
        try:
            file_path = Path(file_path)
            if not file_path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")
            
            if not output_path:
                output_path = file_path.with_suffix('.txt')
            
            # Process the PDF
            result = self.ocr_processor.process_pdf(
                pdf_path=str(file_path),
                output_path=str(output_path)
            )
            
            logger.info(f"✅ Processed {file_path.name} -> {output_path}")
            
            return {
                "success": True,
                "input_file": str(file_path),
                "output_file": str(output_path),
                "result": result
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to process {file_path}: {e}")
            return {
                "success": False,
                "input_file": str(file_path),
                "error": str(e)
            }
    
    def process_batch_files(self, input_dir: str, output_dir: str = None,
                           confidence_threshold: float = 60.0) -> List[Dict[str, Any]]:
        """
        Process multiple PDF files in a directory
        
        Args:
            input_dir: Directory containing PDF files
            output_dir: Directory for output text files
            confidence_threshold: Minimum OCR confidence
            
        Returns:
            List of processing results
        """
        input_dir = Path(input_dir)
        if not input_dir.exists():
            raise FileNotFoundError(f"Input directory not found: {input_dir}")
        
        if not output_dir:
            output_dir = input_dir / "ocr_results"
        
        output_dir = Path(output_dir)
        output_dir.mkdir(exist_ok=True)
        
        # Find all PDF files
        pdf_files = list(input_dir.glob("*.pdf")) + list(input_dir.glob("*.PDF"))
        
        if not pdf_files:
            logger.warning(f"No PDF files found in {input_dir}")
            return []
        
        logger.info(f"Found {len(pdf_files)} PDF files to process")
        
        # Process each file
        results = []
        for i, pdf_file in enumerate(pdf_files):
            logger.info(f"Processing {i+1}/{len(pdf_files)}: {pdf_file.name}")
            
            output_file = output_dir / f"{pdf_file.stem}.txt"
            result = self.process_single_file(
                file_path=str(pdf_file),
                output_path=str(output_file),
                confidence_threshold=confidence_threshold
            )
            results.append(result)
        
        # Save batch results summary
        summary_file = output_dir / f"batch_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(summary_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        
        successful = sum(1 for r in results if r['success'])
        logger.info(f"✅ Batch processing completed: {successful}/{len(results)} files successful")
        logger.info(f"Summary saved to: {summary_file}")
        
        return results
    
    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check on OCR service
        
        Returns:
            Health status information
        """
        try:
            # Test Tesseract installation
            import pytesseract
            tesseract_version = pytesseract.get_tesseract_version()
            available_languages = pytesseract.get_languages(config='')
            
            health_info = {
                "status": "healthy",
                "service": "Vietnamese OCR CLI Service",
                "timestamp": datetime.now().isoformat(),
                "tesseract_version": str(tesseract_version),
                "available_languages": list(available_languages),
                "vietnamese_support": "vie" in available_languages
            }
            
            if "vie" in available_languages:
                logger.info("✅ OCR service is healthy - Vietnamese support available")
            else:
                logger.warning("⚠️ Vietnamese language pack not found")
                health_info["status"] = "warning"
            
            return health_info
            
        except Exception as e:
            logger.error(f"❌ Health check failed: {e}")
            return {
                "status": "unhealthy",
                "service": "Vietnamese OCR CLI Service",
                "timestamp": datetime.now().isoformat(),
                "error": str(e)
            }

def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="Vietnamese OCR Service - Command Line Interface",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python cli.py process --file document.pdf --output results.txt
    python cli.py batch --input-dir ./pdfs --output-dir ./results
    python cli.py health
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Process single file command
    process_parser = subparsers.add_parser('process', help='Process a single PDF file')
    process_parser.add_argument('--file', '-f', required=True, help='PDF file to process')
    process_parser.add_argument('--output', '-o', help='Output text file path')
    process_parser.add_argument('--confidence', '-c', type=float, default=60.0,
                               help='Minimum OCR confidence threshold (default: 60.0)')
    
    # Batch process command
    batch_parser = subparsers.add_parser('batch', help='Process multiple PDF files')
    batch_parser.add_argument('--input-dir', '-i', required=True, 
                             help='Directory containing PDF files')
    batch_parser.add_argument('--output-dir', '-o', 
                             help='Directory for output files (default: input_dir/ocr_results)')
    batch_parser.add_argument('--confidence', '-c', type=float, default=60.0,
                             help='Minimum OCR confidence threshold (default: 60.0)')
    
    # Health check command
    health_parser = subparsers.add_parser('health', help='Check OCR service health')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    # Initialize CLI service
    cli_service = OCRCLIService()
    
    try:
        if args.command == 'process':
            result = cli_service.process_single_file(
                file_path=args.file,
                output_path=args.output,
                confidence_threshold=args.confidence
            )
            print(json.dumps(result, indent=2, ensure_ascii=False))
            sys.exit(0 if result['success'] else 1)
        
        elif args.command == 'batch':
            results = cli_service.process_batch_files(
                input_dir=args.input_dir,
                output_dir=args.output_dir,
                confidence_threshold=args.confidence
            )
            successful = sum(1 for r in results if r['success'])
            print(f"Batch processing completed: {successful}/{len(results)} files successful")
            sys.exit(0 if successful == len(results) else 1)
        
        elif args.command == 'health':
            health_info = cli_service.health_check()
            print(json.dumps(health_info, indent=2, ensure_ascii=False))
            sys.exit(0 if health_info['status'] == 'healthy' else 1)
    
    except KeyboardInterrupt:
        logger.info("Operation cancelled by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
