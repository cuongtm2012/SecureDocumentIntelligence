import { createWorker } from 'tesseract.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import pdf2pic from 'pdf2pic';

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
      // Convert PDF to images using pdf2pic
      const convert = pdf2pic.fromPath(filePath, {
        density: 300,
        saveFilename: "page",
        savePath: "/tmp/",
        format: "png",
        width: 2000,
        height: 2000
      });

      const results = await convert.bulk(-1);
      
      if (!results || results.length === 0) {
        throw new Error('Failed to convert PDF pages to images');
      }

      let allText = '';
      let totalConfidence = 0;
      let processedPages = 0;

      // Process each page
      for (const result of results) {
        if (result.path) {
          try {
            const pageResult = await this.processImage(result.path, Date.now());
            allText += pageResult.extractedText + '\n\n';
            totalConfidence += pageResult.confidence;
            processedPages++;
            
            // Clean up temporary image file
            try {
              await fs.unlink(result.path);
            } catch (cleanupError) {
              console.warn('Failed to cleanup temp file:', result.path);
            }
          } catch (pageError) {
            console.warn(`Failed to process page ${processedPages + 1}:`, pageError);
          }
        }
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
        'preserve_interword_spaces': '1',
        'tessedit_pageseg_mode': '6'
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