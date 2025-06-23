#!/usr/bin/env python3
"""
Comprehensive Test Suite for Python OCR Integration
Tests both the FastAPI service and CLI interface

Author: SecureDocumentIntelligence Team
Date: 2025-01-21
"""

import os
import sys
import json
import time
import requests
import tempfile
from pathlib import Path
from typing import Dict, List, Any
import asyncio
import aiohttp

# Test configuration
TEST_CONFIG = {
    'api_url': 'http://localhost:8001',
    'node_api_url': 'http://localhost:5000',
    'timeout': 30,
    'test_files': [
        'test_vietnamese.pdf',
        'test_english.pdf'
    ]
}

class OCRIntegrationTest:
    """Comprehensive test suite for OCR integration"""
    
    def __init__(self):
        self.results = []
        self.passed = 0
        self.failed = 0
        
    def log_test(self, test_name: str, success: bool, message: str = "", details: Any = None):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if message:
            print(f"    {message}")
        
        self.results.append({
            'test': test_name,
            'success': success,
            'message': message,
            'details': details,
            'timestamp': time.time()
        })
        
        if success:
            self.passed += 1
        else:
            self.failed += 1
    
    async def test_python_service_health(self):
        """Test Python OCR service health endpoint"""
        try:
            response = requests.get(f"{TEST_CONFIG['api_url']}/health", timeout=5)
            
            if response.status_code == 200:
                health_data = response.json()
                if health_data.get('status') == 'healthy':
                    self.log_test("Python Service Health", True, f"Service healthy, Tesseract: {health_data.get('tesseract_version', 'Unknown')}")
                else:
                    self.log_test("Python Service Health", False, f"Service unhealthy: {health_data}")
            else:
                self.log_test("Python Service Health", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Python Service Health", False, f"Connection failed: {str(e)}")
    
    async def test_node_ocr_health(self):
        """Test Node.js OCR health endpoint"""
        try:
            response = requests.get(f"{TEST_CONFIG['node_api_url']}/api/ocr/health", timeout=5)
            
            if response.status_code == 200:
                health_data = response.json()
                if health_data.get('status') == 'healthy':
                    self.log_test("Node.js OCR Health", True, "Integration layer healthy")
                else:
                    self.log_test("Node.js OCR Health", False, f"Integration unhealthy: {health_data}")
            else:
                self.log_test("Node.js OCR Health", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Node.js OCR Health", False, f"Connection failed: {str(e)}")
    
    async def test_supported_languages(self):
        """Test supported languages endpoint"""
        try:
            # Test Python service
            response = requests.get(f"{TEST_CONFIG['api_url']}/ocr/languages", timeout=5)
            if response.status_code == 200:
                languages = response.json().get('languages', [])
                if 'vie' in languages and 'eng' in languages:
                    self.log_test("Supported Languages", True, f"Languages: {', '.join(languages[:10])}")
                else:
                    self.log_test("Supported Languages", False, f"Missing Vietnamese or English: {languages}")
            else:
                self.log_test("Supported Languages", False, f"HTTP {response.status_code}")
        except Exception as e:
            self.log_test("Supported Languages", False, f"Request failed: {str(e)}")
    
    async def create_test_pdf(self, content: str, filename: str) -> Path:
        """Create a simple test PDF with text content"""
        try:
            from reportlab.pdfgen import canvas
            from reportlab.lib.pagesizes import letter
            
            temp_dir = Path(tempfile.gettempdir())
            pdf_path = temp_dir / filename
            
            c = canvas.Canvas(str(pdf_path), pagesize=letter)
            width, height = letter
            
            # Add text content
            c.drawString(100, height - 100, content)
            c.save()
            
            return pdf_path
        except ImportError:
            # Fallback: create a simple text file for testing
            temp_dir = Path(tempfile.gettempdir())
            txt_path = temp_dir / filename.replace('.pdf', '.txt')
            with open(txt_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return txt_path
    
    async def test_single_file_processing(self):
        """Test single file OCR processing"""
        try:
            # Create test content
            vietnamese_text = "Xin chào! Đây là văn bản tiếng Việt để kiểm tra OCR."
            test_file = await self.create_test_pdf(vietnamese_text, "test_vietnamese.pdf")
            
            if test_file.suffix == '.txt':
                # If we couldn't create PDF, skip this test
                self.log_test("Single File Processing", False, "Could not create test PDF (reportlab not available)")
                return
            
            # Test Python service directly
            with open(test_file, 'rb') as f:
                files = {'file': ('test.pdf', f, 'application/pdf')}
                data = {'language': 'vie', 'confidence_threshold': 60.0}
                
                response = requests.post(
                    f"{TEST_CONFIG['api_url']}/ocr/process",
                    files=files,
                    data=data,
                    timeout=30
                )
            
            if response.status_code == 200:
                result = response.json()
                if result.get('success') and result.get('text'):
                    self.log_test("Single File Processing", True, 
                                f"Processed {result.get('pageCount', 1)} pages, "
                                f"confidence: {result.get('confidence', 0):.1f}%")
                else:
                    self.log_test("Single File Processing", False, f"Processing failed: {result}")
            else:
                self.log_test("Single File Processing", False, f"HTTP {response.status_code}: {response.text}")
            
            # Clean up test file
            test_file.unlink(missing_ok=True)
            
        except Exception as e:
            self.log_test("Single File Processing", False, f"Test failed: {str(e)}")
    
    async def test_cli_interface(self):
        """Test CLI interface"""
        try:
            import subprocess
            
            # Test CLI health check
            result = subprocess.run(
                ['python', 'python-ocr-service/cli.py', 'health'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                health_data = json.loads(result.stdout)
                if health_data.get('status') == 'healthy':
                    self.log_test("CLI Interface", True, "CLI health check passed")
                else:
                    self.log_test("CLI Interface", False, f"CLI unhealthy: {health_data}")
            else:
                self.log_test("CLI Interface", False, f"CLI failed: {result.stderr}")
        
        except Exception as e:
            self.log_test("CLI Interface", False, f"CLI test failed: {str(e)}")
    
    async def test_node_integration(self):
        """Test Node.js to Python integration"""
        try:
            # Test service info endpoint
            response = requests.get(f"{TEST_CONFIG['node_api_url']}/api/ocr/info", timeout=5)
            
            if response.status_code == 200:
                info = response.json()
                if info.get('success') and info.get('service'):
                    service_info = info['service']
                    features = service_info.get('features', [])
                    if 'Vietnamese PDF OCR' in features:
                        self.log_test("Node.js Integration", True, 
                                    f"Service: {service_info.get('name', 'Unknown')}, "
                                    f"Features: {len(features)}")
                    else:
                        self.log_test("Node.js Integration", False, "Vietnamese OCR feature missing")
                else:
                    self.log_test("Node.js Integration", False, f"Invalid response: {info}")
            else:
                self.log_test("Node.js Integration", False, f"HTTP {response.status_code}")
        
        except Exception as e:
            self.log_test("Node.js Integration", False, f"Integration test failed: {str(e)}")
    
    async def test_performance(self):
        """Test basic performance metrics"""
        try:
            start_time = time.time()
            
            # Simple health check performance
            response = requests.get(f"{TEST_CONFIG['api_url']}/health", timeout=5)
            
            response_time = (time.time() - start_time) * 1000  # Convert to milliseconds
            
            if response.status_code == 200 and response_time < 1000:  # Under 1 second
                self.log_test("Performance Test", True, f"Health check: {response_time:.1f}ms")
            else:
                self.log_test("Performance Test", False, f"Slow response: {response_time:.1f}ms")
        
        except Exception as e:
            self.log_test("Performance Test", False, f"Performance test failed: {str(e)}")
    
    async def test_error_handling(self):
        """Test error handling"""
        try:
            # Test with invalid file
            response = requests.post(
                f"{TEST_CONFIG['api_url']}/ocr/process",
                files={'file': ('test.txt', b'invalid content', 'text/plain')},
                timeout=10
            )
            
            # Should return 400 for invalid file type
            if response.status_code == 400:
                self.log_test("Error Handling", True, "Correctly rejected invalid file type")
            else:
                self.log_test("Error Handling", False, f"Unexpected response: {response.status_code}")
        
        except Exception as e:
            self.log_test("Error Handling", False, f"Error handling test failed: {str(e)}")
    
    async def run_all_tests(self):
        """Run all integration tests"""
        print("🧪 Starting OCR Integration Test Suite")
        print("=" * 50)
        
        # Service availability tests
        await self.test_python_service_health()
        await self.test_node_ocr_health()
        
        # Feature tests
        await self.test_supported_languages()
        await self.test_single_file_processing()
        await self.test_cli_interface()
        await self.test_node_integration()
        
        # Performance and reliability tests
        await self.test_performance()
        await self.test_error_handling()
        
        # Summary
        print("\n" + "=" * 50)
        print(f"📊 Test Results: {self.passed} passed, {self.failed} failed")
        
        if self.failed == 0:
            print("🎉 All tests passed! OCR integration is working correctly.")
            return True
        else:
            print(f"❌ {self.failed} test(s) failed. Please check the issues above.")
            return False
    
    def save_results(self, filename: str = "ocr_test_results.json"):
        """Save test results to file"""
        with open(filename, 'w') as f:
            json.dump({
                'timestamp': time.time(),
                'summary': {
                    'passed': self.passed,
                    'failed': self.failed,
                    'total': len(self.results)
                },
                'results': self.results
            }, f, indent=2)
        print(f"📄 Test results saved to {filename}")

async def main():
    """Main test runner"""
    print("🚀 OCR Integration Test Suite")
    print("Testing Python OCR service integration with Node.js application")
    print("")
    
    # Check if services are running
    print("🔍 Checking service availability...")
    
    try:
        # Quick check for Python service
        requests.get(TEST_CONFIG['api_url'] + '/health', timeout=2)
        print("✅ Python OCR service is running")
    except:
        print("❌ Python OCR service is not running on port 8001")
        print("   Please start it with: python python-ocr-service/app.py")
        return False
    
    try:
        # Quick check for Node.js service
        requests.get(TEST_CONFIG['node_api_url'] + '/api/system/status', timeout=2)
        print("✅ Node.js application is running")
    except:
        print("❌ Node.js application is not running on port 5000")
        print("   Please start it with: npm run dev")
        return False
    
    print("")
    
    # Run tests
    test_suite = OCRIntegrationTest()
    success = await test_suite.run_all_tests()
    
    # Save results
    test_suite.save_results()
    
    return success

if __name__ == "__main__":
    try:
        success = asyncio.run(main())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n🛑 Tests interrupted by user")
        sys.exit(130)
    except Exception as e:
        print(f"\n💥 Test suite failed: {str(e)}")
        sys.exit(1)
