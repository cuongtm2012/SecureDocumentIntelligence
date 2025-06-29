import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { promisify } from "util";
import { spawn } from "child_process";

import sharp from "sharp";
import { deepSeekService } from "./deepseek-service";
import { vietnameseTextCleaner } from "./vietnamese-text-cleaner";
import { enhancedVietnameseOCR } from "./enhanced-vietnamese-ocr";
import { pdfProcessor } from "./pdf-processor";
import { simpleTesseractProcessor } from "./simple-tesseract-processor";
import { vietnameseReceiptOCRProcessor } from "./vietnamese-receipt-ocr-processor";
import { enhancedTesseractProcessor } from "./enhanced-tesseract-processor";
import { trainingPipeline } from "./training-pipeline";
import helmet from "helmet";
import { insertDocumentSchema, insertAuditLogSchema } from "@shared/schema";
import { z } from "zod";
import { initializeDatabase } from "./init-db";
import FormData from 'form-data';
import axios from 'axios';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

// PDF to images conversion function
async function convertPDFToImages(pdfPath: string, outputPattern: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-density', '200',
      '-colorspace', 'RGB',
      '-alpha', 'remove',
      '-background', 'white',
      pdfPath,
      outputPattern
    ];
    
    console.log(`🔄 Running: convert ${args.join(' ')}`);
    
    const convert = spawn('convert', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stderr = '';
    
    convert.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    
    convert.on('close', (code: number) => {
      if (code === 0) {
        console.log('✅ PDF to images conversion completed');
        resolve();
      } else {
        reject(new Error(`ImageMagick failed with code ${code}: ${stderr}`));
      }
    });
    
    convert.on('error', (error: any) => {
      reject(new Error(`Failed to start ImageMagick: ${error.message}`));
    });
    
    setTimeout(() => {
      convert.kill('SIGTERM');
      reject(new Error('PDF conversion timeout'));
    }, 30000);
  });
}

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
async function processFileWithFallback(filePath: string, document: any, documentId: number, userId: number, req?: any, res?: any) {
  console.log(`🚀 Processing document ${document.originalName} with OpenCV + DeepSeek API workflow...`);
  
  // Check if this might be a receipt based on filename or document type
  const isReceiptDocument = document.originalName.toLowerCase().includes('receipt') || 
                           document.originalName.toLowerCase().includes('hóa đơn') ||
                           document.originalName.toLowerCase().includes('biên lai');
  
  let finalOcrResult;

  // Primary workflow: DeepSeek API processing
  if (process.env.OPENAI_API_KEY) {
    console.log('🤖 Starting DeepSeek API document processing...');
    
    try {
      // Choose OCR processor based on document type
      let ocrResult;
      if (isReceiptDocument) {
        console.log('🧾 Using optimized Vietnamese receipt OCR processor...');
        ocrResult = await vietnameseReceiptOCRProcessor.processDocument(filePath);
      } else {
        console.log('📄 Using standard Vietnamese OCR processor...');
        ocrResult = await simpleTesseractProcessor.processDocument(filePath);
      }
      
      // Then enhance with DeepSeek analysis for Vietnamese text improvement
      const deepseekAnalysis = await deepSeekService.analyzeDocument(
        ocrResult.extractedText, 
        "Vietnamese government document analysis"
      );
      
      finalOcrResult = {
        success: true,
        file_id: document.originalName,
        text: ocrResult.extractedText,
        confidence: ocrResult.confidence,
        page_count: ocrResult.pageCount,
        processing_time: ocrResult.processingTime / 1000,
        metadata: {
          character_count: ocrResult.extractedText.length,
          word_count: ocrResult.extractedText.split(/\s+/).filter((word: string) => word.length > 0).length,
          language: 'vie',
          confidence_threshold: 60.0,
          processing_timestamp: new Date(),
          file_size_bytes: document.fileSize,
          processing_mode: 'paddleocr-deepseek',
          deepseek_analysis: deepseekAnalysis,
          note: 'Processed with PaddleOCR + DeepSeek API for optimal Vietnamese text extraction'
        }
      };
      
      console.log('✅ DeepSeek API processing completed successfully');
      
    } catch (deepseekError) {
      console.warn('⚠️ DeepSeek API processing failed, trying direct OCR fallback...');
      console.error('DeepSeek error:', deepseekError instanceof Error ? deepseekError.message : deepseekError);
      
      // Direct OCR fallback
      try {
        let directResult;
        if (isReceiptDocument) {
          console.log('🧾 Fallback: Using Vietnamese receipt OCR processor...');
          directResult = await vietnameseReceiptOCRProcessor.processDocument(filePath);
        } else {
          directResult = await simpleTesseractProcessor.processDocument(filePath);
        }
        
        finalOcrResult = {
          success: true,
          file_id: document.originalName,
          text: directResult.extractedText,
          confidence: directResult.confidence,
          page_count: directResult.pageCount,
          processing_time: directResult.processingTime / 1000,
          metadata: {
            character_count: directResult.extractedText.length,
            word_count: directResult.extractedText.split(/\s+/).filter((word: string) => word.length > 0).length,
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
      let directResult;
      if (isReceiptDocument) {
        console.log('🧾 No API: Using Vietnamese receipt OCR processor...');
        directResult = await vietnameseReceiptOCRProcessor.processDocument(filePath);
      } else {
        directResult = await simpleTesseractProcessor.processDocument(filePath);
      }
      
      finalOcrResult = {
        success: true,
        file_id: document.originalName,
        text: directResult.extractedText,
        confidence: directResult.confidence,
        page_count: directResult.pageCount,
        processing_time: directResult.processingTime / 1000,
        metadata: {
          character_count: directResult.extractedText.length,
          word_count: directResult.extractedText.split(/\s+/).filter((word: string) => word.length > 0).length,
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
  const extractedText = finalOcrResult.text || '';
  const confidence = Math.min((finalOcrResult.confidence || 0) / 100, 1);
  const deepseekAnalysis = finalOcrResult.metadata?.deepseek_analysis || {
    applied: false,
    reason: 'Not processed with DeepSeek workflow'
  };

  // Prepare structured data with receipt-specific information
  const structuredData = {
    pageCount: finalOcrResult.page_count || 1,
    characterCount: extractedText.length,
    wordCount: extractedText.split(/\s+/).filter((word: string) => word.length > 0).length,
    language: finalOcrResult.metadata?.language || 'Vietnamese',
    processingMode: finalOcrResult.metadata?.processing_mode || 'direct-fallback',
    processingTime: finalOcrResult.processing_time || 0,
    deepseekAnalysis: deepseekAnalysis,
    documentType: isReceiptDocument ? 'Vietnamese Receipt' : 'Unknown Document',
    isReceiptDocument,
    // Add receipt-specific structured data if available (from Vietnamese receipt processor)
    ...((finalOcrResult as any).structuredData && {
      receiptData: (finalOcrResult as any).structuredData,
      storeName: (finalOcrResult as any).structuredData.storeName,
      receiptTotal: (finalOcrResult as any).structuredData.total,
      receiptDate: (finalOcrResult as any).structuredData.date,
      itemCount: (finalOcrResult as any).structuredData.items?.length || 0
    }),
    // Add preprocessing information if available (from Vietnamese receipt processor)
    ...((finalOcrResult as any).preprocessingSteps && {
      preprocessingSteps: (finalOcrResult as any).preprocessingSteps
    })
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
    ipAddress: req?.ip || '127.0.0.1',
    userAgent: req?.get('User-Agent') || 'Background Process',
  });

  const updatedDocument = await storage.getDocument(documentId);
  
  // Only send response if res is provided (not background processing)
  if (res) {
    res.json(updatedDocument);
  }
  
  return updatedDocument;
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

      // Automatically start OCR processing after upload (background)
      console.log(`🚀 Auto-starting OCR processing for document ${document.id}...`);
      
      // Process in background without blocking the response
      setImmediate(async () => {
        try {
          const filePath = path.join(process.cwd(), 'uploads', document.filename);
          
          // Update status to processing
          await storage.updateDocument(document.id, { processingStatus: 'processing' });
          
          // Process the document
          await processFileWithFallback(filePath, document, document.id, userId, undefined, undefined);
          
          console.log(`✅ Auto-processing completed for document ${document.id}`);
        } catch (error) {
          console.error(`❌ Auto-processing failed for document ${document.id}:`, error);
          // Update status to failed
          await storage.updateDocument(document.id, { processingStatus: 'failed' });
        }
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

  // Vietnamese Receipt OCR Processing endpoint
  app.post("/api/documents/:id/process-receipt", async (req, res) => {
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

      console.log(`🧾 Processing document as Vietnamese receipt: ${document.originalName}`);
      
      // Use Vietnamese Receipt OCR processor directly
      const receiptResult = await vietnameseReceiptOCRProcessor.processDocument(filePath);
      
      // Process with DeepSeek enhancement if API key available
      let enhancedText = receiptResult.extractedText;
      let deepseekAnalysis = { applied: false, reason: 'No API key available' };
      
      if (process.env.OPENAI_API_KEY) {
        try {
          deepseekAnalysis = await deepSeekService.analyzeDocument(
            receiptResult.extractedText, 
            "Vietnamese receipt analysis and data extraction"
          );
          if ((deepseekAnalysis as any).improvedText) {
            enhancedText = (deepseekAnalysis as any).improvedText;
          }
          deepseekAnalysis.applied = true;
        } catch (error) {
          console.warn('DeepSeek enhancement failed:', error);
          deepseekAnalysis = { applied: false, reason: 'DeepSeek processing failed' };
        }
      }

      // Prepare comprehensive structured data for receipts
      const structuredData = {
        pageCount: receiptResult.pageCount,
        characterCount: enhancedText.length,
        wordCount: enhancedText.split(/\s+/).filter((word: string) => word.length > 0).length,
        language: 'Vietnamese',
        processingMode: 'vietnamese-receipt-ocr',
        processingTime: receiptResult.processingTime,
        deepseekAnalysis,
        documentType: 'Vietnamese Receipt',
        isReceiptDocument: true,
        preprocessingSteps: receiptResult.preprocessingSteps,
        // Receipt-specific data
        receiptData: receiptResult.structuredData || {},
        storeName: receiptResult.structuredData?.storeName,
        receiptTotal: receiptResult.structuredData?.total,
        receiptDate: receiptResult.structuredData?.date,
        receiptPhone: receiptResult.structuredData?.phone,
        itemCount: receiptResult.structuredData?.items?.length || 0,
        receiptItems: receiptResult.structuredData?.items || []
      };

      // Update document with processing results
      const confidence = receiptResult.confidence;
      await storage.updateDocument(documentId, {
        processingStatus: 'completed',
        processingCompletedAt: new Date(),
        confidence,
        extractedText: enhancedText,
        structuredData: JSON.stringify(structuredData),
      });

      // Log successful processing
      await storage.createAuditLog({
        userId,
        action: `Vietnamese receipt processed: ${document.originalName} (${structuredData.itemCount} items, ${Math.round(confidence * 100)}% confidence)`,
        documentId: document.id,
        ipAddress: req?.ip || '127.0.0.1',
        userAgent: req?.get('User-Agent') || 'Receipt Processor',
      });

      const updatedDocument = await storage.getDocument(documentId);
      res.json(updatedDocument);

    } catch (error) {
      console.error('Vietnamese receipt processing error:', error);
      
      // Update document status to failed
      const documentId = parseInt(req.params.id);
      await storage.updateDocument(documentId, {
        processingStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: "Vietnamese receipt processing failed",
        details: error instanceof Error ? error.message : 'Unknown error',
        step: "receipt-ocr"
      });
    }
  });

  // Tesseract Training API Endpoints
  
  // Start training session
  app.post("/api/training/start", async (req, res) => {
    try {
      const { sessionName, documentIds } = req.body;
      
      if (!sessionName || !documentIds || !Array.isArray(documentIds)) {
        return res.status(400).json({
          success: false,
          error: "Missing required fields: sessionName and documentIds"
        });
      }

      // Validate documents before training
      const validation = await trainingPipeline.validateDocumentsForTraining(documentIds);
      
      if (validation.suitable.length < 5) {
        return res.status(400).json({
          success: false,
          error: "Insufficient suitable documents for training",
          validation
        });
      }

      const sessionId = await trainingPipeline.startTrainingSession(sessionName, validation.suitable);
      
      res.json({
        success: true,
        sessionId,
        validation,
        message: `Training session started with ${validation.suitable.length} documents`
      });
      
    } catch (error) {
      console.error('Training start error:', error);
      res.status(500).json({
        success: false,
        error: "Failed to start training session",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get training session status
  app.get("/api/training/sessions/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const session = trainingPipeline.getSessionStatus(sessionId);
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Training session not found"
        });
      }
      
      res.json({
        success: true,
        session
      });
      
    } catch (error) {
      console.error('Get training session error:', error);
      res.status(500).json({
        success: false,
        error: "Failed to get training session status"
      });
    }
  });

  // List all training sessions
  app.get("/api/training/sessions", async (req, res) => {
    try {
      const sessions = trainingPipeline.getAllSessions();
      
      res.json({
        success: true,
        sessions: sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      });
      
    } catch (error) {
      console.error('List training sessions error:', error);
      res.status(500).json({
        success: false,
        error: "Failed to list training sessions"
      });
    }
  });

  // Install trained model
  app.post("/api/training/install/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      await trainingPipeline.installModel(sessionId);
      
      res.json({
        success: true,
        message: "Improved Vietnamese model installed successfully"
      });
      
    } catch (error) {
      console.error('Model installation error:', error);
      res.status(500).json({
        success: false,
        error: "Failed to install model",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Validate documents for training
  app.post("/api/training/validate", async (req, res) => {
    try {
      const { documentIds } = req.body;
      
      if (!documentIds || !Array.isArray(documentIds)) {
        return res.status(400).json({
          success: false,
          error: "documentIds array is required"
        });
      }

      const validation = await trainingPipeline.validateDocumentsForTraining(documentIds);
      
      res.json({
        success: true,
        validation
      });
      
    } catch (error) {
      console.error('Document validation error:', error);
      res.status(500).json({
        success: false,
        error: "Failed to validate documents"
      });
    }
  });

  // Get training workflow guide
  app.get("/api/training/guide", async (req, res) => {
    try {
      const guide = await trainingPipeline.createSimpleTrainingWorkflow();
      
      res.json({
        success: true,
        guide
      });
      
    } catch (error) {
      console.error('Get training guide error:', error);
      res.status(500).json({
        success: false,
        error: "Failed to get training guide"
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

  // Get PDF pages as images
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

      // Check if it's a PDF file
      const ext = path.extname(document.filename).toLowerCase();
      if (ext !== '.pdf') {
        // For non-PDF files, return the raw file as a single "page"
        const rawUrl = `/api/documents/${documentId}/raw?t=${Date.now()}`;
        return res.json({
          success: true,
          images: [rawUrl],
          pageCount: 1,
          message: "Single image file"
        });
      }

      // For PDF files, generate page images using ImageMagick
      const tempDir = `/tmp/pdf_pages_${documentId}_${Date.now()}`;
      await fs.promises.mkdir(tempDir, { recursive: true });
      
      try {
        // Convert PDF pages to images
        const outputPattern = path.join(tempDir, 'page-%d.png');
        // Convert PDF to images using ImageMagick directly
        await convertPDFToImages(filePath, outputPattern);
        
        // Get generated page images
        const pageFiles = await fs.promises.readdir(tempDir);
        const pngFiles = pageFiles.filter(f => f.endsWith('.png')).sort();
        
        if (pngFiles.length === 0) {
          throw new Error('No pages generated');
        }

        // Copy pages to public directory for serving
        const publicPagesDir = path.join(process.cwd(), 'client', 'public', 'pages', documentId.toString());
        await fs.promises.mkdir(publicPagesDir, { recursive: true });
        
        const imageUrls = [];
        for (let i = 0; i < pngFiles.length; i++) {
          const sourcePath = path.join(tempDir, pngFiles[i]);
          const destPath = path.join(publicPagesDir, `page-${i + 1}.png`);
          await fs.promises.copyFile(sourcePath, destPath);
          imageUrls.push(`/pages/${documentId}/page-${i + 1}.png`);
        }
        
        // Clean up temporary directory
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        
        res.json({
          success: true,
          images: imageUrls,
          pageCount: pngFiles.length,
          message: "PDF pages generated successfully"
        });

      } catch (conversionError) {
        console.warn('PDF page generation failed, falling back to direct PDF:', conversionError);
        
        // Clean up on error
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        
        // Fallback to direct PDF display
        const pdfUrl = `/api/documents/${documentId}/raw?t=${Date.now()}`;
        res.json({
          success: false,
          images: [pdfUrl],
          pageCount: 1,
          message: "Falling back to direct PDF display"
        });
      }

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