# Install Tesseract OCR for Windows
# This script downloads and installs Tesseract OCR with Vietnamese language support

Write-Host "=== Installing Tesseract OCR for Windows ===" -ForegroundColor Green

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")

if (-not $isAdmin) {
    Write-Host "Please run this script as Administrator" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    pause
    exit 1
}

# Download URLs
$tesseractUrl = "https://github.com/UB-Mannheim/tesseract/releases/download/v5.3.0.20221214/tesseract-ocr-w64-setup-5.3.0.20221214.exe"
$tempDir = "$env:TEMP\tesseract-setup"

# Create temp directory
if (!(Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
}

Write-Host "Downloading Tesseract OCR..." -ForegroundColor Yellow
$installerPath = "$tempDir\tesseract-setup.exe"

try {
    # Download Tesseract installer
    Invoke-WebRequest -Uri $tesseractUrl -OutFile $installerPath -UseBasicParsing
    Write-Host "Download completed!" -ForegroundColor Green
    
    # Install Tesseract with Vietnamese language support
    Write-Host "Installing Tesseract OCR..." -ForegroundColor Yellow
    Write-Host "Please select 'Additional language data' and include Vietnamese (vie) during installation" -ForegroundColor Cyan
    
    # Run installer
    Start-Process -FilePath $installerPath -Wait
    
    # Add to PATH
    $tesseractPath = "C:\Program Files\Tesseract-OCR"
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    
    if ($currentPath -notlike "*$tesseractPath*") {
        Write-Host "Adding Tesseract to system PATH..." -ForegroundColor Yellow
        [Environment]::SetEnvironmentVariable("PATH", "$currentPath;$tesseractPath", "Machine")
        Write-Host "Tesseract added to PATH!" -ForegroundColor Green
    }
    
    # Verify installation
    Write-Host "Verifying installation..." -ForegroundColor Yellow
    
    # Refresh environment variables for current session
    $env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine")
    
    # Test Tesseract
    try {
        $version = & "$tesseractPath\tesseract.exe" --version 2>&1
        Write-Host "Tesseract installed successfully!" -ForegroundColor Green
        Write-Host $version[0] -ForegroundColor Cyan
          # Test Vietnamese language support
        $languages = & "$tesseractPath\tesseract.exe" --list-langs 2>&1
        if ($languages -contains "vie") {
            Write-Host "Vietnamese language support: ✓ AVAILABLE" -ForegroundColor Green
        } else {
            Write-Host "Vietnamese language support: ✗ NOT FOUND" -ForegroundColor Red
            Write-Host "You may need to reinstall and select Vietnamese language data" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "Installation verification failed: $_" -ForegroundColor Red
    }
    
    # Cleanup
    Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    
    Write-Host "`n=== Installation Complete ===" -ForegroundColor Green
    Write-Host "Please restart your terminal/PowerShell for PATH changes to take effect" -ForegroundColor Yellow
    Write-Host "Then restart your Python OCR service" -ForegroundColor Yellow
    
} catch {
    Write-Host "Error during installation: $_" -ForegroundColor Red
    Write-Host "Please try installing manually from: https://github.com/UB-Mannheim/tesseract/releases" -ForegroundColor Yellow
}
}

pause
