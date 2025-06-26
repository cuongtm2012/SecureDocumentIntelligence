@echo off
REM ========================================
REM Start Python OCR Service
REM ========================================

echo.
echo ===========================================
echo  Starting Python OCR Service
echo ===========================================
echo.

REM Check if virtual environment exists
if not exist "python-ocr-env\Scripts\activate.bat" (
    echo [ERROR] Virtual environment not found
    echo Please run setup-ocr-windows.bat first
    pause
    exit /b 1
)

REM Check if python-ocr-service directory exists
if not exist "python-ocr-service\app.py" (
    echo [ERROR] OCR service not found
    echo Please make sure you're in the correct directory
    pause
    exit /b 1
)

REM Activate virtual environment
echo [INFO] Activating virtual environment...
call python-ocr-env\Scripts\activate.bat

REM Navigate to service directory
cd python-ocr-service

REM Check if port 8001 is available
netstat -an | find "8001" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Port 8001 appears to be in use
    echo You may see a "port already in use" error
    echo.
)

REM Set environment variables for Windows
set TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe
set TESSDATA_PREFIX=C:\Program Files\Tesseract-OCR\tessdata

echo [INFO] Starting OCR service on http://localhost:8001
echo [INFO] Press Ctrl+C to stop the service
echo.

REM Start the service with uvicorn
uvicorn app:app --host 0.0.0.0 --port 8001 --reload

REM If uvicorn fails, try with python directly
if %errorlevel% neq 0 (
    echo.
    echo [INFO] Uvicorn failed, trying with python directly...
    python app.py
)

echo.
echo [INFO] OCR service stopped
pause
