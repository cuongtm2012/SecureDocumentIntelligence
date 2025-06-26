import { createWorker } from 'tesseract.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { spawn } from 'child_process';
import { promisify } from 'util';

export interface DirectOCRResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingMethod: string;
  processingTime: number;
}

export class DirectOCRProcessor {
  async processDocument(filePath: string): Promise<DirectOCRResult> {
    const startTime = Date.now();
    
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Get file extension
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.pdf') {
        return await this.processPDF(filePath, startTime);
      } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        return await this.processImage(filePath, startTime);
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }
    } catch (error: any) {
      console.error('Direct OCR processing error:', error);
      throw error;
    }
  }

  async processPDF(filePath: string, startTime: number): Promise<DirectOCRResult> {
    console.log(`📄 Converting PDF to images for OCR: ${path.basename(filePath)}`);
    
    try {
      // Convert PDF to images using ImageMagick directly
      const tempDir = '/tmp/pdf_ocr_' + Date.now();
      await fs.mkdir(tempDir, { recursive: true });
      
      const outputPattern = path.join(tempDir, 'page-%d.png');
      
      // Use ImageMagick convert to extract pages as images
      await this.executeCommand('convert', [
        '-density', '300',
        '-quality', '100',
        '-background', 'white',
        '-alpha', 'remove',
        filePath,
        outputPattern
      ]);

      // Find all generated page images
      const files = await fs.readdir(tempDir);
      const pageFiles = files.filter(f => f.startsWith('page-') && f.endsWith('.png'))
                           .sort((a, b) => {
                             const numA = parseInt(a.match(/page-(\d+)\.png/)?.[1] || '0');
                             const numB = parseInt(b.match(/page-(\d+)\.png/)?.[1] || '0');
                             return numA - numB;
                           });

      if (pageFiles.length === 0) {
        throw new Error('No pages extracted from PDF');
      }

      let allText = '';
      let totalConfidence = 0;
      let processedPages = 0;

      // Process each page
      for (const pageFile of pageFiles) {
        const pagePath = path.join(tempDir, pageFile);
        try {
          const pageResult = await this.processImage(pagePath, Date.now());
          allText += pageResult.extractedText + '\n\n';
          totalConfidence += pageResult.confidence;
          processedPages++;
        } catch (pageError) {
          console.warn(`Failed to process page ${processedPages + 1}:`, pageError);
        }
      }

      // Clean up temporary directory
      try {
        await fs.rmdir(tempDir, { recursive: true });
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp directory:', tempDir);
      }

      const processingTime = Date.now() - startTime;
      const averageConfidence = processedPages > 0 ? totalConfidence / processedPages : 0;

      if (allText.trim()) {
        console.log(`✅ PDF OCR completed: ${processedPages} pages, ${averageConfidence.toFixed(1)}% confidence`);
        return {
          extractedText: this.cleanVietnameseText(allText.trim()),
          confidence: averageConfidence,
          pageCount: processedPages,
          processingMethod: 'tesseract-js-pdf',
          processingTime
        };
      } else {
        throw new Error('No text extracted from PDF');
      }
    } catch (error: any) {
      console.error('PDF OCR processing error:', error);
      throw new Error(`PDF OCR failed: ${error.message}`);
    }
  }

  private executeCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      let stderr = '';
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  async processImage(filePath: string, startTime: number): Promise<DirectOCRResult> {
    console.log(`🔍 Processing image with Tesseract.js: ${path.basename(filePath)}`);
    
    try {
      // Create enhanced image buffer for better OCR
      const processedImageBuffer = await sharp(filePath)
        .resize(2000, null, { withoutEnlargement: true })
        .greyscale()
        .normalize()
        .sharpen({ sigma: 1, m1: 0.5, m2: 2 })
        .threshold(128)
        .png({ quality: 100 })
        .toBuffer();

      // Initialize Tesseract worker with Vietnamese and English
      const worker = await createWorker(['vie', 'eng'], 1, {
        logger: m => console.log(`Tesseract: ${m.status} - ${m.progress}`)
      });
      
      await worker.setParameters({
        'preserve_interword_spaces': '1'
      });

      console.log('🤖 Running Tesseract OCR...');
      const { data: { text, confidence } } = await worker.recognize(processedImageBuffer);
      await worker.terminate();

      const processingTime = Date.now() - startTime;
      
      if (text && text.trim()) {
        console.log(`✅ Tesseract OCR completed: ${confidence}% confidence`);
        return {
          extractedText: this.cleanVietnameseText(text),
          confidence: confidence,
          pageCount: 1,
          processingMethod: 'tesseract-js',
          processingTime
        };
      } else {
        throw new Error('No text extracted from image');
      }
    } catch (error: any) {
      console.error('Tesseract.js error:', error);
      throw new Error(`Image OCR failed: ${error.message}`);
    }
  }

  private cleanVietnameseText(text: string): string {
    if (!text) return '';
    
    // Basic Vietnamese text cleaning
    return text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[^\w\sÀ-ỹ.,;:!?()-]/g, '')  // Keep Vietnamese characters and basic punctuation
      .trim();
  }
}

export const directOCRProcessor = new DirectOCRProcessor();