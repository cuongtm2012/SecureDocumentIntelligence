# Secure Document Intelligence System

A sophisticated OCR document processing system with Vietnamese language support, built with React, Node.js, and PostgreSQL.

## Features

- 🔐 **Security-focused**: Multi-level clearance system with audit logging
- 🇻🇳 **Vietnamese OCR**: Advanced Vietnamese text recognition using Tesseract.js and DeepSeek AI
- 📄 **Multi-format support**: Images (JPG, PNG) and PDF documents
- 🤖 **AI-powered**: DeepSeek integration for enhanced text extraction and analysis
- 📊 **Real-time processing**: Live status updates and progress tracking
- 🔍 **Document analysis**: Advanced document structure analysis and data extraction
- 📋 **Audit trail**: Complete security logging for compliance
- 🎨 **Modern UI**: Beautiful, responsive interface with dark/light mode

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI
- **Backend**: Node.js, Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **OCR**: Tesseract.js, DeepSeek AI API
- **File Processing**: Sharp, PDF parsing, Multer

## Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- DeepSeek AI API key (optional, for enhanced processing)

## Quick Start

1. **Clone and install dependencies**
   ```bash
   npm install
   ```

2. **Setup environment variables**
   ```bash
   copy .env.example .env
   ```
   Edit `.env` with your database URL and API keys.

3. **Setup PostgreSQL database**
   ```bash
   # Create database
   createdb secure_document_intelligence
   
   # Push schema to database
   npm run db:push
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Access the application**
   - Open http://localhost:5000
   - Default login: `agent.smith` / `password123`

## Development Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run check` - TypeScript type checking
- `npm run db:push` - Push database schema changes

## Database Setup

The system uses PostgreSQL with Drizzle ORM. The schema includes:

- **users**: User management with security clearance levels
- **documents**: Document storage and processing metadata
- **audit_logs**: Security audit trail for compliance

## Default User

The system creates a default admin user on first run:
- Username: `agent.smith`
- Password: `password123`
- Clearance: `Level 3 - Confidential`

## Security Features

- Multi-level security clearance system
- Complete audit logging of all actions
- Secure file upload with type validation
- Session-based authentication
- CSP headers and security middleware

## OCR Processing

The system supports multiple OCR methods:
1. **Basic Tesseract.js**: For standard image processing
2. **Enhanced Vietnamese OCR**: Optimized for Vietnamese documents
3. **DeepSeek AI**: Advanced AI-powered text extraction and analysis
4. **PDF Processing**: Multi-page PDF document processing

## API Endpoints

- `GET /api/user` - Get current user info
- `POST /api/documents/upload` - Upload document
- `GET /api/documents` - List user documents
- `POST /api/documents/:id/process` - Process document with OCR
- `GET /api/documents/:id/export` - Export extracted text
- `GET /api/audit-logs` - Get audit trail
- `GET /api/system/status` - System health check

## Production Deployment

1. Build the application:
   ```bash
   npm run build
   ```

2. Set production environment variables

3. Start the production server:
   ```bash
   npm start
   ```

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string
- `OPENAI_API_KEY`: DeepSeek AI API key for enhanced processing
- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 5000)

## Contributing

This is a secure government document processing system. Follow security best practices and maintain audit compliance.

## License

MIT License
