#!/usr/bin/env python3
"""
PaddleOCR Service Startup Script
Starts the PaddleOCR service with fallback handling
"""

import sys
import subprocess
import os
import time

def check_dependencies():
    """Check if required dependencies are available"""
    missing = []
    
    try:
        import fastapi
        print("✅ FastAPI available")
    except ImportError:
        missing.append("fastapi")
        
    try:
        import uvicorn
        print("✅ Uvicorn available")
    except ImportError:
        missing.append("uvicorn")
        
    try:
        import paddleocr
        print("✅ PaddleOCR available")
    except ImportError:
        print("⚠️ PaddleOCR not available - will use mock responses")
        
    return missing

def start_service():
    """Start the PaddleOCR service"""
    print("🚀 Starting PaddleOCR Microservice...")
    
    # Check dependencies
    missing = check_dependencies()
    
    if missing:
        print(f"❌ Missing dependencies: {', '.join(missing)}")
        print("Service will start with mock OCR responses")
    
    # Change to service directory
    service_dir = os.path.join(os.getcwd(), "python-paddle-service")
    
    if not os.path.exists(service_dir):
        print("❌ PaddleOCR service directory not found")
        return False
    
    try:
        # Start the service
        print(f"Starting service in {service_dir}")
        os.chdir(service_dir)
        
        # Run the service in background
        subprocess.Popen([
            sys.executable, "app.py"
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        print("✅ PaddleOCR service started on port 8002")
        return True
        
    except Exception as e:
        print(f"❌ Failed to start service: {e}")
        return False

if __name__ == "__main__":
    success = start_service()
    if success:
        print("🎉 PaddleOCR service startup completed")
        # Wait a bit for service to initialize
        time.sleep(2)
        
        # Test the service
        try:
            import requests
            response = requests.get("http://localhost:8002/health", timeout=5)
            if response.status_code == 200:
                print("✅ Service health check passed")
            else:
                print("⚠️ Service health check failed")
        except Exception as e:
            print(f"⚠️ Could not test service: {e}")
    else:
        sys.exit(1)