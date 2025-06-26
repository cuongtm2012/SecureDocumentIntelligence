# PDF Viewer Test Runner for Windows
# Run this script to get testing instructions and quick access

param(
    [string]$TestType = "all",
    [switch]$StartServices = $false
)

Write-Host "🧪 PDF Viewer Test Suite for Simple Browser" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Define test URLs
$testUrls = @(
    @{
        Name = "PDF Test Hub"
        Url = "http://localhost:5173/pdf-test"
        Description = "Main navigation page for all PDF tests"
        Priority = "HIGH"
    },
    @{
        Name = "Fixed PDF Viewer"
        Url = "http://localhost:5173/pdf-fixed"
        Description = "Recommended PDF viewer (START HERE)"
        Priority = "HIGH"
    },
    @{
        Name = "PDF Diagnostics"
        Url = "http://localhost:5173/pdf-diagnostics"
        Description = "System health and configuration checks"
        Priority = "MEDIUM"
    },
    @{
        Name = "Debug PDF Viewer"
        Url = "http://localhost:5173/pdf-debug"
        Description = "Advanced debugging with console logging"
        Priority = "MEDIUM"
    },
    @{
        Name = "Simple PDF Viewer"
        Url = "http://localhost:5173/pdf-simple"
        Description = "Basic PDF viewer for minimal testing"
        Priority = "LOW"
    },
    @{
        Name = "Original PDF Demo"
        Url = "http://localhost:5173/pdf-demo"
        Description = "Legacy demo with external PDF support"
        Priority = "LOW"
    }
)

# Start services if requested
if ($StartServices) {
    Write-Host "🚀 Starting development services..." -ForegroundColor Yellow
    Start-Process PowerShell -ArgumentList "-Command", "cd '$PSScriptRoot'; npm run dev:frontend" -WindowStyle Minimized
    Start-Sleep 3
    Write-Host "✅ Frontend service started" -ForegroundColor Green
}

# Display test URLs
Write-Host "📋 Available Test Pages:" -ForegroundColor Green
Write-Host ""

foreach ($test in $testUrls) {
    $priorityColor = switch ($test.Priority) {
        "HIGH" { "Red" }
        "MEDIUM" { "Yellow" }
        "LOW" { "Gray" }
    }
    
    Write-Host "🔗 $($test.Name)" -ForegroundColor White
    Write-Host "   Priority: $($test.Priority)" -ForegroundColor $priorityColor
    Write-Host "   URL: $($test.Url)" -ForegroundColor Cyan
    Write-Host "   Description: $($test.Description)" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "🌐 How to Open in VS Code Simple Browser:" -ForegroundColor Green
Write-Host "1. Press Ctrl+Shift+P to open Command Palette"
Write-Host "2. Type 'Simple Browser: Show'"
Write-Host "3. Paste any URL from above"
Write-Host "4. Press Enter to open"
Write-Host ""

Write-Host "🧪 Recommended Testing Sequence:" -ForegroundColor Yellow
Write-Host "1. 📊 Start with PDF Test Hub (overview)"
Write-Host "2. 🔧 Test Fixed PDF Viewer (main functionality)"
Write-Host "3. 📋 Check PDF Diagnostics (if issues occur)"
Write-Host "4. 🐛 Use Debug Viewer (for troubleshooting)"
Write-Host ""

Write-Host "📄 Test Files to Use:" -ForegroundColor Magenta
Write-Host "- Any PDF file from your computer"
Write-Host "- Sample PDFs in uploads/ folder:"

# List sample PDFs
$uploadsPath = Join-Path $PSScriptRoot "uploads"
if (Test-Path $uploadsPath) {
    $pdfFiles = Get-ChildItem $uploadsPath -Filter "*.pdf" | Select-Object -First 3
    foreach ($file in $pdfFiles) {
        Write-Host "  • $($file.Name)" -ForegroundColor Gray
    }
    if ((Get-ChildItem $uploadsPath -Filter "*.pdf").Count -gt 3) {
        Write-Host "  • ... and more" -ForegroundColor Gray
    }
}
Write-Host ""

Write-Host "✅ Success Criteria:" -ForegroundColor Green
Write-Host "- PDF uploads and loads without errors"
Write-Host "- Canvas displays PDF content clearly"
Write-Host "- Navigation (prev/next) works"
Write-Host "- Zoom in/out functions properly"
Write-Host "- Rotation controls work"
Write-Host "- No red errors in browser console (F12)"
Write-Host ""

Write-Host "🚨 If Tests Fail:" -ForegroundColor Red
Write-Host "1. Check browser console (F12 → Console tab)"
Write-Host "2. Verify frontend is running (npm run dev:frontend)"
Write-Host "3. Try PDF Diagnostics page first"
Write-Host "4. Use Debug Viewer for detailed logging"
Write-Host ""

# Quick command options
Write-Host "⚡ Quick Commands:" -ForegroundColor Cyan
Write-Host "- Start services: .\test-pdf-simple-browser.ps1 -StartServices"
Write-Host "- Run this help: .\test-pdf-simple-browser.ps1"
Write-Host ""

# Copy primary URL to clipboard if possible
try {
    $primaryUrl = "http://localhost:5173/pdf-test"
    $primaryUrl | Set-Clipboard
    Write-Host "📋 Primary test URL copied to clipboard: $primaryUrl" -ForegroundColor Green
} catch {
    Write-Host "💡 Manual copy: http://localhost:5173/pdf-test" -ForegroundColor Yellow
}
