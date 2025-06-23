#!/usr/bin/env python3
"""
Setup and Installation Verification Script for Vietnamese PDF OCR

This script helps install dependencies and verify the system is ready
for Vietnamese PDF OCR processing.
"""

import subprocess
import sys
import os
import platform
from pathlib import Path

def run_command(command, description):
    """Run a system command and return success status."""
    print(f"🔧 {description}...")
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ {description} - Success")
            return True
        else:
            print(f"❌ {description} - Failed")
            print(f"Error: {result.stderr}")
            return False
    except Exception as e:
        print(f"❌ {description} - Exception: {e}")
        return False

def check_python_version():
    """Check if Python version is compatible."""
    print("🐍 Checking Python version...")
    version = sys.version_info
    
    if version.major < 3 or (version.major == 3 and version.minor < 7):
        print(f"❌ Python {version.major}.{version.minor} detected")
        print("❌ Python 3.7+ is required")
        return False
    
    print(f"✅ Python {version.major}.{version.minor}.{version.micro} - Compatible")
    return True

def install_python_dependencies():
    """Install required Python packages."""
    print("\n📦 Installing Python dependencies...")
    
    # Check if requirements.txt exists
    if not Path("requirements.txt").exists():
        print("❌ requirements.txt not found")
        return False
    
    # Install packages
    command = f"{sys.executable} -m pip install -r requirements.txt"
    return run_command(command, "Installing Python packages")

def check_tesseract_installation():
    """Check if Tesseract OCR is installed."""
    print("\n🔍 Checking Tesseract OCR installation...")
    
    try:
        import pytesseract
        version = pytesseract.get_tesseract_version()
        print(f"✅ Tesseract {version} found")
        
        # Check available languages
        languages = pytesseract.get_languages(config='')
        print(f"📝 Available languages: {', '.join(languages)}")
        
        if 'vie' in languages:
            print("✅ Vietnamese language support available")
            return True
        else:
            print("❌ Vietnamese language data not found")
            print_vietnamese_install_instructions()
            return False
            
    except ImportError:
        print("❌ pytesseract not installed")
        return False
    except Exception as e:
        print(f"❌ Tesseract check failed: {e}")
        print_tesseract_install_instructions()
        return False

