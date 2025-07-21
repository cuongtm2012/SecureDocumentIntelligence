import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type UpdateDocumentData } from "./storage";
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
      reject(new Error('PDF conversion timeout'));
    }, 30000);
  });
}

// Configure multer for file uploads
const storage_config = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsPath = path.join(process.cwd(), 'uploads');
    if (!fsSync.existsSync(uploadsPath)) {
      fsSync.mkdirSync(uploadsPath, { recursive: true });
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
if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
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
      // Smart OCR processor selection based on document type and availability
      let ocrResult;
      const isIdCard = document.originalName.toLowerCase().includes('cmt') || 
                      document.originalName.toLowerCase().includes('id') ||
                      document.originalName.toLowerCase().includes('card');
      
      try {
        // Check if ABBYY is available first
        const abbyyHealth = await abbyyOCRProcessor.healthCheck();
        const abbyyAvailable = abbyyHealth.status === 'healthy';
        
        if (abbyyAvailable) {
          console.log('📄 Using ABBYY FineReader for superior OCR quality...');
          ocrResult = await abbyyOCRProcessor.processDocument(filePath);
          
          // Validate OCR result quality
          if (!ocrResult.extractedText || ocrResult.extractedText.length < 10) {
            console.warn('⚠️ ABBYY OCR yielded minimal text, trying optimized Tesseract...');
            throw new Error('ABBYY result insufficient, trying fallback');
          }
        } else {
          console.warn('⚠️ ABBYY FineReader not available, using optimized Tesseract directly...');
          throw new Error('ABBYY not available, using fallback');
        }
        
      } catch (primaryError) {
        console.log('🔄 Using reliable Tesseract OCR processor for better accuracy...');
        
        try {
          if (isIdCard) {
            console.log('🆔 Detected ID card document - using optimized Tesseract configuration...');
            ocrResult = await simpleTesseractProcessor.processDocument(filePath);
            console.log('✅ Tesseract ID card processor succeeded');
          } else if (isReceiptDocument) {
            console.log('🧾 Using Vietnamese receipt OCR processor...');
            ocrResult = await vietnameseReceiptOCRProcessor.processDocument(filePath);
            console.log('✅ Vietnamese receipt processor succeeded');
          } else {
            // Use reliable processor first for better accuracy while investigating optimized issues
            try {
              console.log('🔧 Using reliable OCR processor with proven accuracy...');
              const reliableResult = await reliableOCRProcessor.processDocument(filePath);
              ocrResult = {
                extractedText: reliableResult.extractedText,
                confidence: reliableResult.confidence,
                pageCount: reliableResult.pageCount,
                processingTime: reliableResult.processingTime,
                processingMethod: reliableResult.method
              };
              console.log('✅ Reliable OCR processor succeeded');
            } catch (reliableError) {
              console.warn('⚠️ Reliable processor failed, trying optimized fallback...');
              try {
                console.log('⚡ Falling back to optimized OCR processor with progress tracking...');
                const optimizedResult = await optimizedOCRProcessor.processDocument(filePath, document.id.toString());
                ocrResult = {
                  extractedText: optimizedResult.extractedText,
                  confidence: optimizedResult.confidence,
                  pageCount: optimizedResult.pageCount,
                  processingTime: optimizedResult.processingTime,
                  processingMethod: optimizedResult.method,
                  performanceMetrics: optimizedResult.performanceMetrics
                };
                console.log(`⚡ Optimized OCR completed: ${optimizedResult.performanceMetrics.pagesPerSecond} pages/sec`);
              } catch (optimizedError) {
                console.warn('⚠️ Both processors failed, using standard fallback...');
                console.log('📄 Using standard Tesseract processor...');
                ocrResult = await simpleTesseractProcessor.processDocument(filePath);
                console.log('✅ Standard Tesseract processor succeeded');
              }
            }
          }
        } catch (tesseractError) {
          console.error('❌ Tesseract OCR also failed');
          const primaryMsg = primaryError instanceof Error ? primaryError.message : String(primaryError);
          const tesseractMsg = tesseractError instanceof Error ? tesseractError.message : String(tesseractError);
          throw new Error(`OCR processing failed. Primary: ${primaryMsg}, Tesseract: ${tesseractMsg}`);
        }
      }

      // Then enhance with DeepSeek Vietnamese text reconstruction
      const textReconstruction = await deepSeekService.reconstructVietnameseText(ocrResult.extractedText);
      
      // Also perform document analysis
      const deepseekAnalysis = await deepSeekService.analyzeDocument(
        textReconstruction.reconstructedText, 
        "Vietnamese government document analysis"
      );

      finalOcrResult = {
        success: true,
        file_id: document.originalName,
        text: textReconstruction.reconstructedText, // Use reconstructed text instead of raw OCR
        confidence: Math.max(ocrResult.confidence, textReconstruction.confidence),
        page_count: ocrResult.pageCount,
        processing_time: ocrResult.processingTime / 1000,
        metadata: {
          character_count: textReconstruction.reconstructedText.length,
          word_count: textReconstruction.reconstructedText.split(/\s+/).filter((word: string) => word.length > 0).length,
          language: 'vie',
          confidence_threshold: 60.0,
          processing_timestamp: new Date(),
          file_size_bytes: document.fileSize,
          processing_mode: 'ocr-deepseek-reconstruction',
          original_ocr_text: ocrResult.extractedText, // Keep original OCR text for comparison
          text_reconstruction: {
            applied: true,
            improvements: textReconstruction.improvements,
            confidence: textReconstruction.confidence
          },
          deepseek_analysis: deepseekAnalysis,
          note: 'Processed with OCR + DeepSeek Vietnamese text reconstruction for superior accuracy'
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

        // Try to apply Vietnamese text reconstruction even in fallback mode
        let reconstructedText = directResult.extractedText;
        let textReconstructionMeta = { applied: false, reason: 'DeepSeek API unavailable' };

        try {
          if (process.env.OPENAI_API_KEY && directResult.extractedText.length > 10) {
            const textReconstruction = await deepSeekService.reconstructVietnameseText(directResult.extractedText);
            reconstructedText = textReconstruction.reconstructedText;
            textReconstructionMeta = {
              applied: true,
              reason: 'Text reconstruction applied successfully'
            };
          }
        } catch (reconstructionError) {
          console.warn('Text reconstruction failed in fallback mode:', reconstructionError);
        }

        finalOcrResult = {
          success: true,
          file_id: document.originalName,
          text: reconstructedText,
          confidence: directResult.confidence,
          page_count: directResult.pageCount,
          processing_time: directResult.processingTime / 1000,
          metadata: {
            character_count: reconstructedText.length,
            word_count: reconstructedText.split(/\s+/).filter((word: string) => word.length > 0).length,
            language: 'vie',
            confidence_threshold: 60.0,
            processing_timestamp: new Date(),
            file_size_bytes: document.fileSize,
            processing_mode: 'direct-fallback-with-reconstruction',
            original_ocr_text: directResult.extractedText,
            text_reconstruction: textReconstructionMeta,
            note: 'Processed with direct OCR fallback + text reconstruction attempt'
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
    processedAt: new Date(), // Ensure processedAt is set to current time
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
          // Delete the uploaded file since we found a duplicate
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
        }
      }

      if (forceReprocess) {
        const originalNameUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        console.log(`🔄 Force reprocessing enabled for: ${originalNameUtf8}`);
      }

      // Fix encoding for Vietnamese filenames
      const originalNameUtf8 = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
      
      const documentData = {
        filename: req.file.filename,
        originalName: originalNameUtf8,
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
      console.log(`🚀 Auto-starting OCR processing for document ${document.id}: ${document.originalName}...`);

      // Process in background without blocking the response
      setImmediate(async () => {
        try {
          const filePath = path.join(process.cwd(), 'uploads', document.filename);
          
          // Check if file actually exists
          try {
            await fs.access(filePath);
            console.log(`📂 File exists: ${filePath}`);
          } catch (fileError) {
            console.error(`❌ File not found for auto-processing: ${filePath}`);
            await storage.updateDocument(document.id, { processingStatus: 'failed', errorMessage: 'File not found' });
            return;
          }

          // Update status to processing
          await storage.updateDocument(document.id, { processingStatus: 'processing' });

          // Process the document
          await processFileWithFallback(filePath, document, document.id, userId, undefined, undefined);

          console.log(`✅ Auto-processing completed for document ${document.id}: ${document.originalName}`);
        } catch (error) {
          console.error(`❌ Auto-processing failed for document ${document.id}:`, error);
          // Update status to failed with error details
          await storage.updateDocument(document.id, { 
            processingStatus: 'failed', 
            errorMessage: error instanceof Error ? error.message : 'Unknown error'
          });
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
          
          // Use the alternative file (no need to update document as filename is not in schema)
          
          // Process the alternative file
          await processFileWithFallback(alternativeFilePath, document, documentId, userId, req, res);
          return;
        } else {
          return res.status(400).json({ 
            success: false, 
            error: "File not found for processing. Please re-upload the document." 
          });
        }
      }

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

      if (!fsSync.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found" });
      }

      res.setHeader('Content-Type', document.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${document.originalName}"`);

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

      const filePath = path.join(process.cwd(), 'uploads', document.filename);

      if (!fsSync.existsSync(filePath)) {
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
      await fs.mkdir(tempDir, { recursive: true });

      try {
        // Convert PDF pages to images
        const outputPattern = path.join(tempDir, 'page-%d.png');
        // Convert PDF to images using ImageMagick directly
        await convertPDFToImages(filePath, outputPattern);

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

  const httpServer = createServer(app);
  return httpServer;
}