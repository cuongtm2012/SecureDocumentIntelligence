# OCR System Startup Script
# Professional setup and testing script for Windows PowerShell

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "prod", "test", "docker")]
    [string]$Mode = "dev",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipInstall,
    
    [Parameter(Mandatory=$false)]
    [switch]$CleanStart
)

Write-Host "🚀 SecureDocumentIntelligence OCR System Startup" -ForegroundColor Green
Write-Host "=================================================" -ForegroundColor Green

# Function to check if a command exists
function Test-Command($CommandName) {
    try {
        Get-Command $CommandName -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# Function to check if a port is available
function Test-Port($Port) {
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

# Function to wait for service to be ready
function Wait-ForService($Url, $ServiceName, $MaxWaitSeconds = 60) {
    Write-Host "⏳ Waiting for $ServiceName to be ready..." -ForegroundColor Yellow
    
    $attempts = 0
    $maxAttempts = $MaxWaitSeconds
    
    while ($attempts -lt $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ $ServiceName is ready!" -ForegroundColor Green
                return $true
            }
        } catch {
            # Service not ready yet
        }
        
        Start-Sleep -Seconds 1
        $attempts++
        Write-Progress -Activity "Waiting for $ServiceName" -Status "Attempt $attempts/$maxAttempts" -PercentComplete (($attempts / $maxAttempts) * 100)
    }
    
    Write-Host "❌ $ServiceName failed to start within $MaxWaitSeconds seconds" -ForegroundColor Red
    return $false
}

# Check prerequisites
Write-Host "🔍 Checking prerequisites..." -ForegroundColor Cyan

# Check Node.js
if (-not (Test-Command "node")) {
    Write-Host "❌ Node.js is not installed. Please install Node.js 18+ from https://nodejs.org" -ForegroundColor Red
    exit 1
}

$nodeVersion = node --version
Write-Host "✅ Node.js version: $nodeVersion" -ForegroundColor Green

# Check Python
if (-not (Test-Command "python")) {
    Write-Host "❌ Python is not installed. Please install Python 3.8+ from https://python.org" -ForegroundColor Red
    exit 1
}

$pythonVersion = python --version
Write-Host "✅ Python version: $pythonVersion" -ForegroundColor Green

# Check Docker for docker mode
if ($Mode -eq "docker") {
    if (-not (Test-Command "docker")) {
        Write-Host "❌ Docker is not installed. Please install Docker Desktop" -ForegroundColor Red
        exit 1
    }
    
    if (-not (Test-Command "docker-compose")) {
        Write-Host "❌ Docker Compose is not installed. Please install Docker Compose" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Docker and Docker Compose are available" -ForegroundColor Green
}

# Clean start option
if ($CleanStart) {
    Write-Host "🧹 Cleaning previous installations..." -ForegroundColor Yellow
    
    if (Test-Path "node_modules") {
        Remove-Item -Recurse -Force "node_modules"
    }
    
    if (Test-Path "python-ocr-service/__pycache__") {
        Remove-Item -Recurse -Force "python-ocr-service/__pycache__"
    }
    
    Write-Host "✅ Cleanup completed" -ForegroundColor Green
}

# Install dependencies
if (-not $SkipInstall) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
    
    # Install Node.js dependencies
    Write-Host "Installing Node.js dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install Node.js dependencies" -ForegroundColor Red
        exit 1
    }
    
    # Install Python dependencies
    Write-Host "Installing Python OCR service dependencies..." -ForegroundColor Yellow
    Set-Location "python-ocr-service"
    python -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install Python dependencies" -ForegroundColor Red
        exit 1
    }
    Set-Location ".."
    
    Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "⏭️ Skipping dependency installation" -ForegroundColor Yellow
}

# Check Tesseract and Vietnamese language data
Write-Host "🔤 Checking Tesseract OCR..." -ForegroundColor Cyan

