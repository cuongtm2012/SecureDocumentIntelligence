#!/bin/bash

echo "🧹 Starting OCR Project Cleanup..."
echo "This script will remove redundant test files and temporary artifacts"
echo ""

# Confirm before proceeding
read -p "Are you sure you want to proceed with cleanup? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Cleanup cancelled."
    exit 0
fi

echo ""
echo "📁 Removing test files..."

# Remove test files (keeping essential ones)
rm -f test-*.mjs
rm -f test-*.js
rm -f test-*.ts
rm -f test-*.py
rm -f test-*.html
rm -f test-*.ps1
rm -f validate-*.mjs
rm -f validate-*.ps1

# Remove test images and PDFs
rm -f test-pdf-conversion-*.png
rm -f test-*.png
rm -f test-*.jpg

echo "✅ Test files removed"

echo ""
echo "🗂️ Removing temporary and cache files..."

# Remove temporary directories and files
rm -rf temp/
rm -rf tmp/
rm -f *.log
rm -f ocr_service.log

# Remove database files (these should be regenerated)
rm -f database.db
rm -f *.sqlite
rm -f *.sqlite3

echo "✅ Temporary files removed"

echo ""
echo "📄 Removing redundant documentation..."

# Remove specific redundant documentation
rm -f replit.md
rm -f manual-test-guide.ts

echo "✅ Redundant documentation removed"

echo ""
echo "🐍 Cleaning Python artifacts..."

# Remove Python cache
find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
find . -name "*.pyc" -delete
find . -name "*.pyo" -delete
find . -name "*.pyd" -delete

echo "✅ Python artifacts cleaned"

echo ""
echo "📦 Removing package lock files (will be regenerated)..."

# Remove lock files (they will be regenerated)
rm -f package-lock.json
rm -f yarn.lock
rm -f pnpm-lock.yaml

echo "✅ Lock files removed"

echo ""
echo "🔧 Removing redundant server files..."

# List of potentially redundant server files to review
echo "The following server files may be redundant and should be reviewed:"
echo "- server/routes-backup.ts (backup file)"
echo "- server/routes-fixed.ts (potentially superseded by routes.ts)"
echo "- server/direct-ocr-processor.ts vs server/direct-ocr-processor-fixed.ts"
echo "- server/simple-tesseract-processor.ts vs server/enhanced-tesseract-processor.ts"

# Remove clearly redundant backup files
rm -f server/routes-backup.ts

echo ""
echo "⚠️  Manual review required for these files:"
echo "1. Check if server/routes-fixed.ts is still needed vs server/routes.ts"
echo "2. Review if server/direct-ocr-processor.ts can be removed in favor of server/direct-ocr-processor-fixed.ts"
echo "3. Determine if server/simple-tesseract-processor.ts is superseded by server/enhanced-tesseract-processor.ts"

echo ""
echo "🧹 Cleanup completed!"
echo ""
echo "📋 Summary of actions taken:"
echo "- Removed all test-* files"
echo "- Removed temporary files and logs"
echo "- Removed database files (will be regenerated)"
echo "- Cleaned Python cache"
echo "- Removed package lock files"
echo "- Removed backup files"
echo ""
echo "🔍 Files requiring manual review:"
echo "- server/routes-fixed.ts"
echo "- server/direct-ocr-processor.ts" 
echo "- server/simple-tesseract-processor.ts"
echo ""
echo "✨ Your project is now cleaned up and ready for production!"