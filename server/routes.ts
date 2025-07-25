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
import { storageService } from "./storage-service";

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

// Configure multer for R2 cloud storage (memory storage only)
const upload = multer({
  storage: multer.memoryStorage(),
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

// R2 cloud storage is used exclusively - no local uploads directory needed

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
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
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

      // Upload file to R2 cloud storage
      const fileBuffer = req.file.buffer;
      const uniqueFilename = `${Date.now()}-${Date.now()}-${req.file.originalname}`;

      console.log(`📤 Uploading file: ${req.file.originalname} (${fileBuffer.length} bytes) to R2 cloud storage`);

      const uploadResult = await storageService.uploadFile(
        fileBuffer,
        uniqueFilename,
        req.file.originalname,
        req.file.mimetype
      );

      console.log(`✅ File uploaded successfully to R2: ${uploadResult.key}`);

      const documentData = {
        filename: uploadResult.key,
        originalName: req.file.originalname,
        fileSize: uploadResult.metadata.size,
        mimeType: uploadResult.metadata.contentType,
        userId,
        processingStatus: 'pending' as const,
        storageType: 'r2',
      };

      const document = await storage.createDocument(documentData);

      // Log upload
      await storage.createAuditLog({
        userId,
        action: `Document uploaded: ${req.file.originalname} (${uploadResult.metadata.size} bytes) via R2 cloud storage`,
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

      // Download R2 file to temp location for processing
      const tempDir = '/tmp';
      const originalExt = path.extname(document.originalName) || path.extname(document.filename);
      const tempFileName = `ocr-temp-${documentId}-${Date.now()}${originalExt}`;
      const filePath = path.join(tempDir, tempFileName);

      console.log(`📥 Downloading R2 file for processing: ${document.filename}`);
      const { stream } = await storageService.downloadFile(document.filename);
      const writeStream = fs.createWriteStream(filePath);
      await new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      // Process the file with DeepSeek API workflow
      await processFileWithFallback(filePath, document, documentId, userId, req, res);

      // Clean up temp file
      try {
        await fs.promises.unlink(filePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError);
      }

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

      // Download R2 file to temp location for serving
      const tempDir = '/tmp';
      const originalExt = path.extname(document.originalName) || path.extname(document.filename);
      const tempFileName = `serve-temp-${documentId}-${Date.now()}${originalExt}`;
      const filePath = path.join(tempDir, tempFileName);

      const { stream } = await storageService.downloadFile(document.filename);
      const writeStream = fs.createWriteStream(filePath);
      await new Promise((resolve, reject) => {
        stream.pipe(writeStream);
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      
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

  // R2 Storage management endpoints
  app.get("/api/r2/list", async (req, res) => {
    try {
      const files = await storageService.listFiles();
      res.json({ success: true, files, count: files.length });
    } catch (error) {
      console.error('R2 list error:', error);
      res.status(500).json({ success: false, message: "Failed to list R2 files" });
    }
  });

  app.post("/api/r2/cleanup", async (req, res) => {
    try {
      const files = await storageService.listFiles();
      let deletedCount = 0;
      
      for (const file of files) {
        try {
          await storageService.deleteFile(file.key);
          deletedCount++;
          console.log(`🗑️ Deleted R2 file: ${file.key}`);
        } catch (deleteError) {
          console.warn(`Failed to delete R2 file ${file.key}:`, deleteError);
        }
      }
      
      console.log(`🧹 R2 cleanup completed: ${deletedCount} files deleted`);
      res.json({ success: true, deletedCount, message: `Deleted ${deletedCount} files from R2 storage` });
    } catch (error) {
      console.error('R2 cleanup error:', error);
      res.status(500).json({ success: false, message: "R2 cleanup failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}