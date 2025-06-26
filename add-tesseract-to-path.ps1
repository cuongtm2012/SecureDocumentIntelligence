# Add Tesseract to System PATH
# Run as Administrator

$tesseractPath = "C:\Program Files\Tesseract-OCR"

# Get current system PATH
$currentPath = [Environment]::GetEnvironmentVariable("PATH", [EnvironmentVariableTarget]::Machine)

# Check if Tesseract path is already in PATH
if ($currentPath -split ";" -contains $tesseractPath) {
    Write-Host "Tesseract is already in the system PATH" -ForegroundColor Green
} else {
    # Add Tesseract to PATH
    $newPath = $currentPath + ";" + $tesseractPath
    [Environment]::SetEnvironmentVariable("PATH", $newPath, [EnvironmentVariableTarget]::Machine)
    Write-Host "Added Tesseract to system PATH: $tesseractPath" -ForegroundColor Green
}

# Verify installation
Write-Host "`nTesting Tesseract installation..." -ForegroundColor Yellow
& "$tesseractPath\tesseract.exe" --version

Write-Host "`nTesseract has been added to the system PATH. Please restart your command prompt or PowerShell to use 'tesseract' command." -ForegroundColor Cyan
