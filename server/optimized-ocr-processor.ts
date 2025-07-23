/**
 * Optimized OCR Processor
 * High-performance OCR with parallel processing and detailed progress tracking
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { ocrProgressTracker } from './ocr-progress-tracker';

const writeFile = promisify(fs.writeFile);

export interface OptimizedOCRResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingTime: number;
  method: string;
  performanceMetrics: {
    conversionTime: number;
    ocrTime: number;
    cleanupTime: number;
    averagePageTime: number;
    pagesPerSecond: number;
  };
}

export class OptimizedOCRProcessor {
  private maxConcurrentPages = 3; // Process up to 3 pages simultaneously
  
  async processDocument(filePath: string, documentId?: string): Promise<OptimizedOCRResult> {
    const startTime = Date.now();
    const fileName = path.basename(filePath);
    
    console.log(`⚡ Optimized OCR processing: ${fileName}`);
    
    if (documentId) {
      ocrProgressTracker.startTracking(documentId, 6);
    }

    try {
      // Verify file exists and is readable
      await fs.promises.access(filePath, fs.constants.R_OK);
      const stats = await fs.promises.stat(filePath);
      console.log(`📄 File size: ${Math.round(stats.size / 1024)}KB`);
      
      if (documentId) {
        ocrProgressTracker.updateProgress(documentId, 'initializing', 1, 'File validation completed');
      }

      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.pdf') {
        return await this.processPDFOptimized(filePath, startTime, documentId);
      } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        return await this.processImageOptimized(filePath, startTime, documentId);
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }
      
    } catch (error: any) {
      console.error(`❌ Optimized OCR failed for ${fileName}:`, error.message);
      if (documentId) {
        ocrProgressTracker.completeTracking(documentId, false, { error: error.message });
      }
      throw error;
    }
  }
  
  private async processPDFOptimized(filePath: string, startTime: number, documentId?: string): Promise<OptimizedOCRResult> {
    const fileName = path.basename(filePath);
    console.log(`📑 Optimized PDF processing: ${fileName}`);
    
    const conversionStartTime = Date.now();
    
    // Use a unique temp directory for this PDF
    const tempDir = `/tmp/optimized_ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Create temp directory
      await fs.promises.mkdir(tempDir, { recursive: true });
      console.log(`📁 Created temp directory: ${tempDir}`);
      
      if (documentId) {
        ocrProgressTracker.updateProgress(documentId, 'converting', 2, 'Converting PDF to images...');
      }
      
      // Convert PDF to images with optimized settings for speed and quality
      const pageFiles = await this.convertPDFToImagesOptimized(filePath, tempDir);
      
      if (pageFiles.length === 0) {
        throw new Error('No pages could be extracted from PDF');
      }
      
      const conversionTime = Date.now() - conversionStartTime;
      console.log(`📄 Successfully extracted ${pageFiles.length} pages in ${conversionTime}ms`);
      
      if (documentId) {
        ocrProgressTracker.updateProgress(
          documentId, 
          'extracting', 
          3, 
          `Processing ${pageFiles.length} pages with parallel OCR...`,
          { pageCount: pageFiles.length, conversionTimeMs: conversionTime }
        );
      }
      
      const ocrStartTime = Date.now();
      
      // Process pages in batches for optimal performance
      const pageTexts = await this.processPagesBatched(pageFiles, documentId);
      
      const ocrTime = Date.now() - ocrStartTime;
      const totalConfidence = pageTexts.reduce((sum, page) => sum + page.confidence, 0);
      const averageConfidence = pageTexts.length > 0 ? Math.round(totalConfidence / pageTexts.length) : 0;
      
      const combinedText = pageTexts.map(p => p.text).join('\n\n').trim();
      
      if (documentId) {
        ocrProgressTracker.updateProgress(
          documentId, 
          'reconstructing', 
          5, 
          'Text extraction completed, preparing results...',
          { 
            extractedLength: combinedText.length, 
            averageConfidence,
            ocrTimeMs: ocrTime
          }
        );
      }
      
      const cleanupStartTime = Date.now();
      await this.cleanupTempDir(tempDir);
      const cleanupTime = Date.now() - cleanupStartTime;
      
      const totalProcessingTime = Date.now() - startTime;
      const averagePageTime = totalProcessingTime / pageFiles.length;
      const pagesPerSecond = pageFiles.length / (totalProcessingTime / 1000);
      
      const result: OptimizedOCRResult = {
        extractedText: combinedText,
        confidence: averageConfidence,
        pageCount: pageFiles.length,
        processingTime: totalProcessingTime,
        method: 'Optimized Parallel PDF OCR',
        performanceMetrics: {
          conversionTime,
          ocrTime,
          cleanupTime,
          averagePageTime: Math.round(averagePageTime),
          pagesPerSecond: Math.round(pagesPerSecond * 100) / 100
        }
      };
      
      console.log(`⚡ Optimized processing completed: ${combinedText.length} chars, ${averageConfidence}% confidence, ${Math.round(pagesPerSecond * 10) / 10} pages/sec`);
      
      if (documentId) {
        ocrProgressTracker.completeTracking(documentId, true, result.performanceMetrics);
      }
      
      return result;
      
    } finally {
      // Ensure cleanup happens
      try {
        if (fs.existsSync(tempDir)) {
          await this.cleanupTempDir(tempDir);
        }
      } catch (cleanupError) {
        console.warn(`⚠️ Cleanup warning: ${cleanupError}`);
      }
    }
  }
  
  private async processImageOptimized(filePath: string, startTime: number, documentId?: string): Promise<OptimizedOCRResult> {
    const fileName = path.basename(filePath);
    console.log(`🖼️ Optimized image processing: ${fileName}`);
    
    if (documentId) {
      ocrProgressTracker.updateProgress(documentId, 'extracting', 3, 'Processing single image with OCR...');
    }
    
    const result = await this.performOptimizedOCR(filePath, 1);
    
    const processingTime = Date.now() - startTime;
    
    const optimizedResult: OptimizedOCRResult = {
      extractedText: result.text,
      confidence: result.confidence,
      pageCount: 1,
      processingTime,
      method: 'Optimized Image OCR',
      performanceMetrics: {
        conversionTime: 0,
        ocrTime: processingTime,
        cleanupTime: 0,
        averagePageTime: processingTime,
        pagesPerSecond: 1000 / processingTime
      }
    };
    
    if (documentId) {
      ocrProgressTracker.completeTracking(documentId, true, optimizedResult.performanceMetrics);
    }
    
    return optimizedResult;
  }
  
  private async convertPDFToImagesOptimized(pdfPath: string, outputDir: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const outputPattern = path.join(outputDir, 'page-%03d.png');
      
      console.log('⚡ Converting PDF to images with optimized settings...');
      
      // ImageMagick settings optimized for accuracy (matching reliable processor)
      const args = [
        '-density', '200',      // Higher density for better OCR accuracy
        '-quality', '90',       // Higher quality for better text recognition
        '-colorspace', 'sRGB',  // Better color space for text clarity
        '-alpha', 'remove',
        '-background', 'white',
        pdfPath,
        outputPattern
      ];
      
      const convert = spawn('convert', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stderr = '';
      
      convert.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      convert.on('close', async (code: number) => {
        if (code === 0) {
          try {
            // Find all generated page files
            const files = await fs.promises.readdir(outputDir);
            const pageFiles = files
              .filter(file => file.match(/^page-\d+\.png$/))
              .sort()
              .map(file => path.join(outputDir, file));
            
            console.log(`⚡ ImageMagick generated ${pageFiles.length} page images`);
            resolve(pageFiles);
            
          } catch (error) {
            reject(new Error(`Failed to list generated images: ${error}`));
          }
        } else {
          console.error('❌ ImageMagick stderr:', stderr);
          reject(new Error(`ImageMagick failed with code ${code}: ${stderr.substring(0, 200)}`));
        }
      });
      
      convert.on('error', (error: any) => {
        reject(new Error(`ImageMagick process error: ${error.message}`));
      });
      
      // Increased timeout for large PDF processing
      const timeout = setTimeout(() => {
        convert.kill('SIGTERM');
        reject(new Error('PDF conversion timeout (120s)'));
      }, 120000); // Increased to 120 seconds for large PDFs
      
      convert.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }
  
  private async processPagesBatched(pageFiles: string[], documentId?: string): Promise<Array<{ text: string; confidence: number }>> {
    const results: Array<{ text: string; confidence: number }> = [];
    const totalPages = pageFiles.length;
    
    // Process pages in batches of maxConcurrentPages
    for (let i = 0; i < pageFiles.length; i += this.maxConcurrentPages) {
      const batch = pageFiles.slice(i, i + this.maxConcurrentPages);
      const batchNumber = Math.floor(i / this.maxConcurrentPages) + 1;
      const totalBatches = Math.ceil(pageFiles.length / this.maxConcurrentPages);
      
      console.log(`⚡ Processing batch ${batchNumber}/${totalBatches} (${batch.length} pages)`);
      
      if (documentId) {
        const currentProgress = 3 + (batchNumber / totalBatches);
        ocrProgressTracker.updateProgress(
          documentId, 
          'extracting', 
          Math.floor(currentProgress), 
          `Processing batch ${batchNumber}/${totalBatches}...`,
          { currentBatch: batchNumber, totalBatches, pagesInBatch: batch.length }
        );
      }
      
      // Process all pages in this batch concurrently
      const batchPromises = batch.map(async (pageFile, batchIndex) => {
        const globalPageNumber = i + batchIndex + 1;
        
        try {
          // Verify page file exists before processing
          await fs.promises.access(pageFile, fs.constants.R_OK);
          const pageStats = await fs.promises.stat(pageFile);
          
          if (pageStats.size === 0) {
            console.log(`⚠️ Page ${globalPageNumber}: Empty file, skipping`);
            return { text: '', confidence: 0 };
          }
          
          console.log(`⚡ Processing page ${globalPageNumber}/${totalPages} (${Math.round(pageStats.size / 1024)}KB)`);
          
          const result = await this.performOptimizedOCR(pageFile, globalPageNumber);
          
          if (result.text && result.text.trim().length > 0) {
            console.log(`✅ Page ${globalPageNumber}: ${result.text.length} characters, ${result.confidence}% confidence`);
            return result;
          } else {
            console.log(`⚠️ Page ${globalPageNumber}: No text extracted`);
            return { text: '', confidence: 0 };
          }
          
        } catch (error: any) {
          console.error(`❌ Page ${globalPageNumber} failed: ${error.message}`);
          return { text: '', confidence: 0 };
        }
      });
      
      // Wait for all pages in this batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }
  
  private async performOptimizedOCR(imagePath: string, pageNumber: number): Promise<{ text: string; confidence: number }> {
    return new Promise((resolve) => {
      const fileName = path.basename(imagePath);
      
      // Optimized Tesseract arguments using reliable processor settings
      const args = [
        imagePath,
        'stdout',
        '-l', 'vie+eng',          // Vietnamese + English
        '--psm', '3',             // Fully automatic page segmentation (more reliable)
        '--oem', '1',             // LSTM OCR Engine Mode
        '-c', 'preserve_interword_spaces=1',
        '--dpi', '200'            // Match ImageMagick conversion DPI
      ];
      
      console.log(`⚡ Running optimized Tesseract on ${fileName}...`);
      
      const tesseract = spawn('tesseract', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      tesseract.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      tesseract.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      // Adequate timeout for reliable processing
      const timeout = setTimeout(() => {
        tesseract.kill('SIGTERM');
        console.log(`⏰ OCR timeout for page ${pageNumber}`);
        resolve({ text: '', confidence: 0 });
      }, 60000); // 60 second timeout (matches reliable processor)
      
      tesseract.on('close', (code: number | null) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          const text = stdout.trim();
          // Enhanced confidence calculation for Vietnamese text
          const confidence = this.calculateOptimizedConfidence(text);
          
          console.log(`⚡ Page ${pageNumber} OCR: ${text.length} chars, ${confidence}% confidence`);
          resolve({ text, confidence });
          
        } else {
          console.log(`❌ Page ${pageNumber} OCR failed with code ${code}`);
          if (stderr) {
            console.log(`❌ Tesseract stderr: ${stderr.substring(0, 200)}`);
          }
          resolve({ text: '', confidence: 0 });
        }
      });
      
      tesseract.on('error', (error: any) => {
        clearTimeout(timeout);
        console.error(`❌ Page ${pageNumber} Tesseract error: ${error.message}`);
        resolve({ text: '', confidence: 0 });
      });
    });
  }
  
  private calculateOptimizedConfidence(text: string): number {
    if (!text || text.length === 0) return 0;
    
    // Use the same confidence calculation as reliable processor
    let confidence = 70; // Base confidence
    
    // Increase confidence based on text length
    if (text.length > 100) confidence += 10;
    if (text.length > 500) confidence += 10;
    
    // Increase confidence if Vietnamese diacritics are present
    const vietnameseDiacritics = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/gi;
    const diacriticMatches = text.match(vietnameseDiacritics);
    if (diacriticMatches && diacriticMatches.length > 0) {
      confidence += Math.min(15, diacriticMatches.length);
    }
    
    // Decrease confidence for too many special characters
    const specialChars = text.match(/[^a-zA-Zàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ\s\d.,;:!?()-]/g);
    if (specialChars && specialChars.length > text.length * 0.1) {
      confidence -= 20;
    }
    
    // Word structure analysis
    const words = text.split(/\s+/);
    const validWords = words.filter(word => word.length > 2 && /^[a-zA-Zàáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]+$/.test(word));
    const wordRatio = validWords.length / Math.max(words.length, 1);
    if (wordRatio > 0.8) confidence += 10;
    
    // Additional penalty is already applied above
    
    return Math.max(0, Math.min(100, Math.round(confidence)));
  }
  
  private async cleanupTempDir(tempDir: string): Promise<void> {
    try {
      const files = await fs.promises.readdir(tempDir);
      
      // Delete all files first
      await Promise.all(files.map(async (file) => {
        const filePath = path.join(tempDir, file);
        try {
          await fs.promises.unlink(filePath);
        } catch (error) {
          console.warn(`Could not delete file ${filePath}:`, error);
        }
      }));
      
      // Then delete the directory
      await fs.promises.rmdir(tempDir);
      console.log(`🧹 Cleaned up temp directory: ${tempDir}`);
      
    } catch (error: any) {
      console.warn(`⚠️ Cleanup failed for ${tempDir}: ${error.message}`);
      
      // Try force removal as fallback
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        console.log(`🧹 Force cleaned temp directory: ${tempDir}`);
      } catch (forceError) {
        console.warn(`⚠️ Force cleanup also failed: ${forceError}`);
      }
    }
  }
}

export const optimizedOCRProcessor = new OptimizedOCRProcessor();