import { createWorker } from 'tesseract.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { spawn } from 'child_process';

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
    console.log(`📄 Processing PDF with OCR: ${path.basename(filePath)}`);
    
    try {
      // Convert PDF to images using ImageMagick
      const tempDir = `/tmp/pdf_ocr_${Date.now()}`;
      await fs.mkdir(tempDir, { recursive: true });
      
      const outputPattern = path.join(tempDir, 'page-%d.png');
      
      // Use ImageMagick to convert PDF to PNG images
      console.log('🔄 Converting PDF to images...');
      await this.convertPDFToImages(filePath, outputPattern);
      
      // Get list of generated images
      const imageFiles = await fs.readdir(tempDir);
      const pngFiles = imageFiles.filter(f => f.endsWith('.png')).sort();
      
      if (pngFiles.length === 0) {
        throw new Error('No images generated from PDF');
      }
      
      console.log(`📄 Processing ${pngFiles.length} pages with parallel Tesseract OCR...`);
      
      // Process all pages in parallel for better performance
      const pagePromises = pngFiles.map(async (fileName, index) => {
        const imagePath = path.join(tempDir, fileName);
        console.log(`🔍 Starting page ${index + 1}/${pngFiles.length}...`);
        
        const pageResult = await this.processImageWithTesseract(imagePath);
        console.log(`✅ Completed page ${index + 1}/${pngFiles.length}`);
        
        return {
          pageNumber: index + 1,
          text: pageResult.text,
          confidence: pageResult.confidence
        };
      });
      
      // Wait for all pages to complete
      const pageResults = await Promise.all(pagePromises);
      
      // Combine results in order
      let allText = '';
      let totalConfidence = 0;
      
      pageResults
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .forEach(result => {
          allText += result.text + '\n\n';
          totalConfidence += result.confidence;
        });
      
      // Clean up temporary files
      await fs.rm(tempDir, { recursive: true, force: true });
      
      const averageConfidence = totalConfidence / pngFiles.length;
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ PDF OCR completed: ${pngFiles.length} pages, ${averageConfidence.toFixed(1)}% confidence`);
      
      return {
        extractedText: this.cleanVietnameseText(allText),
        confidence: averageConfidence,
        pageCount: pngFiles.length,
        processingMethod: 'pdf-tesseract-ocr',
        processingTime
      };
      
    } catch (error: any) {
      console.error('PDF OCR processing error:', error);
      throw new Error(`PDF OCR failed: ${error.message}`);
    }
  }

  private async convertPDFToImages(pdfPath: string, outputPattern: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use ImageMagick convert to convert PDF to PNG with ultra-fast settings
      const args = [
        '-density', '150',  // Much lower density for speed (still good for OCR)
        '-quality', '75',   // Lower quality for faster processing
        '-colorspace', 'Gray',  // Convert to grayscale for faster OCR
        '-compress', 'None',    // No compression for faster processing
        '-depth', '8',      // 8-bit depth for faster processing
        '-strip',           // Remove all metadata for faster processing
        pdfPath,
        outputPattern
      ];
      
      console.log(`🔄 Running: convert ${args.join(' ')}`);
      
      const process = spawn('convert', args);
      let stderr = '';
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          console.log('✅ PDF to images conversion completed');
          resolve();
        } else {
          console.error('❌ PDF conversion failed:', stderr);
          reject(new Error(`PDF conversion failed with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        console.error('❌ PDF conversion process error:', error);
        reject(error);
      });
    });
  }

  private async processImageWithTesseract(imagePath: string): Promise<{ text: string; confidence: number }> {
    return new Promise((resolve, reject) => {
      // Set timeout for individual page processing (15 seconds max for speed)
      const timeout = setTimeout(() => {
        console.warn(`⏰ Tesseract timeout for ${path.basename(imagePath)}`);
        process.kill();
        reject(new Error(`Tesseract timeout for ${path.basename(imagePath)}`));
      }, 15000);

      // Use command-line Tesseract with ultra-fast settings
      const args = [
        imagePath,
        'stdout',
        '-l', 'vie',  // Use only Vietnamese for faster processing
        '--psm', '6',  // PSM 6 for single uniform block - faster than PSM 3
        '-c', 'preserve_interword_spaces=1',
        '-c', 'tessedit_do_invert=0',  // Skip image inversion check
        '-c', 'tessedit_pageseg_mode=6',  // Explicit PSM setting
        '-c', 'load_system_dawg=0',      // Skip system dictionary for speed
        '-c', 'load_freq_dawg=0',        // Skip frequency dictionary for speed
        '-c', 'tessedit_enable_dict_correction=0'  // Skip dictionary correction for speed
      ];
      
      console.log(`🤖 Running: tesseract ${args.join(' ')}`);
      
      const process = spawn('tesseract', args);
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          // Extract confidence from stderr if available
          const confidenceMatch = stderr.match(/Mean confidence: (\d+)/);
          const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 85;
          
          console.log(`✅ Tesseract OCR completed for ${path.basename(imagePath)}`);
          resolve({
            text: stdout.trim(),
            confidence: confidence
          });
        } else {
          console.error('❌ Tesseract OCR failed:', stderr);
          reject(new Error(`Tesseract failed with code ${code}: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        clearTimeout(timeout);
        console.error('❌ Tesseract process error:', error);
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