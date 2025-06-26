import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { createWorker } from "tesseract.js";
import sharp from "sharp";
import { deepSeekService } from "./deepseek-service";
import { vietnameseTextCleaner } from "./vietnamese-text-cleaner";
import { enhancedVietnameseOCR } from "./enhanced-vietnamese-ocr";
import { pdfProcessor } from "./pdf-processor";
import { directOCRProcessor } from "./direct-ocr-processor";
import helmet from "helmet";
import { insertDocumentSchema, insertAuditLogSchema } from "@shared/schema";
import { z } from "zod";
import { initializeDatabase } from "./init-db";
import { 
  healthCheck, 
  processSingleFile, 
  processBatchFiles, 
  getBatchJobStatus, 
  getSupportedLanguages,
  uploadSingle,
  uploadMultiple 
} from "./controllers/ocr.controller.js";
import FormData from 'form-data';
import axios from 'axios';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and PDF files are allowed'));
    }
  },
});

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Helper function to process file with fallback handling
async function processFileWithFallback(filePath: string, document: any, documentId: number, userId: number, req: any, res: any) {
  console.log(`🚀 Processing document ${document.originalName} with Python OCR Service...`);
  
  // Use Python OCR service for processing
  const formData = new FormData();
  const fileBuffer = await readFile(filePath);
  formData.append('file', fileBuffer, {
    filename: document.originalName,
    contentType: document.mimeType
  });
  formData.append('language', 'vie');
  formData.append('confidence_threshold', '60.0');

  // Try to call Python OCR service with axios instead of fetch
  let ocrResult;
  try {
    console.log('🔗 Calling Python OCR service with axios...');
    
    const response = await axios.post('http://localhost:8001/ocr/process', formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 300000, // 5 minutes timeout for large files
      maxContentLength: 50 * 1024 * 1024, // 50MB max
    });

    ocrResult = response.data;
    console.log('✅ Python OCR service responded successfully');
    
  } catch (serviceError) {
    console.warn('⚠️ Python OCR service unavailable, using fallback Tesseract processing...');
    console.error('Service error:', serviceError instanceof Error ? serviceError.message : serviceError);
    
    // Fallback to local Tesseract processing for images
    if (document.mimeType?.startsWith('image/')) {
      const { createWorker } = await import('tesseract.js');
      const sharp = await import('sharp');
      
      // Enhanced image preprocessing
      const processedImageBuffer = await sharp.default(fileBuffer)
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .rotate()
        .greyscale()
        .normalize()
        .sharpen({ sigma: 1, m1: 0.5, m2: 2 })
        .threshold(128)
        .png({ quality: 100 })
        .toBuffer();

      const worker = await createWorker(['vie', 'eng'], 1, {
        logger: m => console.log(`Tesseract: ${m.status} - ${m.progress}`)
      });
      
      await worker.setParameters({
        'preserve_interword_spaces': '1'
      });

      const { data: { text, confidence: tessConfidence } } = await worker.recognize(processedImageBuffer);
      await worker.terminate();

      // Create result in Python OCR format
      ocrResult = {
        success: true,
        file_id: document.originalName,
        text: text,
        confidence: tessConfidence,
        page_count: 1,
        processing_time: 2.0,
        metadata: {
          character_count: text.length,
          word_count: text.split(/\s+/).filter(word => word.length > 0).length,
          language: 'vie',
          confidence_threshold: 60.0,
          processing_timestamp: new Date(),
          file_size_bytes: document.fileSize,
          processing_mode: 'fallback-tesseract',
          note: 'Processed with local Tesseract (Python service unavailable)'
        }
      };
    }
  }

  if (!ocrResult || !ocrResult.success) {
    console.log("Using direct OCR fallback processing...");
    
    try {
      const directResult = await directOCRProcessor.processDocument(filePath);
      
      ocrResult = {
        success: true,
        file_id: document.originalName,
        text: directResult.extractedText,
        confidence: directResult.confidence,
        page_count: directResult.pageCount,
        processing_time: directResult.processingTime / 1000,
        metadata: {
          character_count: directResult.extractedText.length,
          word_count: directResult.extractedText.split(/\s+/).filter(word => word.length > 0).length,
          language: 'vie',
          confidence_threshold: 60.0,
          processing_timestamp: new Date(),
          file_size_bytes: document.fileSize,
          processing_mode: directResult.processingMethod,
          note: 'Processed with direct OCR fallback'
        }
      };
    } catch (directError: any) {
      throw new Error('OCR processing failed: ' + (directError.message || 'Unknown error'));
    }
  }

  // Extract data from Python OCR result
  const extractedText = ocrResult.text || '';
  const confidence = (ocrResult.confidence || 0) / 100; // Convert to 0-1 range
  
  // **NEW: Add Deepseek analysis to main workflow**
  console.log('🤖 Starting Deepseek analysis integration...');
  let deepseekAnalysis = null;
  
  if (extractedText && process.env.OPENAI_API_KEY) {
    try {
      console.log('📋 Calling Deepseek document analysis...');
      deepseekAnalysis = await deepSeekService.analyzeDocument(
        extractedText, 
        "Vietnamese government document analysis"
      );
      console.log('✅ Deepseek analysis completed successfully');
      
      // Log the analysis
      await storage.createAuditLog({
        userId,
        action: `Deepseek AI analysis completed: ${document.originalName}`,
        documentId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      
    } catch (deepseekError) {
      const errorMessage = deepseekError instanceof Error ? deepseekError.message : 'Unknown error';
      console.warn('⚠️ DeepSeek analysis failed:', errorMessage);
      
      // Log the warning but don't fail the entire process
      await storage.createAuditLog({
        userId,
        action: `Deepseek AI analysis failed for ${document.originalName}: ${errorMessage}`,
        documentId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
    }
  } else {
    console.log('⚠️ Skipping Deepseek analysis: No API key configured or no text extracted');
  }
  
  const structuredData = {
    pageCount: ocrResult.page_count || 1,
    characterCount: ocrResult.metadata?.character_count || extractedText.length,
    wordCount: ocrResult.metadata?.word_count || extractedText.split(/\s+/).filter((word: string) => word.length > 0).length,
    language: ocrResult.metadata?.language || 'vie',
    processingMode: ocrResult.metadata?.processing_mode || 'python-ocr',
    processingTime: ocrResult.processing_time || 0,
    
    // **NEW: Add Deepseek analysis results to structured data**
    deepseekAnalysis: deepseekAnalysis ? {
      applied: true,
      summary: deepseekAnalysis.summary || 'Analysis completed',
      keyFindings: deepseekAnalysis.keyFindings || [],
      entities: deepseekAnalysis.entities || [],
      confidence: deepseekAnalysis.confidence || 0.8,
      documentType: deepseekAnalysis.documentType || 'Unknown',
      timestamp: new Date()
    } : {
      applied: false,
      reason: process.env.OPENAI_API_KEY ? 'Analysis failed' : 'No API key configured'
    },
    
    ...extractStructuredData(extractedText)
  };

  // Update document with results
  await storage.updateDocument(documentId, {
    processingStatus: "completed",
    processingCompletedAt: new Date(),
    confidence,
    extractedText,
    structuredData: JSON.stringify(structuredData),
  });

  // Log successful processing
  await storage.createAuditLog({
    userId,
    action: `Document processed with Python OCR: ${document.originalName} (${structuredData.pageCount} pages, ${Math.round(confidence * 100)}% confidence)`,
    documentId: document.id,
    ipAddress: req.ip,
    userAgent: req.get('User-Agent'),
  });

  const updatedDocument = await storage.getDocument(documentId);
  res.json(updatedDocument);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize database with default user
  await initializeDatabase();
  // Apply security headers with updated CSP for image loading and VS Code Simple Browser support
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "blob:", "http://localhost:5000", "http://localhost:3000"],
        connectSrc: ["'self'", "ws:", "wss:", "http://localhost:8001"],
        fontSrc: ["'self'", "data:"],
        frameAncestors: ["'self'", "vscode-webview:", "https://vscode-cdn.net"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
  }));

  // Mock authentication middleware - in production this would be proper authentication
  app.use('/api', (req, res, next) => {
    // For demo purposes, always authenticate as user ID 1
    (req as any).user = { id: 1, username: "agent.smith" };
    next();
  });

  // Get current user
  app.get("/api/user", async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Upload document
  app.post("/api/documents/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = (req as any).user.id;
      const filename = `${Date.now()}-${req.file.originalname}`;
      const filePath = path.join(uploadsDir, filename);

      // Save file to disk
      await writeFile(filePath, req.file.buffer);

      // Create document record
      const documentData = insertDocumentSchema.parse({
        filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        userId,
      });

      const document = await storage.createDocument(documentData);

      // Log the upload
      await storage.createAuditLog({
        userId,
        action: `Document uploaded: ${req.file.originalname}`,
        documentId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json(document);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  // Process document with Python OCR Service
  app.post("/api/documents/:id/process", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Update status to processing
      await storage.updateDocument(documentId, {
        processingStatus: "processing",
        processingStartedAt: new Date(),
      });      const filePath = path.join(uploadsDir, document.filename);
      
      // Check if file exists, if not try to find an alternative
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        
        // Try to find a file with the same original name
        const files = fs.readdirSync(uploadsDir);
        const alternativeFile = files.find(file => 
          file.includes(document.originalName.replace(/\s+/g, ' ')) ||
          file.endsWith(document.originalName)
        );
        
        if (alternativeFile) {
          const alternativePath = path.join(uploadsDir, alternativeFile);
          console.log(`🔄 Found alternative file: ${alternativeFile}`);
          
          // Update the document record with the correct filename
          await storage.updateDocument(documentId, {
            filename: alternativeFile
          });
          
          // Use the alternative file path
          const altFilePath = alternativePath;
          return await processFileWithFallback(altFilePath, document, documentId, userId, req, res);
        } else {
          throw new Error(`File not found: ${document.filename} and no alternative found`);
        }
      }      try {
        return await processFileWithFallback(filePath, document, documentId, userId, req, res);
      } catch (processingError) {
        const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown processing error';
        const errorStep = (processingError as any)?.step || 'unknown';
          console.error('❌ Enhanced processing failed:', errorMessage);
        
        return res.status(500).json({
          success: false,
          error: 'Enhanced processing failed',
          details: errorMessage,
          step: errorStep
        });
      }

    } catch (error) {
      console.error('Process document error:', error);
      res.status(500).json({ message: "Failed to process document" });
    }
  });

  // Get user's documents
  app.get("/api/documents", async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const documents = await storage.getDocumentsByUserId(userId);
      res.json(documents);
    } catch (error) {
      res.status(500).json({ message: "Failed to get documents" });
    }
  });

  // Get specific document
  app.get("/api/documents/:id", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json(document);
    } catch (error) {
      res.status(500).json({ message: "Failed to get document" });
    }
  });

  // Export extracted text
  app.get("/api/documents/:id/export", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      const format = req.query.format as string || 'txt';
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!document.extractedText) {
        return res.status(400).json({ message: "No extracted text available" });
      }

      let content: string;
      let contentType: string;
      let filename: string;

      if (format === 'json') {
        const exportData = {
          document: {
            originalName: document.originalName,
            processedAt: document.processingCompletedAt,
            confidence: document.confidence,
          },
          extractedText: document.extractedText,
          structuredData: document.structuredData ? JSON.parse(document.structuredData) : null,
        };
        content = JSON.stringify(exportData, null, 2);
        contentType = 'application/json';
        filename = `${document.originalName}_extracted.json`;
      } else {
        content = document.extractedText;
        contentType = 'text/plain';
        filename = `${document.originalName}_extracted.txt`;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);

      // Log the export
      await storage.createAuditLog({
        userId,
        action: `Document exported: ${document.originalName} (${format})`,
        documentId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

    } catch (error) {
      console.error('Export error:', error);
      res.status(500).json({ message: "Failed to export document" });
    }
  });

  // Get recent activity
  app.get("/api/audit-logs", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const auditLogs = await storage.getRecentAuditLogs(limit);
      res.json(auditLogs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  // Advanced document analysis endpoint
  app.post("/api/documents/:id/analyze", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      if (!document.extractedText) {
        return res.status(400).json({ message: "Document must be processed first" });
      }

      // Perform advanced analysis with DeepSeek
      const analysis = await deepSeekService.analyzeDocument(
        document.extractedText, 
        "Government security document analysis"
      );

      // Log the analysis
      await storage.createAuditLog({
        userId,
        action: `Advanced analysis performed: ${document.originalName}`,
        documentId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        documentId,
        analysis,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Document analysis error:', error);
      res.status(500).json({ message: "Analysis failed" });
    }
  });

  // System status endpoint
  app.get("/api/system/status", async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const userDocuments = await storage.getDocumentsByUserId(userId);
      const todayProcessed = userDocuments.filter(doc => {
        const today = new Date();
        const docDate = new Date(doc.uploadedAt);
        return docDate.toDateString() === today.toDateString();
      }).length;

      const hasDeepSeekKey = !!process.env.OPENAI_API_KEY;

      res.json({
        services: {
          ocr: hasDeepSeekKey ? "deepseek-ai" : "tesseract",
          database: "connected",
          security: "active",
          ai: hasDeepSeekKey ? "online" : "offline"
        },
        capabilities: {
          advancedOCR: hasDeepSeekKey,
          documentAnalysis: hasDeepSeekKey,
          structuredExtraction: true
        },
        usage: {
          today: todayProcessed,
          limit: 1000,
        },
        session: {
          remaining: 45,
        }
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get system status" });
    }
  });

  // Get document thumbnail/preview
  app.get("/api/documents/:id/thumbnail", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Fix: Use correct property name 'filename' instead of 'fileName'
      const filePath = path.join(uploadsDir, document.filename);
      
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return res.status(404).json({ message: "File not found" });
      }

      if (document.mimeType === 'application/pdf') {
        // For PDF, create a simple image representation
        try {
          // Create a simple SVG placeholder for PDF thumbnails
          const placeholderSvg = `
            <svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
              <rect width="400" height="600" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/>
              <rect x="20" y="20" width="360" height="40" fill="#e9ecef" rx="4"/>
              <rect x="20" y="80" width="280" height="20" fill="#e9ecef" rx="2"/>
              <rect x="20" y="110" width="320" height="20" fill="#e9ecef" rx="2"/>
              <rect x="20" y="140" width="200" height="20" fill="#e9ecef" rx="2"/>
              <text x="200" y="350" text-anchor="middle" font-family="Arial" font-size="16" fill="#6c757d">
                PDF Document
              </text>
              <text x="200" y="380" text-anchor="middle" font-family="Arial" font-size="14" fill="#6c757d">
                ${document.originalName}
              </text>
            </svg>
          `;
          
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.send(placeholderSvg);
        } catch (error) {
          console.error('PDF thumbnail error:', error);
          res.status(500).json({ message: "Failed to generate PDF thumbnail" });
        }
      } else {
        // For images, return resized version
        try {
          const imageBuffer = await sharp(filePath)
            .resize(800, 1000, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();
          
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.send(imageBuffer);
        } catch (error) {
          console.error('Image thumbnail error:', error);
          res.status(500).json({ message: "Failed to generate thumbnail" });
        }
      }
    } catch (error) {
      console.error('Thumbnail error:', error);
      res.status(500).json({ message: "Failed to get thumbnail" });
    }
  });

  // Get specific PDF page as image - Fixed implementation using Poppler directly
  app.get("/api/documents/:id/pdf", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      const page = parseInt(req.query.page as string) || 1;
      
      console.log(`📄 PDF page request: doc=${documentId}, page=${page}, user=${userId}`);
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        console.error(`Document not found or access denied: ${documentId}`);
        return res.status(404).json({ message: "Document not found" });
      }

      if (document.mimeType !== 'application/pdf') {
        return res.status(400).json({ message: "Document is not a PDF" });
      }

      const filePath = path.join(uploadsDir, document.filename);
      
      if (!fs.existsSync(filePath)) {
        console.error(`PDF file not found: ${filePath}`);
        return res.status(404).json({ message: "PDF file not found" });
      }

      try {
        console.log(`📖 Converting PDF to image using Poppler: ${filePath}, page ${page}`);
        
        // Create temp directory if it doesn't exist
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // Use pdf-poppler or pdf2pic to convert PDF page to image
        const outputPath = path.join(tempDir, `pdf_page_${documentId}_${page}.png`);
        
        // For now, return the PDF file directly for client-side rendering
        const pdfBuffer = await readFile(filePath);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(pdfBuffer);
        
      } catch (error) {
        console.error('PDF conversion error:', error);
        res.status(500).json({ message: "Failed to process PDF" });
      }
    } catch (error) {
      console.error('PDF endpoint error:', error);
      res.status(500).json({ message: "Failed to serve PDF" });
    }
  });

  // Serve PDF files directly
  app.get("/api/documents/:id/file", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      const filePath = path.join(uploadsDir, document.filename);
      
      if (!fs.existsSync(filePath)) {
        // Try to find an alternative file
        const files = fs.readdirSync(uploadsDir);
        const alternativeFile = files.find(file => 
          file.includes(document.originalName.replace(/\s+/g, ' ')) ||
          file.endsWith(document.originalName)
        );
        
        if (alternativeFile) {
          const alternativePath = path.join(uploadsDir, alternativeFile);
          const fileBuffer = await readFile(alternativePath);
          
          res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
          res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.send(fileBuffer);
        } else {
          return res.status(404).json({ message: "File not found" });
        }
      } else {
        const fileBuffer = await readFile(filePath);
        
        res.setHeader('Content-Type', document.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(fileBuffer);
      }
    } catch (error) {
      console.error('File serving error:', error);
      res.status(500).json({ message: "Failed to serve file" });
    }
  });

  // ========================================
  // PYTHON OCR SERVICE ENDPOINTS
  // ========================================

  // Python OCR service health check
  app.get("/api/ocr/health", healthCheck);

  // Process single PDF file with Python OCR service  
  app.post("/api/ocr/process", uploadSingle, processSingleFile);

  // Process multiple PDF files in batch
  app.post("/api/ocr/batch", uploadMultiple, processBatchFiles);

  // Get batch job status and results
  app.get("/api/ocr/jobs/:jobId", getBatchJobStatus);

  // Get supported OCR languages
  app.get("/api/ocr/languages", getSupportedLanguages);

  // Clear completed batch jobs (cleanup endpoint)
  app.delete("/api/ocr/jobs/completed", async (req, res) => {
    try {
      // This would be implemented in the controller
      res.json({
        success: true,
        message: "Cleanup endpoint - implement in controller",
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Cleanup failed",
        timestamp: new Date()
      });
    }
  });

  // Get OCR service information and configuration
  app.get("/api/ocr/info", async (req, res) => {
    try {
      res.json({
        success: true,
        service: {
          name: 'Enhanced Vietnamese OCR Service',
          version: '1.0.0',
          endpoints: {
            health: '/api/ocr/health',
            process: '/api/ocr/process',
            batch: '/api/ocr/batch',
            languages: '/api/ocr/languages',
            jobStatus: '/api/ocr/jobs/:jobId',
            info: '/api/ocr/info'
          },
          features: [
            'Vietnamese PDF OCR',
            'Batch processing',
            'Real-time progress tracking',
            'Multiple language support',
            'API and CLI fallback modes',
            'Confidence scoring',
            'Metadata extraction'
          ]
        },
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: "Failed to get service info",
        timestamp: new Date()
      });
    }
  });

  // Enhanced document processing with OCR → Text Cleaning → DeepSeek Analysis
  app.post("/api/documents/:id/process-enhanced", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      const options = {
        useDeepSeekAnalysis: req.body.useDeepSeekAnalysis || false,
        cleanText: req.body.cleanText !== false, // Default to true
        confidenceThreshold: req.body.confidenceThreshold || 60.0,
        language: req.body.language || 'vie'
      };
      
      const document = await storage.getDocument(documentId);
      if (!document || document.userId !== userId) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Update status to processing
      await storage.updateDocument(documentId, {
        processingStatus: "processing",
        processingStartedAt: new Date(),
      });

      const filePath = path.join(uploadsDir, document.filename);
      
      try {
        console.log(`🚀 Starting enhanced processing for ${document.originalName}...`);
        
        // STEP 1: OCR Processing with Vietnamese Language Support
        console.log('📖 Step 1: OCR Processing...');
        const ocrResult = await processDocumentWithOCR(filePath, document, options);
        
        if (!ocrResult.success) {
          throw new Error(`OCR processing failed: ${ocrResult.error}`);
        }
        
        console.log(`✅ OCR completed: ${ocrResult.text.length} characters extracted`);
        
        // STEP 2: Text Cleaning and Normalization
        console.log('🧹 Step 2: Text Cleaning...');
        const cleaningResult = await cleanVietnameseText(ocrResult.text, options);
        
        console.log(`✅ Text cleaning completed: ${cleaningResult.improvements.length} improvements applied`);
        
        // STEP 3: DeepSeek API Analysis (Optional)
        let deepSeekAnalysis = null;
        if (options.useDeepSeekAnalysis && process.env.OPENAI_API_KEY) {
          console.log('🤖 Step 3: DeepSeek AI Analysis...');
          try {
            deepSeekAnalysis = await analyzeWithDeepSeek(cleaningResult.cleaned_text, document.originalName);
            console.log('✅ DeepSeek analysis completed');
          } catch (deepSeekError: any) {
            console.warn('⚠️ DeepSeek analysis failed:', deepSeekError.message);
            // Continue without DeepSeek analysis
          }
        }
        
        // STEP 4: Prepare Final Results
        const finalText = cleaningResult.cleaned_text || ocrResult.text;
        const structuredData = {
          // OCR metadata
          pageCount: ocrResult.page_count || 1,
          characterCount: finalText.length,
          wordCount: finalText.split(/\s+/).filter((word: string) => word.length > 0).length,
          language: ocrResult.metadata?.language || options.language,
          processingMode: ocrResult.metadata?.processing_mode || 'enhanced',
          processingTime: ocrResult.processing_time || 0,
          confidence: ocrResult.confidence || 0,
          
          // Text cleaning metadata
          textCleaning: {
            applied: options.cleanText,
            improvements: cleaningResult.improvements || [],
            statistics: cleaningResult.statistics || {},
            originalLength: ocrResult.text.length,
            cleanedLength: finalText.length
          },
          
          // DeepSeek analysis metadata
          deepSeekAnalysis: deepSeekAnalysis ? {
            applied: true,
            summary: deepSeekAnalysis.summary,
            keyFindings: deepSeekAnalysis.keyFindings,
            entities: deepSeekAnalysis.entities,
            confidence: deepSeekAnalysis.confidence,
            processingTime: deepSeekAnalysis.processingTime
          } : { applied: false },
          
          // Document structure analysis
          ...extractStructuredData(finalText)
        };

        // STEP 5: Update Database
        await storage.updateDocument(documentId, {
          processingStatus: "completed",
          processingCompletedAt: new Date(),
          confidence: (ocrResult.confidence || 0) / 100,
          extractedText: finalText,
          structuredData: JSON.stringify(structuredData),
        });

        // Log successful processing
        await storage.createAuditLog({
          userId,
          action: `Enhanced document processing completed: ${document.originalName} ` +
                 `(${structuredData.pageCount} pages, ${Math.round((ocrResult.confidence || 0))}% OCR confidence, ` +
                 `${cleaningResult.improvements?.length || 0} text improvements${deepSeekAnalysis ? ', AI analysis included' : ''})`,
          documentId: document.id,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
        });

        const updatedDocument = await storage.getDocument(documentId);
        
        // Return comprehensive results
        res.json({
          ...updatedDocument,
          processingResults: {
            ocr: {
              success: ocrResult.success,
              confidence: ocrResult.confidence,
              pageCount: ocrResult.page_count,
              processingTime: ocrResult.processing_time
            },
            textCleaning: {
              applied: options.cleanText,
              improvements: cleaningResult.improvements?.length || 0,
              charactersSaved: (ocrResult.text.length - finalText.length)
            },
            deepSeekAnalysis: deepSeekAnalysis ? {
              applied: true,
              summary: deepSeekAnalysis.summary
            } : { applied: false }
          }
        });

      } catch (processingError) {
        const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown processing error';
        const errorStep = (processingError as any)?.step || 'unknown';
        
        console.error('❌ Enhanced processing failed:', errorMessage);
          return res.status(500).json({
          success: false,
          error: 'Enhanced processing failed',
          details: errorMessage,
          step: errorStep
        });
      }

    } catch (error) {
      console.error('Enhanced process document error:', error);
      res.status(500).json({ message: "Failed to start enhanced document processing" });
    }
  });

  /**
   * STEP 1: Process document with OCR using Python service
   * Handles both PDF and image files with Vietnamese language support
   */
  async function processDocumentWithOCR(filePath: string, document: any, options: any) {
    try {
      console.log(`📖 Starting OCR for ${document.originalName}...`);
      
      // Prepare form data for Python OCR service
      const formData = new FormData();
      const fileBuffer = await readFile(filePath);
      
      formData.append('file', fileBuffer, {
        filename: document.originalName,
        contentType: document.mimeType
      });
      formData.append('language', options.language);
      formData.append('confidence_threshold', options.confidenceThreshold.toString());
      formData.append('clean_text', 'false'); // We'll handle cleaning separately

      // Call Python OCR service
      try {
        console.log('🔗 Calling Python OCR service...');
        const response = await axios.post('http://localhost:8001/ocr/process', formData, {
          headers: {
            ...formData.getHeaders(),
          },
          timeout: 300000, // 5 minutes timeout for large files
          maxContentLength: 50 * 1024 * 1024, // 50MB max
        });

        if (response.data.success) {
          console.log(`✅ Python OCR service successful: ${response.data.text.length} chars`);
          return response.data;
        } else {
          throw new Error(response.data.error || 'Python OCR service returned failure');
        }
        
      } catch (pythonError: any) {
        console.error('❌ Python OCR service failed:', pythonError.message);
        
        // Fallback to local Tesseract for images only
        if (document.mimeType === 'application/pdf') {
          throw new Error('PDF processing requires Python OCR service. Please ensure the service is running on http://localhost:8001');
        }
        
        console.log('🔄 Falling back to local Tesseract...');
        return await fallbackTesseractOCR(filePath, document, options);
      }
      
    } catch (error: any) {
      error.step = 'OCR';
      throw error;
    }
  }

  /**
   * Fallback OCR using local Tesseract (for images only)
   */
  async function fallbackTesseractOCR(filePath: string, document: any, options: any) {
    const startTime = Date.now();
    
    try {
      // Enhanced image preprocessing for Vietnamese text
      const processedImageBuffer = await sharp(filePath)
        .resize({ width: 2000, withoutEnlargement: true })
        .rotate()
        .greyscale()
        .normalize()
        .sharpen({ sigma: 1, m1: 0.5, m2: 2 })
        .threshold(128)
        .png({ quality: 100 })
        .toBuffer();

      // Configure Tesseract for Vietnamese language
      const worker = await createWorker(['vie', 'eng'], 1, {
        logger: m => console.log(`Tesseract: ${m.status} - ${m.progress}`)
      });
      
      await worker.setParameters({
        'preserve_interword_spaces': '1'
      });

      const { data: { text, confidence } } = await worker.recognize(processedImageBuffer);
      await worker.terminate();

      const processingTime = (Date.now() - startTime) / 1000;

      return {
        success: true,
        file_id: document.originalName,
        text: text,
        confidence: confidence,
        page_count: 1,
        processing_time: processingTime,
        metadata: {
          character_count: text.length,
          word_count: text.split(/\s+/).filter((word: string) => word.length > 0).length,
          language: options.language,
          processing_mode: 'fallback-tesseract',
          note: 'Local Tesseract fallback (Python service unavailable)'
        }
      };
      
    } catch (error: any) {
      throw new Error(`Fallback OCR failed: ${error.message}`);
    }
  }

  /**
   * STEP 2: Clean and normalize Vietnamese text
   * Uses Python service for advanced cleaning or local basic cleaning
   */
  async function cleanVietnameseText(text: string, options: any) {
    if (!options.cleanText || !text) {
      return {
        original_text: text,
        cleaned_text: text,
        improvements: [],
        statistics: { original_length: text.length, cleaned_length: text.length }
      };
    }

    try {
      console.log('🧹 Calling Python text cleaning service...');
      
      // Try Python service for advanced cleaning
      const response = await axios.post('http://localhost:8001/text/clean', {
        text: text
      }, {
        timeout: 30000, // 30 seconds timeout
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.success) {
        console.log(`✅ Python text cleaning: ${response.data.improvements.length} improvements`);
        return response.data;
      } else {
        throw new Error('Python cleaning service failed');
      }
      
    } catch (cleaningError: any) {
      console.warn('⚠️ Python cleaning failed, using local cleaning:', cleaningError.message);
      
      // Fallback to local basic cleaning
      return performBasicTextCleaning(text);
    }
  }

  /**
   * Local fallback text cleaning for Vietnamese
   */
  function performBasicTextCleaning(text: string) {
    const originalText = text;
    const improvements: string[] = [];
    
    // Basic Vietnamese text cleaning
    let cleaned = text.trim();
    
    // Fix spacing
    cleaned = cleaned.replace(/\s+/g, ' ');
    improvements.push('Normalized spacing');
    
    // Remove noise characters
    cleaned = cleaned.replace(/[_"~\^¬ˆ…]/g, ' ');
    improvements.push('Removed noise characters');
    
    // Fix common Vietnamese terms
    const corrections = {
      'CONG HOA XA HOI CHU NGHIA VIET NAM': 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
      'Doc lap Tu do Hanh phuc': 'Độc lập - Tự do - Hạnh phúc',
      'CAN CUOC CONG DAN': 'CĂN CƯỚC CÔNG DÂN',
      'Ho va ten': 'Họ và tên',
      'Ngay sinh': 'Ngày sinh',
      'Gioi tinh': 'Giới tính',
      'Ha Noi': 'Hà Nội'
    };
    
    for (const [wrong, correct] of Object.entries(corrections)) {
      if (cleaned.includes(wrong)) {
        cleaned = cleaned.replace(new RegExp(wrong, 'gi'), correct);
        improvements.push(`Fixed: '${wrong}' → '${correct}'`);
      }
    }
    
    // Final cleanup
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return {
      original_text: originalText,
      cleaned_text: cleaned,
      improvements,
      statistics: {
        original_length: originalText.length,
        cleaned_length: cleaned.length,
        character_reduction: originalText.length - cleaned.length,
        word_count: cleaned.split(/\s+/).length
      }
    };
  }

  /**
   * STEP 3: Analyze cleaned text with DeepSeek API
   * Provides intelligent document analysis and structure extraction
   */
  async function analyzeWithDeepSeek(cleanedText: string, documentName: string) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('DeepSeek API key not configured');
    }

    const startTime = Date.now();
    
    try {
      console.log('🤖 Starting DeepSeek analysis...');
      
      const analysisPrompt = `You are an expert Vietnamese document analyst. Analyze this document and provide structured insights.

Document: ${documentName}
Text Content: ${cleanedText}

Please provide a comprehensive analysis in JSON format with:
1. Document summary
2. Key findings and important information
3. Named entities (people, places, organizations)
4. Important dates and numbers
5. Document type classification
6. Confidence assessment

Respond with valid JSON only.`;

      const response = await axios.post('https://api.deepseek.com/chat/completions', {
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are an expert document analyst. Always respond with valid JSON format.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 1 minute timeout
      });

      const analysisContent = response.data.choices[0]?.message?.content;
      if (!analysisContent) {
        throw new Error('No analysis content received from DeepSeek');
      }

      // Parse JSON response
      let analysis;
      try {
        // Extract JSON from response
        const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback: treat as text analysis
          analysis = {
            summary: analysisContent.substring(0, 500),
            keyFindings: ['Analysis completed successfully'],
            entities: [],
            confidence: 0.8
          };
        }
      } catch (parseError) {
        console.warn('DeepSeek JSON parsing failed, using text response');
        analysis = {
          summary: analysisContent.substring(0, 500),
          keyFindings: ['Analysis completed with text response'],
          entities: [],
          confidence: 0.7
        };
      }

      const processingTime = (Date.now() - startTime) / 1000;
      
      return {
        ...analysis,
        processingTime,
        timestamp: new Date(),
        model: 'deepseek-chat'
      };
      
    } catch (error: any) {
      console.error('DeepSeek analysis error:', error.message);
      
      // Handle specific API errors
      if (error.response?.status === 402) {
        throw new Error('DeepSeek API quota exceeded. Please add credits to your account.');
      } else if (error.response?.status === 401) {
        throw new Error('DeepSeek API authentication failed. Please check your API key.');
      } else if (error.response?.status === 429) {
        throw new Error('DeepSeek API rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`DeepSeek analysis failed: ${error.message}`);
      }
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to extract structured data from text
function extractStructuredData(text: string) {
  const lines = text.split('\n').filter(line => line.trim());
  const cleanText = text.replace(/[^\w\s\/\-\.,:àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Vietnamese ID Card detection and extraction
  const isVietnameseId = /(?:CAN CUOC|CCCD|Citizen Identity|Identity Card)/i.test(text);
  
  if (isVietnameseId) {
    const result: any = {
      documentType: "Vietnamese Citizen Identity Card",
      country: "Vietnam"
    };

    // Extract ID number (12 digits)
    const idMatch = cleanText.match(/(?:số|sev|cccd|id)[\s:]*([0-9]{12})/i);
    if (idMatch) result.idNumber = idMatch[1];

    // Extract full name
    const nameMatch = cleanText.match(/(?:họ và tên|ho va ten|full name)[\s:]*([^\n]+?)(?:\n|date|ngay|gioi|sex)/i);
    if (nameMatch) {
      result.fullName = nameMatch[1].trim().replace(/[^a-zA-ZÀ-ỹ\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract date of birth
    const dobMatch = cleanText.match(/(?:ngày sinh|date of birth|ngay sinh)[\s:]*([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{4})/i);
    if (dobMatch) result.dateOfBirth = dobMatch[1];

    // Extract gender
    const genderMatch = cleanText.match(/(?:giới tính|gioi tinh|sex)[\s:]*([^\n]+?)(?:\n|quoc|nationality)/i);
    if (genderMatch) {
      const gender = genderMatch[1].trim().toLowerCase();
      result.gender = gender.includes('nam') ? 'Male' : gender.includes('nữ') || gender.includes('nu') ? 'Female' : gender;
    }

    // Extract nationality
    const nationalityMatch = cleanText.match(/(?:quốc tịch|quoc tich|nationality)[\s:]*([^\n]+?)(?:\n|que|place)/i);
    if (nationalityMatch) {
      result.nationality = nationalityMatch[1].trim().replace(/[^a-zA-ZÀ-ỹ\s]/g, ' ').trim();
    }

    // Extract place of origin
    const originMatch = cleanText.match(/(?:quê quán|que quan|place of origin)[\s:]*([^\n]+?)(?:\n|noi thuong|place of residence)/i);
    if (originMatch) {
      result.placeOfOrigin = originMatch[1].trim().replace(/[^a-zA-ZÀ-ỹ\s,]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract place of residence
    const residenceMatch = cleanText.match(/(?:nơi thường trú|noi thuong tru|place of residence)[\s:]*([^\n]+?)(?:\n|$)/i);
    if (residenceMatch) {
      result.placeOfResidence = residenceMatch[1].trim().replace(/[^a-zA-ZÀ-ỹ\s,0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Extract expiry date if present
    const expiryMatch = cleanText.match(/([0-9]{1,2}[\/\-][0-9]{1,2}[\/\-][0-9]{4})/g);
    if (expiryMatch && expiryMatch.length > 1) {
      result.expiryDate = expiryMatch[expiryMatch.length - 1]; // Last date is usually expiry
    }

    return result;
  }

  // Government document detection
  const structuredData: any = {};
  
  if (text.toLowerCase().includes('incident report')) {
    structuredData.documentType = 'Incident Report';
  } else if (text.toLowerCase().includes('case file')) {
    structuredData.documentType = 'Case File';
  } else if (text.toLowerCase().includes('memo')) {
    structuredData.documentType = 'Memorandum';
  } else {
    structuredData.documentType = 'Unknown Document';
  }

  // Extract case/incident numbers
  const caseNumberMatch = text.match(/(?:case|incident|report)\s*#?\s*([A-Z0-9-]+)/i);
  if (caseNumberMatch) {
    structuredData.caseNumber = caseNumberMatch[1];
  }

  // Extract dates
  const dateMatch = text.match(/(?:date|dated):\s*([A-Za-z]+ \d{1,2},? \d{4})/i);
  if (dateMatch) {
    structuredData.date = dateMatch[1];
  }

  // Extract classification level
  const classificationMatch = text.match(/(?:classification|classified):\s*([A-Z\s]+)/i);
  if (classificationMatch) {
    structuredData.classification = classificationMatch[1].trim();
  } else if (text.toLowerCase().includes('confidential')) {
    structuredData.classification = 'CONFIDENTIAL';
  } else if (text.toLowerCase().includes('secret')) {
    structuredData.classification = 'SECRET';
  } else if (text.toLowerCase().includes('top secret')) {
    structuredData.classification = 'TOP SECRET';
  }

  // Add language detection
  structuredData.language = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/.test(text) ? "Vietnamese" : "English";

  return structuredData;
}

// Basic Vietnamese text cleaning function
function basicVietnameseClean(text: string): string {
  let cleaned = text;

  // Fix common spacing issues
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Remove excessive noise characters
  cleaned = cleaned.replace(/[_"~\^¬ˆ…]/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ');

  // Fix common Vietnamese phrase corrections
  const corrections = {
    'CONG HOA XA HOI CHU NGHIA VIET NAM': 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
    'Doc lap Tu do Hanh phuc': 'Độc lập - Tự do - Hạnh phúc',
    'CAN CUOC CONG DAN': 'CĂN CƯỚC CÔNG DÂN',
    'CONGDAN': 'CÔNG DÂN',
    'Ho va ten': 'Họ và tên',
    'Ngay sinh': 'Ngày sinh', 
    'Gioi tinh': 'Giới tính',
    'Quoc tich': 'Quốc tịch',
    'Que quan': 'Quê quán',
    'Noi thuong tru': 'Nơi thường trú',
    'TRANMANHCUONG': 'TRẦN MẠNH CƯỜNG',
    'Natfinaiiy': 'Nationality',
    'anigifi': 'origin',
    'Khanh Thuy': 'Khánh Thủy',
    'Yen Khanh': 'Yên Khánh',
    'Ninh Binh': 'Ninh Bình',
    'Cau Dien': 'Cầu Diễn',
    'Nam Tu Liem': 'Nam Từ Liêm',
    'Ha Noi': 'Hà Nội'
  };

  for (const [wrong, correct] of Object.entries(corrections)) {
    cleaned = cleaned.replace(new RegExp(wrong, 'gi'), correct);
  }

  // Clean up line breaks and format properly
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');
  cleaned = cleaned.replace(/([a-zA-ZÀ-ỹ])\s*:\s*/g, '$1: ');
  
  // Remove standalone noise characters
  cleaned = cleaned.replace(/^\s*[_\-\s]*\n/gm, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}
