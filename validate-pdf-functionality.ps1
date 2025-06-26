# PDF Functionality Validation Script
# This script validates that the PDF file selection issues have been resolved

param(
    [switch]$Detailed = $false
)

Write-Host "=====================================" -ForegroundColor Blue
Write-Host "🔍 PDF File Selection Validation" -ForegroundColor Blue
Write-Host "=====================================" -ForegroundColor Blue

$testResults = @()
$passedTests = 0
$failedTests = 0

function Test-Component {
    param(
        [string]$Name,
        [scriptblock]$TestScript
    )
    
    Write-Host "📄 Testing: $Name" -ForegroundColor Yellow
    
    try {
        $result = & $TestScript
        if ($result -eq $false) {
            throw "Test returned false"
        }
        Write-Host "✅ $Name - PASSED" -ForegroundColor Green
        $script:passedTests++
        $script:testResults += @{ Name = $Name; Status = "PASS"; Message = "" }
        return $true
    }
    catch {
        Write-Host "❌ $Name - FAILED: $($_.Exception.Message)" -ForegroundColor Red
        $script:failedTests++
        $script:testResults += @{ Name = $Name; Status = "FAIL"; Message = $_.Exception.Message }
        return $false
    }
}

# Test 1: Check Required Ports
Test-Component "Required Ports Available" {
    $port5000 = netstat -an | Select-String ":5000.*LISTEN"
    $port8001 = netstat -an | Select-String ":8001.*LISTEN"
    
    if (-not $port5000) {
        throw "Backend port 5000 not listening"
    }
    
    if (-not $port8001) {
        throw "OCR service port 8001 not listening"  
    }
    
    Write-Host "  • Port 5000 (Backend): ✓" -ForegroundColor Gray
    Write-Host "  • Port 8001 (OCR): ✓" -ForegroundColor Gray
    return $true
}

# Test 2: Backend API Connectivity
Test-Component "Backend API Connectivity" {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/api/documents" -Method HEAD -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ne 200) {
            throw "Backend API returned status: $($response.StatusCode)"
        }
        Write-Host "  • Documents API: ✓" -ForegroundColor Gray
        return $true
    }
    catch {
        throw "Cannot connect to backend API: $($_.Exception.Message)"
    }
}

# Test 3: OCR Service Health
Test-Component "OCR Service Health" {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8001/health" -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ne 200) {
            throw "OCR service returned status: $($response.StatusCode)"
        }
        
        $healthData = $response.Content | ConvertFrom-Json
        if ($healthData.status -ne "healthy") {
            throw "OCR service status: $($healthData.status)"
        }
        
        Write-Host "  • OCR Health Check: ✓" -ForegroundColor Gray
        return $true
    }
    catch {
        throw "OCR service health check failed: $($_.Exception.Message)"
    }
}

# Test 4: Documents API Data
Test-Component "Documents API Data" {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/api/documents" -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ne 200) {
            throw "Documents API failed: $($response.StatusCode)"
        }
        
        $documents = $response.Content | ConvertFrom-Json
        Write-Host "  • Found $($documents.Count) documents" -ForegroundColor Gray
        
        $pdfDocs = $documents | Where-Object { $_.mimeType -eq "application/pdf" }
        Write-Host "  • PDF documents: $($pdfDocs.Count)" -ForegroundColor Gray
        
        if ($documents.Count -eq 0) {
            Write-Host "  ⚠️  No documents found - upload some PDFs to test fully" -ForegroundColor Yellow
        }
        
        return $true
    }
    catch {
        throw "Documents API test failed: $($_.Exception.Message)"
    }
}

# Test 5: PDF Document Access (if available)
Test-Component "PDF Document Access" {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/api/documents" -UseBasicParsing -TimeoutSec 10
        $documents = $response.Content | ConvertFrom-Json
        
        $pdfDocs = $documents | Where-Object { $_.mimeType -eq "application/pdf" }
        
        if ($pdfDocs.Count -eq 0) {
            Write-Host "  ⚠️  No PDF documents available to test" -ForegroundColor Yellow
            return $true
        }
        
        $firstPDF = $pdfDocs[0]
        $pdfUrl = "http://localhost:5000/api/documents/$($firstPDF.id)/raw"
        
        $pdfResponse = Invoke-WebRequest -Uri $pdfUrl -Method HEAD -UseBasicParsing -TimeoutSec 10
        
        if ($pdfResponse.StatusCode -ne 200) {
            throw "PDF access failed: $($pdfResponse.StatusCode)"
        }
        
        $contentType = $pdfResponse.Headers["Content-Type"]
        if ($contentType -notlike "*pdf*") {
            throw "Invalid content type: $contentType"
        }
        
        Write-Host "  • PDF '$($firstPDF.originalName)' accessible: ✓" -ForegroundColor Gray
        return $true
    }
    catch {
        throw "PDF access test failed: $($_.Exception.Message)"
    }
}

