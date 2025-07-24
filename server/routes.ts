import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage, type UpdateDocumentData } from "./storage";
import { storageService } from './storage-service';
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import * as fsSync from "fs";
import { promisify } from "util";
import { spawn } from "child_process";

import sharp from "sharp";
import { deepSeekService } from "./deepseek-service";
import { vietnameseTextCleaner } from "./vietnamese-text-cleaner";
import { enhancedVietnameseOCR } from "./enhanced-vietnamese-ocr";
import { pdfProcessor } from "./pdf-processor";
import { simpleTesseractProcessor } from "./simple-tesseract-processor";
import { simplePDFOCRProcessor } from "./simple-pdf-ocr";
import { vietnameseReceiptOCRProcessor } from "./vietnamese-receipt-ocr-processor";
import { enhancedTesseractProcessor } from "./enhanced-tesseract-processor";
import { reliableOCRProcessor } from "./reliable-ocr-processor";
import { optimizedOCRProcessor } from "./optimized-ocr-processor";
import { ocrProgressTracker } from "./ocr-progress-tracker";
import { trainingPipeline } from "./training-pipeline";
import helmet from "helmet";
import { insertDocumentSchema, insertAuditLogSchema } from "@shared/schema";
import { z } from "zod";
import { initializeDatabase } from "./init-db";
import FormData from 'form-data';
import axios from 'axios';
import { abbyyOCRProcessor } from './abbyy-ocr-processor.js';
import { directOCRProcessor } from './direct-ocr-processor.js';
import { parallelOCRProcessor } from './parallel-ocr-processor';


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
      reject(new Error('PDF conversion timeout (120s)'));
    }, 120000); // Increased to 120 seconds for large PDFs
  });
}

// Configure multer for file uploads with enhanced error handling
const storage_config = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsPath = '/home/runner/uploads';
    try {
      if (!fsSync.existsSync(uploadsPath)) {
        fsSync.mkdirSync(uploadsPath, { recursive: true });
        console.log(`📁 Created uploads directory: ${uploadsPath}`);
      }
      // Verify directory is writable
      fsSync.accessSync(uploadsPath, fsSync.constants.W_OK);
      console.log(`✅ Upload destination verified: ${uploadsPath}`);
      cb(null, uploadsPath);
    } catch (error) {
      console.error(`❌ Upload destination error:`, error);
      cb(error as Error, uploadsPath);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    console.log(`📝 Generated filename: ${uniqueName}`);
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
const uploadsDir = '/home/runner/uploads';
if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
}

