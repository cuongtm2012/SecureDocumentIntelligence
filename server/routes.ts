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
import FormData from 'form-data';
import axios from 'axios';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

// Configure multer for file uploads
const storage_config = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsPath = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsPath)) {
      fs.mkdirSync(uploadsPath, { recursive: true });
    }
    cb(null, uploadsPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage_config,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg', 
      'image/png'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPG, and PNG files are allowed.'));
    }
  }
});

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Helper function to process file with DeepSeek API as primary workflow
async function processFileWithFallback(filePath: string, document: any, documentId: number, userId: number, req: any, res: any) {
  console.log(`🚀 Processing document ${document.originalName} with DeepSeek API workflow...`);
  
  let ocrResult;

  // Primary workflow: DeepSeek API processing
  if (process.env.OPENAI_API_KEY) {
    console.log('🤖 Starting DeepSeek API document processing...');
    
    try {
      // First extract text using direct OCR for DeepSeek analysis
      const directResult = await directOCRProcessor.processDocument(filePath);
      
      // Then enhance with DeepSeek analysis
      const deepseekAnalysis = await deepSeekService.analyzeDocument(
        directResult.extractedText, 
        "Vietnamese government document analysis"
      );
      
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
          processing_mode: 'deepseek-api',
          deepseek_analysis: deepseekAnalysis,
          note: 'Processed with DeepSeek API workflow'
        }
      };
      
      console.log('✅ DeepSeek API processing completed successfully');
      
    } catch (deepseekError) {
      console.warn('⚠️ DeepSeek API processing failed, trying direct OCR fallback...');
      console.error('DeepSeek error:', deepseekError instanceof Error ? deepseekError.message : deepseekError);
      
      // Direct OCR fallback
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
            processing_mode: 'direct-fallback',
            note: 'Processed with direct OCR (DeepSeek unavailable)'
          }
        };
      } catch (directError: any) {
        throw new Error('OCR processing failed: ' + (directError.message || 'Unknown error'));
      }
    }
  } else {
    console.log('⚠️ No DeepSeek API key available, using direct OCR fallback...');
    
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
          processing_mode: 'direct-fallback',
          note: 'Processed with direct OCR (no API key)'
        }
      };
    } catch (directError: any) {
      throw new Error('OCR processing failed: ' + (directError.message || 'Unknown error'));
    }
  }

  // Extract data from OCR result
  const extractedText = ocrResult.text || '';
  const confidence = Math.min((ocrResult.confidence || 0) / 100, 1);
  const deepseekAnalysis = ocrResult.metadata?.deepseek_analysis || {
    applied: false,
    reason: 'Not processed with DeepSeek workflow'
  };

  // Prepare structured data
  const structuredData = {
    pageCount: ocrResult.page_count || 1,
    characterCount: extractedText.length,
    wordCount: extractedText.split(/\s+/).filter(word => word.length > 0).length,
    language: ocrResult.metadata?.language || 'Vietnamese',
    processingMode: ocrResult.metadata?.processing_mode || 'direct-fallback',
    processingTime: ocrResult.processing_time || 0,
    deepseekAnalysis: deepseekAnalysis,
    documentType: 'Unknown Document'
  };

  // Update document with processing results
  await storage.updateDocument(documentId, {
    processingStatus: 'completed',
    processingCompletedAt: new Date(),
    confidence,
    extractedText,
    structuredData: JSON.stringify(structuredData),
  });

  // Log successful processing
  await storage.createAuditLog({
    userId,
    action: `Document processed: ${document.originalName} (${structuredData.pageCount} pages, ${Math.round(confidence * 100)}% confidence)`,
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
  
  // Apply security headers
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
        frameSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'self'", "data:", "blob:"],
        upgradeInsecureRequests: [],
      },
    },
  }));

  // Document upload endpoint
  app.post("/api/documents/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = 1; // Default user ID

      const documentData = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        userId,
        processingStatus: 'pending' as const,
      };

      const document = await storage.createDocument(documentData);

      // Log upload
      await storage.createAuditLog({
        userId,
        action: `Document uploaded: ${req.file.originalname} (${req.file.size} bytes)`,
        documentId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json(document);
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ message: "Upload failed" });
    }
  });

  // Document processing endpoint
  app.post("/api/documents/:id/process", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const userId = 1; // Default user ID

      const document = await storage.getDocument(documentId);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Update status to processing
      await storage.updateDocument(documentId, {
        processingStatus: 'processing',
        processingStartedAt: new Date(),
      });

      const filePath = path.join(uploadsDir, document.filename);

      // Process the file with DeepSeek API workflow
      await processFileWithFallback(filePath, document, documentId, userId, req, res);

    } catch (error) {
      console.error('Processing error:', error);
      
      // Update document status to failed
      const documentId = parseInt(req.params.id);
      await storage.updateDocument(documentId, {
        processingStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: "Enhanced processing failed",
        details: error instanceof Error ? error.message : 'Unknown error',
        step: "unknown"
      });
    }
  });

  // Get all documents
  app.get("/api/documents", async (req, res) => {
    try {
      const documents = await storage.getAllDocuments();
      res.json(documents);
    } catch (error) {
      console.error('Get documents error:', error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  // Get document by ID
  app.get("/api/documents/:id", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.json(document);
    } catch (error) {
      console.error('Get document error:', error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  // Get raw document file
  app.get("/api/documents/:id/raw", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const filePath = path.join(uploadsDir, document.filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found" });
      }

      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);
      
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error('Get raw document error:', error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  // Get PDF pages as images (fallback endpoint)
  app.get("/api/documents/:id/pages", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const filePath = path.join(process.cwd(), 'uploads', document.filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found" });
      }

      // For now, return the raw PDF URL as fallback
      // In a full implementation, this would convert PDF pages to images
      const pdfUrl = `/api/documents/${documentId}/raw?t=${Date.now()}`;
      
      res.json({
        success: false, // Indicates fallback mode
        images: [pdfUrl],
        message: "Falling back to direct PDF display"
      });
    } catch (error) {
      console.error('Get PDF pages error:', error);
      res.status(500).json({ message: "Failed to fetch PDF pages" });
    }
  });

  // Get document thumbnail endpoint (for EnhancedOCRViewer)
  app.get("/api/documents/:id/thumbnail", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // For PDF files, redirect to the raw PDF endpoint  
      // For images, we could serve the image directly
      const rawUrl = `/api/documents/${documentId}/raw`;
      
      // Redirect to the raw document
      res.redirect(rawUrl);
    } catch (error) {
      console.error('Get thumbnail error:', error);
      res.status(500).json({ message: "Failed to get document thumbnail" });
    }
  });

  // Get user info
  app.get("/api/user", async (req, res) => {
    try {
      const user = await storage.getUser(1); // Default user
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}