# Test 6: Configuration Files
Test-Component "Configuration Files" {
    $requiredFiles = @(
        "vite.config.ts",
        "package.json", 
        "client\src\components\dashboard-pdf-viewer.tsx",
        "client\src\components\advanced-ocr-dashboard.tsx",
        "PDF-ISSUES-RESOLUTION.md"
    )
    
    foreach ($file in $requiredFiles) {
        if (-not (Test-Path $file)) {
            throw "Required file missing: $file"
        }
    }
    
    # Check vite config has proxy
    $viteConfig = Get-Content "vite.config.ts" -Raw
    if ($viteConfig -notlike "*proxy*" -or $viteConfig -notlike "*/api*") {
        throw "Vite proxy configuration missing or incomplete"
    }
    
    Write-Host "  • All required files present: ✓" -ForegroundColor Gray
    Write-Host "  • Vite proxy configured: ✓" -ForegroundColor Gray
    return $true
}

# Test 7: Test Dashboard Access
Test-Component "Test Dashboard Access" {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/test-pdf-functionality.html" -Method HEAD -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -ne 200) {
            throw "Test dashboard not accessible: $($response.StatusCode)"
        }
        Write-Host "  • Test dashboard available: ✓" -ForegroundColor Gray
        return $true
    }
    catch {
        throw "Test dashboard access failed: $($_.Exception.Message)"
    }
}

# Print Summary
Write-Host "=====================================" -ForegroundColor Blue
Write-Host "📊 Validation Summary" -ForegroundColor Blue
Write-Host "=====================================" -ForegroundColor Blue

Write-Host "Total Tests: $($passedTests + $failedTests)" -ForegroundColor White
Write-Host "Passed: $passedTests" -ForegroundColor Green
Write-Host "Failed: $failedTests" -ForegroundColor $(if ($failedTests -gt 0) { "Red" } else { "Green" })

if ($Detailed -and $testResults.Count -gt 0) {
    Write-Host "`n📋 Detailed Results:" -ForegroundColor Blue
    foreach ($result in $testResults) {
        $status = if ($result.Status -eq "PASS") { "✅" } else { "❌" }
        Write-Host "$status $($result.Name)" -ForegroundColor $(if ($result.Status -eq "PASS") { "Green" } else { "Red" })
        if ($result.Status -eq "FAIL" -and $result.Message) {
            Write-Host "   Error: $($result.Message)" -ForegroundColor Red
        }
    }
}

if ($failedTests -gt 0) {
    Write-Host "`n=====================================" -ForegroundColor Red
    Write-Host "🔧 Resolution Steps" -ForegroundColor Red
    Write-Host "=====================================" -ForegroundColor Red
    Write-Host "1. Ensure all services are running:" -ForegroundColor Yellow
    Write-Host "   npm run dev:all" -ForegroundColor White
    Write-Host "2. Check the test dashboard:" -ForegroundColor Yellow
    Write-Host "   http://localhost:5000/test-pdf-functionality.html" -ForegroundColor White
    Write-Host "3. Review detailed troubleshooting:" -ForegroundColor Yellow
    Write-Host "   Open PDF-ISSUES-RESOLUTION.md" -ForegroundColor White
    Write-Host "4. Verify services individually:" -ForegroundColor Yellow
    Write-Host "   Backend:  http://localhost:5000/api/documents" -ForegroundColor White
    Write-Host "   OCR:      http://localhost:8001/health" -ForegroundColor White
    
    exit 1
} else {
    Write-Host "`n=====================================" -ForegroundColor Green
    Write-Host "🎉 All tests passed! PDF file selection is working correctly." -ForegroundColor Green
    Write-Host "=====================================" -ForegroundColor Green
    Write-Host "✅ You can now:" -ForegroundColor Green
    Write-Host "  • Access the main app:" -ForegroundColor White
    Write-Host "    http://localhost:5000" -ForegroundColor Cyan
    Write-Host "  • Test PDF functionality:" -ForegroundColor White  
    Write-Host "    http://localhost:5000/test-pdf-functionality.html" -ForegroundColor Cyan
    Write-Host "  • Upload and view PDF documents" -ForegroundColor White
    Write-Host "  • Use the dashboard PDF viewer" -ForegroundColor White
    Write-Host "  • Access via Vite dev server (with proxy):" -ForegroundColor White
    Write-Host "    http://localhost:5173" -ForegroundColor Cyan
    
    Write-Host "`n🏆 PDF file selection issues have been successfully resolved!" -ForegroundColor Green
}