try {
    python -c "import pytesseract; print('Tesseract version:', pytesseract.get_tesseract_version())"
    
    $languages = python -c "import pytesseract; print(' '.join(pytesseract.get_languages()))"
    Write-Host "Available languages: $languages" -ForegroundColor Yellow
    
    if ($languages -match "vie") {
        Write-Host "✅ Vietnamese language support is available" -ForegroundColor Green
    } else {
        Write-Host "⚠️ Vietnamese language data not found. OCR may not work optimally for Vietnamese text." -ForegroundColor Yellow
        Write-Host "To install Vietnamese language data:" -ForegroundColor Yellow
        Write-Host "1. Download vie.traineddata from https://github.com/tesseract-ocr/tessdata" -ForegroundColor Yellow
        Write-Host "2. Copy it to your Tesseract tessdata folder" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️ Tesseract OCR check failed. This may affect OCR functionality." -ForegroundColor Yellow
}

# Start services based on mode
switch ($Mode) {
    "docker" {
        Write-Host "🐳 Starting services with Docker..." -ForegroundColor Cyan
        
        # Check if ports are available
        $ports = @(5000, 8001, 5432, 6379)
        foreach ($port in $ports) {
            if (-not (Test-Port $port)) {
                Write-Host "❌ Port $port is already in use. Please stop the conflicting service." -ForegroundColor Red
                exit 1
            }
        }
        
        # Start Docker services
        docker-compose up --build -d
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Docker services started successfully" -ForegroundColor Green
            
            # Wait for services to be ready
            Wait-ForService "http://localhost:8001/health" "Python OCR Service"
            Wait-ForService "http://localhost:5000/api/system/status" "Main Application"
            
            Write-Host "🌐 Application URLs:" -ForegroundColor Green
            Write-Host "   Main App: http://localhost:5000" -ForegroundColor White
            Write-Host "   OCR API:  http://localhost:8001" -ForegroundColor White
            
        } else {
            Write-Host "❌ Failed to start Docker services" -ForegroundColor Red
            exit 1
        }
    }
    
    "prod" {
        Write-Host "🏭 Starting production build..." -ForegroundColor Cyan
        
        # Build the application
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ Failed to build application" -ForegroundColor Red
            exit 1
        }
        
        # Start Python OCR service in background
        Write-Host "Starting Python OCR service..." -ForegroundColor Yellow
        Start-Process -FilePath "python" -ArgumentList "python-ocr-service/app.py" -WindowStyle Hidden
        
        # Wait for Python service
        Wait-ForService "http://localhost:8001/health" "Python OCR Service"
        
        # Start main application
        Write-Host "Starting main application..." -ForegroundColor Yellow
        $env:NODE_ENV = "production"
        npm start
    }
    
    "test" {
        Write-Host "🧪 Running test suite..." -ForegroundColor Cyan
        
        # Start services for testing
        Write-Host "Starting test services..." -ForegroundColor Yellow
        
        # Start Python OCR service
        $pythonProcess = Start-Process -FilePath "python" -ArgumentList "python-ocr-service/app.py" -PassThru -WindowStyle Hidden
        
        # Wait for service
        if (Wait-ForService "http://localhost:8001/health" "Python OCR Service") {
            # Run tests
            npm test
            $testResult = $LASTEXITCODE
            
            # Clean up
            if ($pythonProcess -and -not $pythonProcess.HasExited) {
                $pythonProcess.Kill()
            }
            
            if ($testResult -eq 0) {
                Write-Host "✅ All tests passed!" -ForegroundColor Green
            } else {
                Write-Host "❌ Some tests failed" -ForegroundColor Red
                exit 1
            }
        } else {
            Write-Host "❌ Failed to start test services" -ForegroundColor Red
            exit 1
        }
    }
    
    "dev" {
        Write-Host "🛠️ Starting development environment..." -ForegroundColor Cyan
        
        # Check if ports are available
        if (-not (Test-Port 5000)) {
            Write-Host "❌ Port 5000 is already in use. Please stop the conflicting service." -ForegroundColor Red
            exit 1
        }
        
        if (-not (Test-Port 8001)) {
            Write-Host "❌ Port 8001 is already in use. Please stop the conflicting service." -ForegroundColor Red
            exit 1
        }
        
        # Start Python OCR service in background
        Write-Host "Starting Python OCR service..." -ForegroundColor Yellow
        $pythonProcess = Start-Process -FilePath "python" -ArgumentList "python-ocr-service/app.py" -PassThru -WindowStyle Hidden
        
        # Wait for Python service to be ready
        if (Wait-ForService "http://localhost:8001/health" "Python OCR Service") {
            Write-Host "✅ Python OCR service is running on http://localhost:8001" -ForegroundColor Green
        } else {
            Write-Host "⚠️ Python OCR service may not be fully ready, but continuing..." -ForegroundColor Yellow
        }
        
        # Show startup information
        Write-Host ""
        Write-Host "🎯 Development Environment Ready!" -ForegroundColor Green
        Write-Host "=================================" -ForegroundColor Green
        Write-Host "Services:" -ForegroundColor White
        Write-Host "  🐍 Python OCR Service: http://localhost:8001" -ForegroundColor Yellow
        Write-Host "  📊 Health Check: http://localhost:8001/health" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Starting main development server..." -ForegroundColor Cyan
        Write-Host "  🌐 Main Application: http://localhost:5000" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Press Ctrl+C to stop all services" -ForegroundColor Gray
        Write-Host ""
        
        # Register cleanup on exit
        Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
            if ($pythonProcess -and -not $pythonProcess.HasExited) {
                Write-Host "🛑 Stopping Python OCR service..." -ForegroundColor Yellow
                $pythonProcess.Kill()
            }
        }
        
        # Start main development server
        try {
            $env:NODE_ENV = "development"
            npm run dev
        } finally {
            # Cleanup Python process
            if ($pythonProcess -and -not $pythonProcess.HasExited) {
                Write-Host "🛑 Stopping Python OCR service..." -ForegroundColor Yellow
                $pythonProcess.Kill()
            }
        }
    }
}

Write-Host ""
Write-Host "🎉 Startup completed!" -ForegroundColor Green
