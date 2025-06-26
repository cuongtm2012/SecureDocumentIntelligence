@echo off
REM ========================================
REM Python OCR Service Setup for Windows
REM ========================================

echo.
echo ===========================================
echo  Python OCR Service Setup for Windows
echo ===========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/downloads/
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

echo [OK] Python is installed
python --version

REM Check if we're in the right directory
if not exist "python-ocr-service" (
    echo [ERROR] Please run this script from the SecureDocumentIntelligence root directory
    pause
    exit /b 1
)

echo [OK] Found python-ocr-service directory

REM Create virtual environment if it doesn't exist
if not exist "python-ocr-env" (
    echo [INFO] Creating Python virtual environment...
    python -m venv python-ocr-env
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
    echo [OK] Virtual environment created
) else (
    echo [OK] Virtual environment already exists
)

REM Activate virtual environment
echo [INFO] Activating virtual environment...
call python-ocr-env\Scripts\activate.bat

REM Upgrade pip
echo [INFO] Upgrading pip...
python -m pip install --upgrade pip

REM Install dependencies
echo [INFO] Installing Python dependencies...
cd python-ocr-service
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed

REM Install additional Windows-specific packages
echo [INFO] Installing Windows-specific packages...
pip install python-magic-bin wheel

REM Check if Tesseract is installed
tesseract --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Tesseract OCR is not installed or not in PATH
    echo Please install Tesseract from:
    echo https://github.com/UB-Mannheim/tesseract/wiki
    echo.
    echo After installation, add to PATH:
    echo C:\Program Files\Tesseract-OCR\
    echo.
    pause
) else (
    echo [OK] Tesseract OCR is installed
    tesseract --version
)

REM Check if Poppler is installed
pdftoppm -h >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [WARNING] Poppler is not installed or not in PATH
    echo Please install Poppler from:
    echo https://blog.alivate.com.au/poppler-windows/
    echo.
    echo After installation, add to PATH:
    echo C:\Program Files\poppler-XX.XX.X\bin\
    echo.
    pause
) else (
    echo [OK] Poppler is installed
)

echo.
echo ===========================================
echo  Setup Complete!
echo ===========================================
echo.
echo To start the OCR service, run:
echo   python app.py
echo.
echo Or use uvicorn:
echo   uvicorn app:app --host 0.0.0.0 --port 8001 --reload
echo.
echo Service will be available at:
echo   http://localhost:8001
echo.
echo Health check URL:
echo   http://localhost:8001/health
echo.

pause
