import * as pdfjsLib from 'pdfjs-dist';
import { pdfValidator, PDFValidationResult, PDFRepairOptions } from './pdf-validator';
import { promises as fs } from 'fs';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export interface EnhancedPDFLoadOptions {
  enableValidation: boolean;
  enableAutoRepair: boolean;
  repairOptions?: PDFRepairOptions;
  enableDetailedLogging: boolean;
  fallbackToImages: boolean;
  maxRetries: number;
  password?: string;
}

export interface PDFLoadResult {
  success: boolean;
  document?: pdfjsLib.PDFDocumentProxy;
  error?: string;
  validationResult?: PDFValidationResult;
  repairedFilePath?: string;
  loadMethod: 'direct' | 'repaired' | 'sanitized' | 'fallback';
  warnings: string[];
}

export class EnhancedPDFLoader {
  private defaultOptions: EnhancedPDFLoadOptions = {
    enableValidation: true,
    enableAutoRepair: true,
    repairOptions: {
      enableQPDFRepair: true,
      enableGhostscriptRepair: true,
      removeInvalidCharacters: true,
      fixStructure: true,
      optimizeForOCR: false
    },
    enableDetailedLogging: true,
    fallbackToImages: false,
    maxRetries: 3,
  };

  /**
   * Enhanced PDF loading with validation, repair, and fallback mechanisms
   */
  async loadPDF(filePath: string, options: Partial<EnhancedPDFLoadOptions> = {}): Promise<PDFLoadResult> {
    const opts = { ...this.defaultOptions, ...options };
    const result: PDFLoadResult = {
      success: false,
      loadMethod: 'direct',
      warnings: []
    };

    if (opts.enableDetailedLogging) {
      console.log('🔍 Starting enhanced PDF loading:', filePath);
    }

    try {
      // Step 1: Validate PDF if enabled
      if (opts.enableValidation) {
        result.validationResult = await pdfValidator.validatePDF(filePath);
        
        if (opts.enableDetailedLogging) {
          console.log('📋 Validation result:', {
            isValid: result.validationResult.isValid,
            errors: result.validationResult.errors.length,
            warnings: result.validationResult.warnings.length
          });
        }

        if (!result.validationResult.isValid && result.validationResult.errors.length > 0) {
          result.warnings.push('PDF validation failed, attempting repair...');
          
          // Step 2: Attempt repair if validation failed
          if (opts.enableAutoRepair) {
            try {
              const repairedPath = await pdfValidator.repairPDF(filePath, opts.repairOptions);
              result.repairedFilePath = repairedPath;
              
              // Try loading the repaired PDF
              const repairResult = await this.attemptPDFLoad(repairedPath, opts);
              if (repairResult.success) {
                result.success = true;
                result.document = repairResult.document;
                result.loadMethod = 'repaired';
                result.warnings.push('PDF successfully loaded after repair');
                return result;
              }
            } catch (repairError: any) {
              result.warnings.push(`PDF repair failed: ${repairError.message}`);
            }
          }
        }
      }

      // Step 3: Try direct loading (or if validation passed)
      const directResult = await this.attemptPDFLoad(filePath, opts);
      if (directResult.success) {
        result.success = true;
        result.document = directResult.document;
        result.loadMethod = 'direct';
        if (opts.enableDetailedLogging) {
          console.log('✅ PDF loaded directly');
        }
        return result;
      } else {
        result.warnings.push('Direct PDF loading failed');
      }

      // Step 4: Try with sanitized buffer
      try {
        const sanitizedBuffer = await pdfValidator.sanitizePDFForParsing(filePath);
        const sanitizedResult = await this.attemptPDFLoadFromBuffer(sanitizedBuffer, opts);
        if (sanitizedResult.success) {
          result.success = true;
          result.document = sanitizedResult.document;
          result.loadMethod = 'sanitized';
          result.warnings.push('PDF loaded after sanitization');
          if (opts.enableDetailedLogging) {
            console.log('✅ PDF loaded after sanitization');
          }
          return result;
        }
      } catch (sanitizeError: any) {
        result.warnings.push(`PDF sanitization failed: ${sanitizeError.message}`);
      }

      // Step 5: Fallback to image conversion (if enabled)
      if (opts.fallbackToImages) {
        try {
          const imageResult = await this.convertPDFToImagesAndLoad(filePath, opts);
          if (imageResult.success) {
            result.success = true;
            result.document = imageResult.document;
            result.loadMethod = 'fallback';
            result.warnings.push('PDF converted to images and loaded');
            return result;
          }
        } catch (fallbackError: any) {
          result.warnings.push(`Image fallback failed: ${fallbackError.message}`);
        }
      }

      // All methods failed
      result.error = 'All PDF loading methods failed';
      if (opts.enableDetailedLogging) {
        console.error('❌ All PDF loading methods failed');
      }

    } catch (error: any) {
      result.error = `PDF loading error: ${error.message}`;
      if (opts.enableDetailedLogging) {
        console.error('❌ PDF loading error:', error);
      }
    }

    return result;
  }

