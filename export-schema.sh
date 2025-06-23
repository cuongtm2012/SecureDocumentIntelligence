#!/bin/bash

# Database Schema Export Script
# Choose the export method you prefer:

echo "=== Vietnamese OCR Document Processing System - Database Schema Export ==="
echo ""

echo "1. Clean Drizzle Schema (recommended for development):"
echo "   npx drizzle-kit export --config drizzle.config.ts"
echo ""

echo "2. Full PostgreSQL dump (schema only):"
echo "   pg_dump --schema-only \$DATABASE_URL > schema-full.sql"
echo ""

echo "3. Full PostgreSQL dump with data:"
echo "   pg_dump \$DATABASE_URL > database-backup-with-data.sql"
echo ""

echo "4. Export to specific file:"
echo "   npx drizzle-kit export --config drizzle.config.ts > clean-schema.sql"
echo ""

echo "5. Introspect existing database (reverse engineering):"
echo "   npx drizzle-kit introspect --out ./reverse-engineered"
echo ""

# Execute based on user preference
case "$1" in
  "clean")
    echo "Exporting clean schema..."
    npx drizzle-kit export --config drizzle.config.ts > clean-schema.sql
    echo "Schema exported to clean-schema.sql"
    ;;
  "full")
    echo "Exporting full PostgreSQL schema..."
    pg_dump --schema-only $DATABASE_URL > schema-full.sql
    echo "Full schema exported to schema-full.sql"
    ;;
  "backup")
    echo "Creating full database backup..."
    pg_dump $DATABASE_URL > database-backup-$(date +%Y%m%d_%H%M%S).sql
    echo "Full backup created"
    ;;
  *)
    echo "Usage: ./export-schema.sh [clean|full|backup]"
    echo ""
    echo "Or run individual commands above"
    ;;
esac