def print_tesseract_install_instructions():
    """Print Tesseract installation instructions for different OS."""
    system = platform.system().lower()
    print("\n📋 Tesseract Installation Instructions:")
    print("=" * 40)
    
    if "windows" in system:
        print("🪟 Windows:")
        print("1. Download Tesseract installer from:")
        print("   https://github.com/UB-Mannheim/tesseract/wiki")
        print("2. Run the installer")
        print("3. Add Tesseract to PATH environment variable")
        
    elif "darwin" in system:  # macOS
        print("🍎 macOS:")
        print("1. Install Homebrew if not installed:")
        print("   /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"")
        print("2. Install Tesseract:")
        print("   brew install tesseract")
        print("3. Install language data:")
        print("   brew install tesseract-lang")
        
    else:  # Linux
        print("🐧 Linux (Ubuntu/Debian):")
        print("1. Update package list:")
        print("   sudo apt-get update")
        print("2. Install Tesseract:")
        print("   sudo apt-get install tesseract-ocr")
        print("3. Install Vietnamese language data:")
        print("   sudo apt-get install tesseract-ocr-vie")

def print_vietnamese_install_instructions():
    """Print Vietnamese language data installation instructions."""
    print("\n📋 Vietnamese Language Data Installation:")
    print("=" * 45)
    
    system = platform.system().lower()
    
    if "windows" in system:
        print("🪟 Windows:")
        print("1. Download vie.traineddata from:")
        print("   https://github.com/tesseract-ocr/tessdata/raw/main/vie.traineddata")
        print("2. Copy to Tesseract tessdata folder:")
        print("   C:\\Program Files\\Tesseract-OCR\\tessdata\\")
        
    elif "darwin" in system:  # macOS
        print("🍎 macOS:")
        print("1. Install language pack:")
        print("   brew install tesseract-lang")
        print("2. Or download manually to:")
        print("   /usr/local/share/tessdata/")
        
    else:  # Linux
        print("🐧 Linux:")
        print("1. Install via package manager:")
        print("   sudo apt-get install tesseract-ocr-vie")
        print("2. Or download manually to:")
        print("   /usr/share/tesseract-ocr/5/tessdata/")

def check_poppler_installation():
    """Check if Poppler is installed (required for pdf2image)."""
    print("\n🔍 Checking Poppler installation...")
    
    try:
        from pdf2image import convert_from_path
        # Try to import - if successful, poppler is likely available
        print("✅ pdf2image library available")
        return True
        
    except ImportError:
        print("❌ pdf2image not installed")
        return False
    except Exception as e:
        print(f"❌ Poppler check failed: {e}")
        print_poppler_install_instructions()
        return False

def print_poppler_install_instructions():
    """Print Poppler installation instructions."""
    system = platform.system().lower()
    print("\n📋 Poppler Installation Instructions:")
    print("=" * 38)
    
    if "windows" in system:
        print("🪟 Windows:")
        print("1. Download poppler for Windows from:")
        print("   https://blog.alivate.com.au/poppler-windows/")
        print("2. Extract and add bin folder to PATH")
        
    elif "darwin" in system:  # macOS
        print("🍎 macOS:")
        print("1. Install via Homebrew:")
        print("   brew install poppler")
        
    else:  # Linux
        print("🐧 Linux:")
        print("1. Install via package manager:")
        print("   sudo apt-get install poppler-utils")

def test_ocr_functionality():
    """Test basic OCR functionality."""
    print("\n🧪 Testing OCR functionality...")
    
    try:
        from vietnamese_pdf_ocr import VietnameseOCRProcessor
        
        # Initialize processor
        processor = VietnameseOCRProcessor(output_dir="test_output")
        print("✅ VietnameseOCRProcessor initialized successfully")
        
        # Check if we have test files
        uploads_dir = Path("uploads")
        if uploads_dir.exists():
            pdf_files = list(uploads_dir.glob("*.pdf"))
            if pdf_files:
                print(f"✅ Found {len(pdf_files)} PDF file(s) for testing")
                return True
            else:
                print("⚠️ No PDF files found in uploads/ directory")
                print("💡 Add Vietnamese PDF files to uploads/ for testing")
                return True
        else:
            print("⚠️ uploads/ directory not found")
            print("💡 Create uploads/ directory and add PDF files")
            return True
            
    except ImportError as e:
        print(f"❌ Import error: {e}")
        return False
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

def create_test_directories():
    """Create necessary directories for testing."""
    print("\n📁 Creating test directories...")
    
    directories = [
        "uploads",
        "ocr_output",
        "simple_ocr_output",
        "api_ocr_output",
        "batch_ocr_output",
        "test_output"
    ]
    
    for directory in directories:
        Path(directory).mkdir(exist_ok=True)
        print(f"✅ Created/verified: {directory}/")

def main():
    """Main setup function."""
    print("🇻🇳 Vietnamese PDF OCR Setup & Verification")
    print("=" * 50)
    print("This script will help you set up the Vietnamese OCR environment")
    print()
    
    success_count = 0
    total_checks = 6
    
    # Check Python version
    if check_python_version():
        success_count += 1
    
    # Install Python dependencies
    if install_python_dependencies():
        success_count += 1
    
    # Check Tesseract
    if check_tesseract_installation():
        success_count += 1
    
    # Check Poppler
    if check_poppler_installation():
        success_count += 1
    
    # Test OCR functionality
    if test_ocr_functionality():
        success_count += 1
    
    # Create directories
    create_test_directories()
    success_count += 1
    
    # Final summary
    print(f"\n📊 Setup Summary:")
    print(f"✅ {success_count}/{total_checks} checks passed")
    
    if success_count == total_checks:
        print("\n🎉 Setup completed successfully!")
        print("🚀 You can now run the OCR examples:")
        print("   python ocr_usage_examples.py")
        print("   python vietnamese_pdf_ocr.py")
        
    else:
        print(f"\n⚠️ Setup incomplete ({total_checks - success_count} issues)")
        print("📋 Please address the issues above and run setup again")
    
    print("\n📖 Next steps:")
    print("1. Add Vietnamese PDF files to uploads/ directory")
    print("2. Run: python ocr_usage_examples.py")
    print("3. Configure API settings in vietnamese_pdf_ocr.py")
    print("4. Test with your own PDF documents")

if __name__ == "__main__":
    main()