// Helper function to process file with DeepSeek API as primary workflow
async function processFileWithFallback(filePath: string, document: any, documentId: number, userId: number, req?: any, res?: any) {
  console.log(`🚀 Processing document ${document.originalName} with DeepSeek API workflow...`);

  // Start progress tracking
  const { ocrProgressTracker } = await import('./ocr-progress-tracker');
  const progressId = `doc-${documentId}`;
  ocrProgressTracker.startTracking(progressId, 5);

  let ocrResult;

  try {
    // Update progress: Initializing
    ocrProgressTracker.updateProgress(progressId, 'initializing', 1, 'Initializing DeepSeek processing...');

    // Check if it's a PDF file
    const isPDF = document.originalName.toLowerCase().endsWith('.pdf');

    if (isPDF) {
      // Update progress: Converting
      ocrProgressTracker.updateProgress(progressId, 'converting', 2, 'Converting PDF for processing...');

      console.log('🤖 Processing PDF with Reliable OCR...');

      // Update progress: Extracting
      ocrProgressTracker.updateProgress(progressId, 'extracting', 3, 'Extracting text with Tesseract...');

      const reliableOCRResult = await reliableOCRProcessor.processDocument(filePath);

      console.log(`🔧 ReliableOCR completed successfully, now preparing DeepSeek enhancement...`);
      console.log(`📊 ReliableOCR result: ${reliableOCRResult.extractedText.length} chars, confidence: ${reliableOCRResult.confidence}%`);

      // Update progress: Reconstructing
      ocrProgressTracker.updateProgress(progressId, 'reconstructing', 4, 'Enhancing text with DeepSeek AI...');

      // Now enhance the extracted text with DeepSeek API
      let enhancedText = reliableOCRResult.extractedText;
      let deepseekAnalysis: any = { applied: false, reason: 'Text enhancement skipped' };
      let deepseekImprovements: any[] = [];

      console.log(`🎯 About to start DeepSeek enhancement with ${reliableOCRResult.extractedText.length} characters...`);

      try {
        console.log(`🤖 DeepSeek Enhancement Phase Starting...`);
        console.log(`📊 Original OCR text: ${reliableOCRResult.extractedText.length} characters`);
        console.log(`🔧 Calling DeepSeek reconstructVietnameseText...`);

        const reconstruction = await deepSeekService.reconstructVietnameseText(reliableOCRResult.extractedText);
        enhancedText = reconstruction.reconstructedText;
        deepseekImprovements = reconstruction.improvements || [];

        console.log(`✅ Text reconstruction completed: ${enhancedText.length} characters`);
        console.log(`📝 Improvements applied: ${deepseekImprovements.length} improvements`);

        // Also get document analysis
        console.log(`🔍 Calling DeepSeek analyzeDocument...`);
        const analysis = await deepSeekService.analyzeDocument(enhancedText, `Vietnamese PDF document analysis: ${document.originalName}`);
        console.log(`📋 Document analysis completed`);

        deepseekAnalysis = {
          applied: true,
          enhancedLength: enhancedText.length,
          improvements: deepseekImprovements,
          analysis: analysis
        };
        console.log(`✅ Complete DeepSeek enhancement finished: ${enhancedText.length} characters total`);
      } catch (deepseekError) {
        console.error('❌ DeepSeek enhancement error details:', deepseekError);
        console.warn('⚠️ DeepSeek text enhancement failed, using original OCR text');
        deepseekAnalysis.reason = `Enhancement failed: ${deepseekError instanceof Error ? deepseekError.message : 'Unknown error'}`;
      }

      ocrResult = {
        success: true,
        file_id: document.originalName,
        text: enhancedText,
        confidence: Math.round(reliableOCRResult.confidence / 100 * 100), // Use original OCR confidence
        page_count: reliableOCRResult.pageCount || 1,
        processing_time: reliableOCRResult.processingTime / 1000,
        metadata: {
          character_count: enhancedText.length,
          word_count: enhancedText.split(/\s+/).filter(word => word.length > 0).length,
          language: 'vie',
          confidence_threshold: 60.0,
          processing_timestamp: new Date(),
          file_size_bytes: document.fileSize,
          processing_mode: 'reliable-pdf-ocr-enhanced',
          ocr_method: reliableOCRResult.method || 'reliable-ocr',
          deepseek_analysis: deepseekAnalysis,
          deepseek_improvements: deepseekImprovements,
          note: 'Reliable PDF processing with ImageMagick, Tesseract OCR, and DeepSeek enhancement'
        }
      };

    } else {
      // Image processing with Enhanced Tesseract for optimal Vietnamese OCR
      ocrProgressTracker.updateProgress(progressId, 'extracting', 3, 'Processing image with Enhanced Tesseract...');

      console.log('🔧 Processing image with Enhanced Tesseract for Vietnamese text...');

      const enhancedResult = await enhancedTesseractProcessor.processDocument(filePath);

      // Update progress: Enhancing with DeepSeek
      ocrProgressTracker.updateProgress(progressId, 'reconstructing', 4, 'Enhancing text with DeepSeek AI...');

      // Now enhance the extracted text with DeepSeek API
      let enhancedText = enhancedResult.extractedText;
      let deepseekAnalysis: any = { applied: false, reason: 'Text enhancement skipped' };
      let deepseekImprovements: any[] = [];

      try {
        console.log(`🤖 DeepSeek Enhancement Phase Starting for image...`);
        console.log(`📊 Enhanced Tesseract result: ${enhancedResult.extractedText.length} characters, ${Math.round(enhancedResult.confidence * 100)}% confidence`);

        const reconstruction = await deepSeekService.reconstructVietnameseText(enhancedResult.extractedText);
        enhancedText = reconstruction.reconstructedText;
        deepseekImprovements = reconstruction.improvements || [];

        console.log(`✅ Text reconstruction completed: ${enhancedText.length} characters`);

        // Also get document analysis
        const analysis = await deepSeekService.analyzeDocument(enhancedText, `Vietnamese ID card analysis: ${document.originalName}`);

        deepseekAnalysis = {
          applied: true,
          enhancedLength: enhancedText.length,
          improvements: deepseekImprovements,
          analysis: analysis
        };

      } catch (deepseekError) {
        console.error('❌ DeepSeek enhancement error for image:', deepseekError);
        console.warn('⚠️ DeepSeek text enhancement failed, using Enhanced Tesseract result');
        deepseekAnalysis.reason = `Enhancement failed: ${deepseekError instanceof Error ? deepseekError.message : 'Unknown error'}`;
      }

      ocrResult = {
        success: true,
        file_id: document.originalName,
        text: enhancedText,
        confidence: Math.round(enhancedResult.confidence * 100), // Use Enhanced Tesseract confidence
        page_count: 1,
        processing_time: enhancedResult.processingTime / 1000,
        metadata: {
          character_count: enhancedText.length,
          word_count: enhancedText.split(/\s+/).filter(word => word.length > 0).length,
          language: 'vie',
          confidence_threshold: 60.0,
          processing_timestamp: new Date(),
          file_size_bytes: document.fileSize,
          processing_mode: 'enhanced-tesseract-vietnamese',
          ocr_method: enhancedResult.processingMethod || 'enhanced-tesseract',
          deepseek_analysis: deepseekAnalysis,
          deepseek_improvements: deepseekImprovements,
          note: 'Enhanced Tesseract processing optimized for Vietnamese text with DeepSeek enhancement'
        }
      };
    }

    // Update progress: Completing
    ocrProgressTracker.updateProgress(progressId, 'completing', 5, 'Processing completed successfully!');
    console.log('✅ DeepSeek API processing completed successfully');

  } catch (deepseekError) {
    console.warn('⚠️ DeepSeek API processing failed, trying direct OCR fallback...');
    console.error('DeepSeek error:', deepseekError instanceof Error ? deepseekError.message : deepseekError);

    // Update progress: Fallback
    ocrProgressTracker.updateProgress(progressId, 'extracting', 3, 'Reliable OCR failed, using optimized OCR...');

    // Optimized OCR fallback
    try {
      const optimizedResult = await optimizedOCRProcessor.processDocument(filePath);

      ocrResult = {
        success: true,
        file_id: document.originalName,
        text: optimizedResult.extractedText,
        confidence: optimizedResult.confidence,
        page_count: optimizedResult.pageCount,
        processing_time: optimizedResult.processingTime / 1000,
        metadata: {
          character_count: optimizedResult.extractedText.length,
          word_count: optimizedResult.extractedText.split(/\s+/).filter(word => word.length > 0).length,
          language: 'vie',
          confidence_threshold: 60.0,
          processing_timestamp: new Date(),
          file_size_bytes: document.fileSize,
          processing_mode: 'optimized-fallback',
          note: 'Processed with optimized OCR (Reliable OCR unavailable)'
        }
      };

      ocrProgressTracker.updateProgress(progressId, 'completing', 5, 'Optimized OCR completed');
    } catch (optimizedError: any) {
      ocrProgressTracker.completeTracking(progressId, false, { error: optimizedError.message });
      throw new Error('OCR processing failed: ' + (optimizedError.message || 'Unknown error'));
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
    deepseekImprovements: ocrResult.metadata?.deepseek_improvements || [],
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

  // Complete progress tracking
  ocrProgressTracker.completeTracking(progressId, true, {
    totalCharacters: extractedText.length,
    confidence: Math.round(confidence * 100),
    improvements: ocrResult.metadata?.deepseek_improvements?.length || 0
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

  // CORS configuration for deployment
  app.use((req, res, next) => {
    const allowedOrigins = [
      'http://localhost:5000',
      'http://localhost:3000', 
      'https://ocr-app.replit.app',
      'https://replit.app'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin as string)) {
      res.setHeader('Access-Control-Allow-Origin', origin as string);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    
    next();
  });

  // Apply security headers with deployment-friendly settings
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        imgSrc: ["'self'", "data:", "blob:", "http://localhost:5000", "http://localhost:3000", "https://ocr-app.replit.app"],
        connectSrc: ["'self'", "ws:", "wss:", "http://localhost:8001", "https://ocr-app.replit.app"],
        fontSrc: ["'self'", "data:"],
        frameAncestors: ["'self'", "vscode-webview:", "https://vscode-cdn.net", "https://replit.app"],
        frameSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'self'", "data:", "blob:"],
        upgradeInsecureRequests: [],
      },
    },
  }));

  // Cleanup endpoint to handle missing files
  app.post("/api/documents/cleanup-missing", async (req, res) => {
    try {
      const documents = await storage.getAllDocuments();
      const missingFiles = [];
      
      for (const doc of documents) {
        const filePath = path.join('/home/runner/uploads', doc.filename);
        try {
          await fs.access(filePath);
        } catch (error) {
          missingFiles.push({
            id: doc.id,
            filename: doc.filename,
            originalName: doc.originalName,
            status: doc.processingStatus
          });
          
          // Update status to failed if not already completed
          if (doc.processingStatus !== 'completed') {
            await storage.updateDocument(doc.id, {
              processingStatus: 'failed',
              errorMessage: 'File missing from uploads directory'
            });
          }
        }
      }
      
      console.log(`🧹 Cleanup found ${missingFiles.length} missing files`);
      res.json({
        success: true,
        missingFiles,
        message: `Found and updated ${missingFiles.length} missing files`
      });
      
    } catch (error) {
      console.error('Cleanup error:', error);
      res.status(500).json({ message: "Cleanup failed" });
    }
  });

  // Document upload endpoint
  app.post("/api/documents/upload", upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const userId = 1; // Default user ID
      const forceReprocess = req.body.forceReprocess === 'true'; // Allow bypassing duplicate detection

      // Check for duplicate files (unless force reprocess is enabled)
      if (!forceReprocess) {
        // Fix encoding issues for Vietnamese filenames
        const originalNameUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

        const existingDocument = await storage.findDuplicateDocument(
          originalNameUtf8,
          req.file.size,
          req.file.mimetype,
          userId
        );

        if (existingDocument) {
          // Check if the existing file actually exists on disk
          const existingFilePath = path.join('/home/runner/uploads', existingDocument.filename);
          let fileExists = false;
          
          try {
            await fs.access(existingFilePath);
            fileExists = true;
            console.log(`✅ Existing file found: ${existingFilePath}`);
          } catch (fileError) {
            console.warn(`⚠️ Existing file missing: ${existingFilePath}`);
            fileExists = false;
          }

          if (fileExists) {
            // Original file exists, use duplicate detection
            try {
              await fs.unlink(req.file.path);
            } catch (unlinkError) {
              console.warn('Failed to delete duplicate file:', unlinkError);
            }

            await storage.createAuditLog({
              userId,
              action: `Duplicate file detected: ${originalNameUtf8} (${req.file.size} bytes) - using existing document`,
              documentId: existingDocument.id,
              ipAddress: req.ip,
              userAgent: req.get('User-Agent'),
            });

            console.log(`📋 Duplicate file detected: ${originalNameUtf8} - using existing document ${existingDocument.id}`);
            console.log(`📊 Existing document details:`, {
              id: existingDocument.id,
              originalName: existingDocument.originalName,
              uploadedAt: existingDocument.uploadedAt,
              processingStatus: existingDocument.processingStatus,
              processingCompletedAt: existingDocument.processingCompletedAt
            });

            return res.json({
              ...existingDocument,
              isDuplicate: true,
              message: `File "${originalNameUtf8}" already exists on server. Using existing document (ID: ${existingDocument.id}) from ${new Date(existingDocument.uploadedAt).toLocaleString()}.`
            });
          } else {
            // Original file is missing, update the existing record with new file
            const newFilename = req.file.filename;
            await storage.updateDocument(existingDocument.id, { 
              filename: newFilename,
              processingStatus: 'pending'
            });

            await storage.createAuditLog({
              userId,
              action: `Replaced missing file for existing document: ${originalNameUtf8} - new file: ${newFilename}`,
              documentId: existingDocument.id,
              ipAddress: req.ip,
              userAgent: req.get('User-Agent'),
            });

            console.log(`🔄 Replaced missing file for document ${existingDocument.id}: ${originalNameUtf8}`);
            console.log(`📁 New file: ${newFilename}`);

            // Return the updated document
            const updatedDocument = await storage.getDocument(existingDocument.id);
            return res.json({
              ...updatedDocument,
              isReplacement: true,
              message: `File "${originalNameUtf8}" was missing. Updated existing document (ID: ${existingDocument.id}) with new file.`
            });
          }
        }
      }

      if (forceReprocess) {
        const originalNameUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        console.log(`🔄 Force reprocessing enabled for: ${originalNameUtf8}`);
      }

      // Fix encoding for Vietnamese filenames
      const originalNameUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

      // Upload file using hybrid storage service (R2 or local)
      let uploadResult;
      const fileBuffer = await fs.readFile(req.file.path);
      
      try {
        console.log(`📤 Uploading file: ${originalNameUtf8} (${fileBuffer.length} bytes) using ${storageService.getStorageType()} storage`);
        
        uploadResult = await storageService.uploadFile(
          fileBuffer,
          req.file.filename,
          originalNameUtf8,
          req.file.mimetype
        );
        
        console.log(`✅ File uploaded successfully to ${storageService.getStorageType()}: ${uploadResult.key}`);
        
        // Clean up temp file
        try {
          await fs.unlink(req.file.path);
        } catch (unlinkError) {
          console.warn('Failed to delete temp file:', unlinkError);
        }
      } catch (uploadError) {
        console.error(`❌ ${storageService.getStorageType()} upload failed:`, uploadError);
        
        // Clean up temp file on error
        try {
          await fs.unlink(req.file.path);
        } catch {
          // Ignore cleanup errors
        }
        
        return res.status(500).json({ 
          message: `File upload failed using ${storageService.getStorageType()} storage`,
          details: uploadError instanceof Error ? uploadError.message : 'Unknown error'
        });
      }

      const documentData = {
        filename: uploadResult.key, // Use R2 key or local filename
        originalName: originalNameUtf8,
        fileSize: uploadResult.metadata.size,
        mimeType: uploadResult.metadata.contentType,
        userId,
        processingStatus: 'pending' as const,
        storageType: storageService.getStorageType(), // Track storage type
      };

      const document = await storage.createDocument(documentData);

      // Log upload
      await storage.createAuditLog({
        userId,
        action: `Document uploaded: ${originalNameUtf8} (${uploadResult.metadata.size} bytes) via ${storageService.getStorageType()}`,
        documentId: document.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      // Automatically start OCR processing after upload (background)
      console.log(`🚀 Auto-starting OCR processing for document ${document.id}: ${document.originalName}...`);

      // Process in background without blocking the response
      setImmediate(async () => {
        try {
          // Get file for processing (from R2 or local storage)
          let filePath: string;
          let tempFileCleanup: (() => Promise<void>) | null = null;
          
          try {
            if (document.storageType === 'r2') {
              // Download from R2 to temp file for processing
              const tempDir = '/tmp';
              const tempFileName = `ocr-temp-${document.id}-${Date.now()}`;
              filePath = path.join(tempDir, tempFileName);
              
              const { stream } = await storageService.downloadFile(document.filename);
              
              // Write stream to temp file
              const writeStream = fsSync.createWriteStream(filePath);
              await new Promise((resolve, reject) => {
                stream.pipe(writeStream);
                stream.on('end', resolve);
                stream.on('error', reject);
              });
              
              // Set up cleanup function
              tempFileCleanup = async () => {
                try {
                  await fs.unlink(filePath);
                  console.log(`🧹 Cleaned up temp file: ${filePath}`);
                } catch {
                  // Ignore cleanup errors
                }
              };
              
              console.log(`📥 Downloaded R2 file to temp: ${filePath}`);
            } else {
              // Use local file path
              filePath = path.join('/home/runner/uploads', document.filename);
              
              // Check if file actually exists
              await fs.access(filePath);
              console.log(`📂 Local file exists: ${filePath}`);
            }
          } catch (fileError) {
            console.error(`❌ File not found for auto-processing: ${document.filename}`, fileError);
            await storage.updateDocument(document.id, { processingStatus: 'failed', errorMessage: 'File not found' });
            return;
          }

          // Update status to processing
          await storage.updateDocument(document.id, { processingStatus: 'processing' });

          // Process the document (create mock req object for auto-processing)
          const mockReq = { 
            ip: '127.0.0.1', 
            get: () => 'Auto-processing',
            params: { id: document.id.toString() }
          };
          const mockRes = {
            json: (data: any) => {
              console.log(`✅ Auto-processing result for document ${document.id}:`, data.success ? 'Success' : 'Failed');
            },
            status: (code: number) => ({ json: (data: any) => console.log(`❌ Auto-processing error ${code}:`, data) })
          };
          await processFileWithFallback(filePath, document, document.id, userId, mockReq as any, mockRes as any);

          console.log(`✅ Auto-processing completed for document ${document.id}: ${document.originalName}`);
          
        } catch (error) {
          console.error(`❌ Auto-processing failed for document ${document.id}:`, error);
          
          // Update status to failed with error details
          await storage.updateDocument(document.id, { 
            processingStatus: 'failed', 
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          });
        } finally {
          // Clean up temp file if it was created
          if (tempFileCleanup) {
            await tempFileCleanup();
          }
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

      // Handle R2 vs local storage
      let filePath: string;
      let tempFileCleanup: (() => Promise<void>) | null = null;

      try {
        if (document.storageType === 'r2') {
          // Download from R2 to temp file for processing
          const tempDir = '/tmp';
          const tempFileName = `ocr-temp-${document.id}-${Date.now()}`;
          filePath = path.join(tempDir, tempFileName);
          
          console.log(`📥 Downloading file from R2: ${document.filename}`);
          const { stream } = await storageService.downloadFile(document.filename);
          
          // Write stream to temp file
          const writeStream = fsSync.createWriteStream(filePath);
          await new Promise((resolve, reject) => {
            stream.pipe(writeStream);
            stream.on('end', resolve);
            stream.on('error', reject);
          });
          
          // Set up cleanup function
          tempFileCleanup = async () => {
            try {
              await fs.unlink(filePath);
              console.log(`🧹 Cleaned up temp file: ${filePath}`);
            } catch {
              // Ignore cleanup errors
            }
          };
          
          console.log(`📥 File downloaded from R2 to temp: ${filePath}`);
        } else {
          // Use local file path
          filePath = path.join(uploadsDir, document.filename);
          
          // Check if file exists before processing
          try {
            await fs.access(filePath);
          } catch (fileError) {
            console.error(`❌ File not found for document ${documentId}: ${filePath}`);

            // Try to find an alternative file with same original name
            const uploads = await fs.readdir(uploadsDir);
            const alternativeFile = uploads.find(filename => 
              filename.includes(document.originalName) || 
              document.originalName.includes(filename.replace(/^\d+-/, ''))
            );

            if (alternativeFile) {
              filePath = path.join(uploadsDir, alternativeFile);
              console.log(`🔄 Using alternative local file: ${alternativeFile}`);
            } else {
              return res.status(400).json({ 
                success: false, 
                error: "File not found for processing. Please re-upload the document." 
              });
            }
          }
        }
      } catch (error) {
        console.error(`❌ Failed to prepare file for processing:`, error);
        return res.status(400).json({ 
          success: false, 
          error: "Failed to access file for processing" 
        });
      }

      try {
        // Process the file with DeepSeek API workflow
        await processFileWithFallback(filePath, document, documentId, userId, req, res);
      } finally {
        // Clean up temp file if it was created
        if (tempFileCleanup) {
          await tempFileCleanup();
        }
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

      // Use enhanced Tesseract processor for stable processing
      const receiptResult = await enhancedTesseractProcessor.processDocument(filePath);

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
        processedAt: new Date(), // Ensure processedAt is set to current time
        confidence,
        extractedText: enhancedText,
        structuredData: JSON.stringify(structuredData),
      });

      // Log successful processing
      await storage.createAuditLog({
        userId,
        action: `Vietnamese receipt processing completed: ${document.originalName} (${confidence}% confidence)`,
        documentId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        success: true,
        document: await storage.getDocument(documentId),
        receiptData: structuredData.receiptData
      });

    } catch (error) {
      console.error('Receipt processing error:', error);

      // Update document status to failed
      const documentId = parseInt(req.params.id);
      await storage.updateDocument(documentId, {
        processingStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: "Receipt processing failed",
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Parallel OCR Processing endpoint (ABBYY + Tesseract)
  app.post("/api/documents/:id/process-parallel", async (req, res) => {
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

      // Check if file exists before processing
      try {
        await fs.access(filePath);
      } catch (fileError) {
        console.error(`❌ File not found for document ${documentId}: ${filePath}`);

        // Try to find an alternative file with same original name
        const uploads = await fs.readdir(uploadsDir);
        const alternativeFile = uploads.find(filename => 
          filename.includes(document.originalName) || 
          document.originalName.includes(filename.replace(/^\d+-/, ''))
        );

        if (alternativeFile) {
          const alternativeFilePath = path.join(uploadsDir, alternativeFile);
          console.log(`🔄 Using alternative file: ${alternativeFile}`);

          // Use the alternative file path (no need to update document as filename is not in schema)
          const filePath = alternativeFilePath;
        } else {
          return res.status(400).json({ 
            success: false, 
            error: "File not found for processing. Please re-upload the document." 
          });
        }
      }

      console.log(`🔄 Processing document with parallel OCR: ${document.originalName}`);

      // Process with parallel OCR (ABBYY + Tesseract) 
      console.log(`🔄 Processing with parallel OCR engines...`);
      const result = await parallelOCRProcessor.processDocument(filePath);

      // Process with DeepSeek enhancement if available
      let enhancedText = result.combinedText;
      let deepseekAnalysis = { applied: false, reason: 'No API key available' };

      if (result.combinedText && result.combinedText.length > 0) {
        try {
          const enhancement = await deepSeekService.analyzeDocument(result.combinedText, "Text enhancement analysis");
          if (enhancement.success) {
            enhancedText = enhancement.enhancedText || result.combinedText;
            deepseekAnalysis = enhancement.analysis || deepseekAnalysis;
          }
        } catch (deepseekError) {
          console.warn('DeepSeek enhancement failed:', deepseekError);
        }
      }

      // Create structured data
      const structuredData = {
        pageCount: 1,
        characterCount: enhancedText.length,
        wordCount: enhancedText.split(/\s+/).filter(w => w.length > 0).length,
        language: 'vie',
        processingMode: 'parallel-abbyy-tesseract',
        processingTime: result.processingTime / 1000,
        deepseekAnalysis,
        documentType: 'Government Document',
        isReceiptDocument: false,
        parallelResults: {
          platforms: result.metadata.platforms,
          bestPlatform: result.bestResult.platform,
          agreement: result.metadata.agreement,
          allResults: result.allResults.map(r => ({
            platform: r.platform,
            confidence: r.confidence,
            success: r.success,
            characterCount: r.extractedText.length,
            processingTime: r.processingTime
          }))
        }
      };

      // Update document with results
      await storage.updateDocument(documentId, {
        processingStatus: 'completed',
        processingCompletedAt: new Date(),
        extractedText: enhancedText,
        confidence: result.confidence,
        structuredData: JSON.stringify(structuredData),
      });

      // Log processing completion
      await storage.createAuditLog({
        userId,
        action: `Parallel OCR processing completed: ${document.originalName} (${result.metadata.platforms.join(', ')})`,
        documentId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.json({
        success: true,
        document: await storage.getDocument(documentId),
        parallelResults: {
          bestPlatform: result.bestResult.platform,
          platforms: result.metadata.platforms,
          agreement: result.metadata.agreement,
          processingTime: result.processingTime
        }
      });

    } catch (error) {
      console.error('Parallel OCR processing error:', error);

      // Update document status to failed
      const documentId = parseInt(req.params.id);
      await storage.updateDocument(documentId, {
        processingStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: "Parallel OCR processing failed",
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Debug PDF content endpoint
  app.get("/api/documents/:id/debug", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const filePath = path.join(uploadsDir, document.filename);

      if (!fsSync.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found" });
      }

      // Try to extract basic PDF information
      try {
        const dataBuffer = await fs.readFile(filePath);
        // Import pdf-parse dynamically  
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(dataBuffer);

        const debugInfo = {
          filename: document.originalName,
          fileSize: document.fileSize,
          mimeType: document.mimeType,
          pdfInfo: {
            numPages: pdfData.numpages,
            textLength: pdfData.text.length,
            hasText: pdfData.text.length > 50,
            firstChars: pdfData.text.substring(0, 500),
            metadata: pdfData.metadata || {}
          },
          processingStatus: document.processingStatus,
          lastError: document.errorMessage
        };

        res.json({
          success: true,
          debugInfo
        });

      } catch (pdfError) {
        res.json({
          success: false,
          error: `PDF parsing failed: ${pdfError instanceof Error ? pdfError.message : 'Unknown error'}`,
          fileInfo: {
            filename: document.originalName,
            fileSize: document.fileSize,
            mimeType: document.mimeType,
            processingStatus: document.processingStatus,
            lastError: document.errorMessage
          }
        });
      }
    } catch (error) {
      console.error('Debug endpoint error:', error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to debug document" 
      });
    }
  });

  // ABBYY-specific OCR processing endpoint
  app.post("/api/documents/:id/process-abbyy", async (req, res) => {
    try {
      const documentId = parseInt(req.params.id);
      const document = await storage.getDocument(documentId);

      if (!document) {
        return res.status(404).json({ success: false, error: "Document not found" });
      }

      // Update status to processing
      await storage.updateDocument(documentId, {
        processingStatus: 'processing',
        processingStartedAt: new Date(),
      });

      const filePath = path.join(uploadsDir, document.filename);

      // Check if file exists before processing
      try {
        await fs.access(filePath);
      } catch (fileError) {
        console.error(`❌ File not found for document ${documentId}: ${filePath}`);
        return res.status(400).json({ 
          success: false, 
          error: "File not found for processing. Please re-upload the document." 
        });
      }

      console.log(`🔄 Processing document with ABBYY OCR: ${document.originalName}`);

      // Check ABBYY availability first
      const abbyyHealth = await abbyyOCRProcessor.healthCheck();
      if (abbyyHealth.status !== 'healthy') {
        return res.status(503).json({
          success: false,
          error: "ABBYY FineReader Engine not available",
          details: abbyyHealth.details,
          suggestion: "Use Tesseract processing instead or install ABBYY FineReader Engine"
        });
      }

      // Process with ABBYY only
      const result = await abbyyOCRProcessor.processDocument(filePath);

      // Create structured data
      const structuredData = {
        pageCount: result.pageCount || 1,
        characterCount: result.extractedText.length,
        wordCount: result.extractedText.split(/\s+/).filter((word: string) => word.length > 0).length,
        language: 'vie',
        processingMode: 'abbyy-only',
        processingTime: result.processingTime,
        documentType: 'Government Document',
        isReceiptDocument: false,
      };

      // Update document with results
      await storage.updateDocument(documentId, {
        extractedText: result.extractedText,
        confidence: result.confidence,
        processingStatus: 'completed',
        processingCompletedAt: new Date(),
        structuredData: JSON.stringify(structuredData),
        errorMessage: undefined
      });

      const updatedDocument = await storage.getDocument(documentId);
      res.json({
        success: true,
        document: updatedDocument,
        processingEngine: 'abbyy',
        processingTime: result.processingTime,
        ocrResult: {
          extractedText: result.extractedText,
          confidence: result.confidence,
          pageCount: result.pageCount
        }
      });

    } catch (error) {
      console.error('ABBYY processing error:', error);

      // Update document status to failed
      const documentId = parseInt(req.params.id);
      await storage.updateDocument(documentId, {
        processingStatus: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: "ABBYY processing failed",
        details: error instanceof Error ? error.message : 'Unknown error',
        step: "abbyy-ocr"
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

  // ABBYY OCR health check endpoint
  app.get("/api/ocr/abbyy/health", async (req, res) => {
    try {
      const healthResult = await abbyyOCRProcessor.healthCheck();

      res.json({
        success: true,
        ...healthResult
      });

    } catch (error) {
      console.error('ABBYY health check error:', error);
      res.status(500).json({
        success: false,
        error: "ABBYY health check failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Text reconstruction endpoint for testing
  app.post("/api/ocr/reconstruct-text", async (req, res) => {
    try {
      const { rawText } = req.body;

      if (!rawText || typeof rawText !== 'string') {
        return res.status(400).json({
          success: false,
          error: "rawText is required and must be a string"
        });
      }

      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({
          success: false,
          error: "DeepSeek API key not configured"
        });
      }

      const reconstruction = await deepSeekService.reconstructVietnameseText(rawText);

      res.json({
        success: true,
        original_text: rawText,
        ...reconstruction
      });

    } catch (error) {
      console.error('Text reconstruction error:', error);
      res.status(500).json({
        success: false,
        error: "Text reconstruction failed",
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // OCR engines status endpoint
  app.get("/api/ocr/status", async (req, res) => {
    try {
      const abbyyHealth = await abbyyOCRProcessor.healthCheck();

      const status = {
        engines: {
          abbyy: {
            available: abbyyHealth.status === 'healthy',
            status: abbyyHealth.status,
            details: abbyyHealth.details
          },
          tesseract: {
            available: true, // Tesseract is always available in this environment
            status: 'healthy',
            details: {
              optimized_for_vietnamese: true,
              id_card_support: true,
              psm_configurations: [3, 6, 8, 13]
            }
          },
          deepseek_text_reconstruction: {
            available: !!process.env.OPENAI_API_KEY,
            status: process.env.OPENAI_API_KEY ? 'healthy' : 'unavailable',
            details: {
              purpose: 'Vietnamese administrative text reconstruction',
              improvements: ['Fix OCR errors', 'Standardize legal terminology', 'Correct formatting']
            }
          }
        },
        recommendations: {
          id_cards: abbyyHealth.status === 'healthy' ? 'ABBYY (preferred) or Tesseract PSM 6' : 'Tesseract PSM 6',
          receipts: 'Vietnamese Receipt Processor',
          documents: abbyyHealth.status === 'healthy' ? 'ABBYY (preferred) or Tesseract' : 'Tesseract',
          parallel_processing: abbyyHealth.status === 'healthy',
          text_reconstruction: !!process.env.OPENAI_API_KEY
        }
      };

      res.json({
        success: true,
        ...status
      });

    } catch (error) {
      console.error('OCR status check error:', error);
      res.status(500).json({
        success: false,
        error: "OCR status check failed",
        details: error instanceof Error ? error.message : 'Unknown error'
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

      // Enhanced file existence check with alternative file search
      if (!fsSync.existsSync(filePath)) {
        console.warn(`📁 File not found: ${filePath}, searching for alternatives...`);
        
        // Try to find an alternative file with same original name
        try {
          const uploads = await fs.readdir(uploadsDir);
          const alternativeFile = uploads.find(filename => 
            filename.includes(document.originalName.replace(/[^\w\s.-]/g, '')) || 
            document.originalName.includes(filename.replace(/^\d+-/, '').replace(/[^\w\s.-]/g, ''))
          );

          if (alternativeFile) {
            const alternativePath = path.join(uploadsDir, alternativeFile);
            console.log(`✅ Found alternative file: ${alternativeFile}`);
            
            // Update document record with correct filename
            await storage.updateDocument(documentId, { filename: alternativeFile });
            
            res.setHeader('Content-Type', document.mimeType);
            res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);
            res.setHeader('Cache-Control', 'no-cache');
            
            const fileStream = fsSync.createReadStream(alternativePath);
            fileStream.pipe(res);
            return;
          }
        } catch (searchError) {
          console.error('Alternative file search failed:', searchError);
        }
        
        return res.status(404).json({ 
          message: "File not found",
          details: `Missing file: ${document.filename}`,
          suggestion: "Please re-upload this document"
        });
      }
      
      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      const fileStream = fsSync.createReadStream(filePath);
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

      // Handle both R2 and local file serving
      if (document.storageType === 'r2') {
        try {
          const { stream, metadata } = await storageService.downloadFile(document.filename);
          
          res.setHeader('Content-Type', metadata.contentType);
          res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.setHeader('Content-Length', metadata.size.toString());
          
          stream.pipe(res);
          return;
        } catch (error) {
          console.error('R2 file serving error:', error);
          return res.status(404).json({ 
            message: "File not found in R2 storage",
            details: `R2 key: ${document.filename}`,
            suggestion: "File may have been moved or deleted"
          });
        }
      } else {
        // Local file serving
        const filePath = path.join('/home/runner/uploads', document.filename);

        if (!fsSync.existsSync(filePath)) {
          return res.status(404).json({ 
            message: "File not found in local storage",
            details: `Local path: ${filePath}`,
            suggestion: "Please re-upload this document"
          });
        }
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
      await fs.mkdir(tempDir, { recursive: true });

      try {
        // Convert PDF pages to images
        const outputPattern = path.join(tempDir, 'page-%d.png');
        // For R2 files, need to download to temp first
        let pdfPath: string;
        let tempPdfCleanup: (() => Promise<void>) | null = null;
        
        if (document.storageType === 'r2') {
          // Download R2 file to temp for PDF processing
          pdfPath = path.join(tempDir, 'temp.pdf');
          const { stream } = await storageService.downloadFile(document.filename);
          
          const writeStream = fsSync.createWriteStream(pdfPath);
          await new Promise((resolve, reject) => {
            stream.pipe(writeStream);
            stream.on('end', resolve);
            stream.on('error', reject);
          });
          
          tempPdfCleanup = async () => {
            try {
              await fs.unlink(pdfPath);
            } catch {}
          };
        } else {
          // Use local file path directly
          pdfPath = filePath;
        }
        
        // Convert PDF to images using ImageMagick directly
        await convertPDFToImages(pdfPath, outputPattern);

        // Get generated page images
        const pageFiles = await fs.readdir(tempDir);
        const pngFiles = pageFiles.filter(f => f.endsWith('.png')).sort();

        if (pngFiles.length === 0) {
          throw new Error('No pages generated');
        }

        // Copy pages to public directory for serving
        const publicPagesDir = path.join(process.cwd(), 'client', 'public', 'pages', documentId.toString());
        await fs.mkdir(publicPagesDir, { recursive: true });

        const imageUrls = [];
        for (let i = 0; i < pngFiles.length; i++) {
          const sourcePath = path.join(tempDir, pngFiles[i]);
          const destPath = path.join(publicPagesDir, `page-${i + 1}.png`);
          await fs.copyFile(sourcePath, destPath);
          imageUrls.push(`/pages/${documentId}/page-${i + 1}.png`);
        }

        // Clean up temporary directory
        await fs.rm(tempDir, { recursive: true, force: true });

        res.json({
          success: true,
          images: imageUrls,
          pageCount: pngFiles.length,
          message: "PDF pages generated successfully"
        });

      } catch (conversionError) {
        console.warn('PDF page generation failed, falling back to direct PDF:', conversionError);

        // Clean up on error
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});

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

  // Enhanced Vietnamese OCR endpoint
  app.post('/api/ocr/enhanced-vietnamese', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file provided'
        });
      }

      console.log(`🇻🇳 Enhanced Vietnamese OCR: ${req.file.originalname}`);

      const result = await enhancedVietnameseOCR.processDocument(req.file.path);

      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});

      res.json({
        success: true,
        ...result
      });

    } catch (error: any) {
      console.error('Enhanced Vietnamese OCR error:', error);

      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Progress tracking endpoints
  app.get('/api/documents/:id/progress', async (req, res) => {
    try {
      const documentId = req.params.id;
      const progress = ocrProgressTracker.getProgress(documentId);

      if (!progress) {
        return res.json({ 
          documentId, 
          progress: 0, 
          stage: 'not_started',
          currentStep: 'Processing not started',
          message: 'No active processing found' 
        });
      }

      res.json(progress);
    } catch (error: any) {
      console.error('Progress tracking error:', error);
      res.status(500).json({ error: 'Failed to get progress' });
    }
  });

  // Server-Sent Events for real-time progress
  app.get('/api/documents/:id/progress-stream', (req, res) => {
    const documentId = req.params.id;

    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial progress
    const initialProgress = ocrProgressTracker.getProgress(documentId);
    if (initialProgress) {
      res.write(`data: ${JSON.stringify(initialProgress)}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({
        documentId,
        progress: 0,
        stage: 'not_started',
        currentStep: 'Waiting for processing to start...',
        totalSteps: 6,
        currentStepIndex: 0
      })}\n\n`);
    }

    // Listen for progress updates
    const progressHandler = (progress: any) => {
      if (progress.documentId === documentId) {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);

        // Close connection when completed
        if (progress.stage === 'completing' && progress.progress >= 100) {
          setTimeout(() => {
            res.end();
          }, 2000); // Keep connection open for 2 more seconds
        }
      }
    };

    ocrProgressTracker.on('progress', progressHandler);

    // Handle client disconnect
    req.on('close', () => {
      ocrProgressTracker.removeListener('progress', progressHandler);
      res.end();
    });

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      res.write(`: keep-alive\n\n`);
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });
  });

  // Health check endpoint for deployment
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime()
    });
  });

  // Serve static files from uploads directory  
  app.use('/uploads', express.static(uploadsDir));
  
  // Serve generated PDF page images
  app.use('/pages', express.static(path.join(process.cwd(), 'client', 'public', 'pages')));

  const httpServer = createServer(app);
  return httpServer;
}