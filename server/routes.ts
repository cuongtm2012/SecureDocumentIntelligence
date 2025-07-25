import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { spawn } from "child_process";
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
      // First extract text using direct OCR
      const directResult = await directOCRProcessor.processDocument(filePath);
      console.log(`📝 Initial OCR extracted ${directResult.extractedText.length} characters with ${Math.round(directResult.confidence * 100)}% confidence`);
      
      // Then enhance the OCR text with DeepSeek reconstruction
      let enhancedText = directResult.extractedText;
      let deepseekImprovements: string[] = [];
      let finalConfidence = directResult.confidence;
      
      if (directResult.extractedText.length > 10) {
        console.log('🤖 Enhancing OCR text with DeepSeek reconstruction...');
        const reconstruction = await deepSeekService.reconstructVietnameseText(directResult.extractedText);
        enhancedText = reconstruction.reconstructedText;
        deepseekImprovements = reconstruction.improvements;
        finalConfidence = Math.max(directResult.confidence, reconstruction.confidence);
        console.log(`✨ DeepSeek enhanced text: ${enhancedText.length} characters, ${Math.round(finalConfidence * 100)}% confidence`);
      }
      
      // Also perform document analysis on the enhanced text
      const deepseekAnalysis = await deepSeekService.analyzeDocument(
        enhancedText, 
        "Vietnamese government document analysis"
      );
      
      ocrResult = {
        success: true,
        file_id: document.originalName,
        text: enhancedText, // Use enhanced text instead of raw OCR
        confidence: finalConfidence,
        page_count: directResult.pageCount,
        processing_time: directResult.processingTime / 1000,
        metadata: {
          character_count: enhancedText.length,
          word_count: enhancedText.split(/\s+/).filter(word => word.length > 0).length,
          language: 'vie',
          confidence_threshold: 60.0,
          processing_timestamp: new Date(),
          file_size_bytes: document.fileSize,
          processing_mode: 'deepseek-enhanced',
          deepseek_analysis: deepseekAnalysis,
          deepseek_improvements: deepseekImprovements,
          original_ocr_confidence: directResult.confidence,
          note: 'Processed with DeepSeek API text reconstruction + analysis'
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
  const confidence = Math.min((ocrResult.confidence || 0), 1); // Don't divide by 100 if already decimal
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
    deepseekImprovements: ocrResult.metadata?.deepseek_improvements || [],
    originalOcrConfidence: ocrResult.metadata?.original_ocr_confidence || confidence,
    text_reconstruction: {
      applied: (ocrResult.metadata?.deepseek_improvements || []).length > 0,
      improvements: ocrResult.metadata?.deepseek_improvements || [],
      confidence: confidence
    },
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

  // Get PDF pages as images
  app.get("/api/documents/:id/pages", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // Only process PDF files
      if (document.mimeType !== 'application/pdf') {
        return res.json({ 
          success: false, 
          message: "Document is not a PDF",
          images: []
        });
      }

      // Download R2 file to temp location for processing
      const tempDir = '/tmp';
      const originalExt = path.extname(document.originalName) || path.extname(document.filename);
      const tempFileName = `pages-temp-${documentId}-${Date.now()}${originalExt}`;
      const filePath = path.join(tempDir, tempFileName);

      try {
        const { stream } = await storageService.downloadFile(document.filename);
        const writeStream = fs.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
          stream.pipe(writeStream);
          stream.on('end', resolve);
          stream.on('error', reject);
        });

        // Convert PDF to images
        const outputDir = path.join(tempDir, `pdf_pages_${documentId}_${Date.now()}`);
        fs.mkdirSync(outputDir, { recursive: true });
        
        const convertArgs = [
          '-density', '200',
          '-quality', '90',
          '-colorspace', 'RGB',
          filePath,
          path.join(outputDir, 'page-%d.png')
        ];

        await new Promise((resolve, reject) => {
          const convert = spawn('convert', convertArgs);
          convert.on('close', (code) => {
            if (code === 0) {
              resolve(null);
            } else {
              reject(new Error(`PDF conversion failed with code ${code}`));
            }
          });
          convert.on('error', reject);
        });

        // Find generated page images
        const pageFiles = fs.readdirSync(outputDir)
          .filter(file => file.startsWith('page-') && file.endsWith('.png'))
          .sort((a, b) => {
            const numA = parseInt(a.match(/page-(\d+)\.png/)?.[1] || '0');
            const numB = parseInt(b.match(/page-(\d+)\.png/)?.[1] || '0');
            return numA - numB;
          });

        const imageUrls = pageFiles.map(file => `/api/documents/${documentId}/page/${file}`);

        // Cleanup temp PDF file
        fs.unlinkSync(filePath);

        res.json({
          success: true,
          images: imageUrls,
          pageCount: pageFiles.length
        });

      } catch (conversionError) {
        console.error('PDF conversion error:', conversionError);
        // Cleanup temp file if it exists
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        
        res.json({
          success: false,
          message: "Failed to convert PDF to images",
          images: []
        });
      }

    } catch (error) {
      console.error('Get PDF pages error:', error);
      res.status(500).json({ message: "Failed to get PDF pages" });
    }
  });

  // Get document thumbnail
  app.get("/api/documents/:id/thumbnail", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      // For PDFs, generate thumbnail from first page
      if (document.mimeType === 'application/pdf') {
        // Download R2 file to temp location
        const tempDir = '/tmp';
        const tempFileName = `thumb-temp-${documentId}-${Date.now()}.pdf`;
        const filePath = path.join(tempDir, tempFileName);
        const thumbnailPath = path.join(tempDir, `thumb-${documentId}-${Date.now()}.png`);

        try {
          const { stream } = await storageService.downloadFile(document.filename);
          const writeStream = fs.createWriteStream(filePath);
          await new Promise((resolve, reject) => {
            stream.pipe(writeStream);
            stream.on('end', resolve);
            stream.on('error', reject);
          });

          // Generate thumbnail from first page
          const convertArgs = [
            '-density', '150',
            '-quality', '90',
            '-resize', '300x400>',
            `${filePath}[0]`, // First page only
            thumbnailPath
          ];

          await new Promise((resolve, reject) => {
            const convert = spawn('convert', convertArgs);
            convert.on('close', (code) => {
              if (code === 0) {
                resolve(null);
              } else {
                reject(new Error(`Thumbnail generation failed with code ${code}`));
              }
            });
            convert.on('error', reject);
          });

          // Serve the thumbnail
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=3600');
          const thumbnailStream = fs.createReadStream(thumbnailPath);
          thumbnailStream.pipe(res);

          // Cleanup temp files after serving
          thumbnailStream.on('end', () => {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
          });

        } catch (error) {
          console.error('Thumbnail generation error:', error);
          // Cleanup temp files
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          if (fs.existsSync(thumbnailPath)) fs.unlinkSync(thumbnailPath);
          
          res.status(500).json({ message: "Failed to generate thumbnail" });
        }
      } else {
        // For images, serve the original file as thumbnail
        const { stream } = await storageService.downloadFile(document.filename);
        res.setHeader('Content-Type', document.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        stream.pipe(res);
      }

    } catch (error) {
      console.error('Get thumbnail error:', error);
      res.status(500).json({ message: "Failed to get thumbnail" });
    }
  });

  // Serve individual PDF page images
  app.get("/api/documents/:id/page/:filename", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const filename = req.params.filename;
      
      // Security: validate filename format
      if (!/^page-\d+\.png$/.test(filename)) {
        return res.status(400).json({ message: "Invalid page filename" });
      }

      const tempDir = '/tmp';
      const outputDir = path.join(tempDir, `pdf_pages_${documentId}_*`);
      
      // Find the correct page directory
      const dirs = fs.readdirSync(tempDir)
        .filter(dir => dir.startsWith(`pdf_pages_${documentId}_`))
        .map(dir => path.join(tempDir, dir))
        .filter(dir => fs.statSync(dir).isDirectory());
      
      if (dirs.length === 0) {
        return res.status(404).json({ message: "Page images not found" });
      }

      const pagePath = path.join(dirs[0], filename);
      
      if (!fs.existsSync(pagePath)) {
        return res.status(404).json({ message: "Page image not found" });
      }

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      const pageStream = fs.createReadStream(pagePath);
      pageStream.pipe(res);

    } catch (error) {
      console.error('Get page image error:', error);
      res.status(500).json({ message: "Failed to get page image" });
    }
  });

  // R2 Storage management endpoints
  app.get("/api/r2/list", async (req, res) => {
    try {
      if (storageService.useR2 && storageService.r2Storage) {
        const result = await storageService.r2Storage.listFiles();
        res.json({ success: true, files: result.files, count: result.files.length });
      } else {
        res.json({ success: true, files: [], count: 0, message: "R2 not configured" });
      }
    } catch (error) {
      console.error('R2 list error:', error);
      res.status(500).json({ success: false, message: "Failed to list R2 files" });
    }
  });

  app.post("/api/r2/cleanup", async (req, res) => {
    try {
      if (storageService.useR2 && storageService.r2Storage) {
        const result = await storageService.r2Storage.listFiles();
        let deletedCount = 0;
        
        console.log(`🧹 Starting R2 cleanup: ${result.files.length} files found`);
        
        for (const file of result.files) {
          try {
            await storageService.r2Storage.deleteFile(file.filename);
            deletedCount++;
            console.log(`🗑️ Deleted R2 file: ${file.filename}`);
          } catch (deleteError) {
            console.warn(`Failed to delete R2 file ${file.filename}:`, deleteError);
          }
        }
        
        console.log(`🧹 R2 cleanup completed: ${deletedCount}/${result.files.length} files deleted`);
        res.json({ success: true, deletedCount, totalFound: result.files.length, message: `Deleted ${deletedCount} files from R2 storage` });
      } else {
        res.json({ success: false, message: "R2 storage not configured or available" });
      }
    } catch (error) {
      console.error('R2 cleanup error:', error);
      res.status(500).json({ success: false, message: "R2 cleanup failed" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}