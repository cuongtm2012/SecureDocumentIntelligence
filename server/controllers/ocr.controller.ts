import { Request, Response } from 'express';
import { pythonOCRService, OCRRequest } from '../services/python-ocr.service.js';
import { storage } from '../storage';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are supported'));
    }
  }
});

// Store active OCR jobs for progress tracking
const activeJobs = new Map();

export class OCRController {
  /**
   * Health check endpoint for Python OCR services
   */
  static async healthCheck(req: Request, res: Response) {
    try {
      const healthResult = await pythonOCRService.healthCheck();
      
      res.status(healthResult.status === 'healthy' ? 200 : 503).json({
        timestamp: new Date().toISOString(),
        ...healthResult
      });
    } catch (error) {
      console.error('OCR health check failed:', error);
      res.status(500).json({
        status: 'error',
        service: 'OCR Controller',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  }

  /**
   * Process single PDF file with enhanced Python OCR service
   */
  static async processSingleFile(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No PDF file provided'
        });
      }

      const { language = 'vie', confidenceThreshold = 60.0 } = req.body;
      const fileId = `ocr_${Date.now()}_${req.file.filename}`;
      const userId = (req as any).user?.id || 1;

      // Create OCR request
      const ocrRequest: OCRRequest = {
        fileId,
        filePath: req.file.path,
        language,
        confidenceThreshold: parseFloat(confidenceThreshold)
      };

      console.log(`Starting enhanced OCR processing for ${fileId}`);

      // Process the file with Python service
      const result = await pythonOCRService.processFile(ocrRequest);

      if (result.success) {
        // Save to database
        const document = await storage.createDocument({
          userId,
          originalName: req.file.originalname,
          fileName: req.file.filename,
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          filePath: req.file.path,
          extractedText: result.text,
          metadata: {
            ocrResult: result,
            processingTime: result.processingTime,
            confidence: result.confidence,
            pageCount: result.pageCount
          }
        });

        res.json({
          success: true,
          document: {
            id: document.id,
            originalName: document.originalName,
            extractedText: result.text,
            confidence: result.confidence,
            pageCount: result.pageCount,
            processingTime: result.processingTime,
            metadata: result.metadata
          },
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: result.error,
          fileId: result.fileId,
          timestamp: new Date().toISOString()
        });
      }

      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});

    } catch (error) {
      console.error('Enhanced OCR processing error:', error);
      
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      res.status(500).json({
        success: false,
        error: 'OCR processing failed',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Process multiple PDF files in batch with Python service
   */
  static async processBatchFiles(req: Request, res: Response) {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No PDF files provided'
        });
      }

      const { language = 'vie', confidenceThreshold = 60.0 } = req.body;
      const userId = (req as any).user?.id || 1;
      
      // Create OCR requests for all files
      const ocrRequests: OCRRequest[] = files.map((file, index) => ({
        fileId: `batch_${Date.now()}_file_${index + 1}_${file.filename}`,
        filePath: file.path,
        language,
        confidenceThreshold: parseFloat(confidenceThreshold)
      }));

      console.log(`Starting batch OCR processing for ${files.length} files`);

      // Start batch processing with Python service
      const batchResult = await pythonOCRService.processBatch(ocrRequests);

      // Store job for progress tracking
      activeJobs.set(batchResult.jobId, {
        ...batchResult,
        userId,
        files: files.map(f => ({ name: f.originalname, size: f.size }))
      });

      // Save successful results to database
      for (const result of batchResult.results) {
        if (result.success) {
          const fileIndex = ocrRequests.findIndex(req => req.fileId === result.fileId);
          if (fileIndex >= 0) {
            const file = files[fileIndex];
            await storage.createDocument({
              userId,
              originalName: file.originalname,
              fileName: file.filename,
              mimeType: file.mimetype,
              fileSize: file.size,
              filePath: file.path,
              extractedText: result.text,
              metadata: {
                batchJobId: batchResult.jobId,
                ocrResult: result,
                processingTime: result.processingTime,
                confidence: result.confidence,
                pageCount: result.pageCount
              }
            });
          }
        }
      }

      // Schedule cleanup of uploaded files
      setTimeout(async () => {
        for (const file of files) {
          await fs.unlink(file.path).catch(() => {});
        }
        console.log(`Cleaned up ${files.length} uploaded files for job ${batchResult.jobId}`);
      }, 60000);

      res.json({
        timestamp: new Date().toISOString(),
        ...batchResult
      });

    } catch (error) {
      console.error('Batch OCR processing error:', error);
      
      const files = req.files as Express.Multer.File[];
      if (files) {
        for (const file of files) {
          await fs.unlink(file.path).catch(() => {});
        }
      }

      res.status(500).json({
        success: false,
        error: 'Batch OCR processing failed',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get batch job status and results
   */
  static async getBatchJobStatus(req: Request, res: Response) {
    try {
      const { jobId } = req.params;
      
      if (!jobId) {
        return res.status(400).json({
          success: false,
          error: 'Job ID is required'
        });
      }

      const jobResult = activeJobs.get(jobId);
      
      if (!jobResult) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
          jobId
        });
      }

      res.json({
        timestamp: new Date().toISOString(),
        ...jobResult
      });

    } catch (error) {
      console.error('Get batch job status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get job status',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get supported OCR languages from Python service
   */
  static async getSupportedLanguages(req: Request, res: Response) {
    try {
      const languages = await pythonOCRService.getSupportedLanguages();
      
      res.json({
        success: true,
        languages,
        recommended: ['vie', 'eng'],
        default: 'vie',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get supported languages error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get supported languages',
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

// Export middleware and handlers
export const uploadSingle = upload.single('file');
export const uploadMultiple = upload.array('files', 10); // Max 10 files

// Export controller methods
export const {
  healthCheck,
  processSingleFile,
  processBatchFiles,
  getBatchJobStatus,
  getSupportedLanguages
} = OCRController;