  /**
   * Get detailed debug information for PDF loading issues
   */
  async debugPDFIssues(filePath: string): Promise<{
    validation: PDFValidationResult;
    structure: any;
    recommendations: string[];
  }> {
    const validation = await pdfValidator.validatePDF(filePath);
    const structure = await pdfValidator.debugPDFStructure(filePath);

    const recommendations = [
      ...structure.recommendations,
      'Try enabling auto-repair in EnhancedPDFLoader options',
      'Consider converting to images if PDF structure is severely damaged',
      'Check if external tools (qpdf, ghostscript) are available for repair'
    ];

    return {
      validation,
      structure,
      recommendations
    };
  }

  /**
   * Render PDF pages to canvas with error handling
   */
  async renderPDFToCanvas(
    document: pdfjsLib.PDFDocumentProxy, 
    pageNumber: number, 
    canvas: HTMLCanvasElement,
    scale: number = 1.0
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      const context = canvas.getContext('2d');
      if (!context) {
        return { success: false, error: 'Failed to get canvas context' };
      }

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      await page.render(renderContext).promise;
      return { success: true };

    } catch (error: any) {
      console.error('PDF rendering error:', error);
      
      // Handle specific PDF.js errors
      if (error.name === 'InvalidPDFException') {
        return { success: false, error: 'Invalid PDF structure - consider using repair options' };
      }
      if (error.message.includes('getHexString')) {
        return { success: false, error: 'PDF contains invalid characters - try sanitization' };
      }
      if (error.message.includes('stream')) {
        return { success: false, error: 'Corrupted PDF streams - repair may be needed' };
      }

      return { success: false, error: `Rendering failed: ${error.message}` };
    }
  }

  // Private helper methods
  private async attemptPDFLoad(filePath: string, options: EnhancedPDFLoadOptions): Promise<{ success: boolean; document?: pdfjsLib.PDFDocumentProxy }> {
    try {
      const buffer = await fs.readFile(filePath);
      return await this.attemptPDFLoadFromBuffer(buffer, options);
    } catch (error) {
      return { success: false };
    }
  }

  private async attemptPDFLoadFromBuffer(buffer: Buffer, options: EnhancedPDFLoadOptions): Promise<{ success: boolean; document?: pdfjsLib.PDFDocumentProxy }> {
    const loadingTask = pdfjsLib.getDocument({
      data: buffer,
      password: options.password,
      // Enhanced error recovery options
      stopAtErrors: false,
      maxImageSize: 1024 * 1024 * 10, // 10MB max image size
      isEvalSupported: false,
      fontExtraProperties: true,
      // Disable some strict validations that might fail on OCR PDFs
      verbosity: options.enableDetailedLogging ? pdfjsLib.VerbosityLevel.WARNINGS : pdfjsLib.VerbosityLevel.ERRORS,
    });

    try {
      const document = await loadingTask.promise;
      return { success: true, document };
    } catch (error: any) {
      if (options.enableDetailedLogging) {
        console.log('PDF.js loading failed:', error.message);
      }
      return { success: false };
    }
  }

  private async convertPDFToImagesAndLoad(filePath: string, options: EnhancedPDFLoadOptions): Promise<{ success: boolean; document?: pdfjsLib.PDFDocumentProxy }> {
    // This is a placeholder for image conversion fallback
    // In a real implementation, you would:
    // 1. Convert PDF pages to images using tools like pdf2pic or similar
    // 2. Create a new PDF from the images
    // 3. Load the new PDF
    
    console.log('Image conversion fallback not implemented yet');
    return { success: false };
  }
}

export const enhancedPDFLoader = new EnhancedPDFLoader();