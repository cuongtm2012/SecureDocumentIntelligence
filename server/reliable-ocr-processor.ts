/**
 * Reliable OCR Processor
 * Fixes common issues with temporary file handling and process management
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);

export interface ReliableOCRResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingTime: number;
  method: string;
}

export class ReliableOCRProcessor {
  
  async processDocument(filePath: string): Promise<ReliableOCRResult> {
    const startTime = Date.now();
    const fileName = path.basename(filePath);
    
    console.log(`🔧 Reliable OCR processing: ${fileName}`);
    
    try {
      // Verify file exists and is readable
      await fs.promises.access(filePath, fs.constants.R_OK);
      const stats = await fs.promises.stat(filePath);
      console.log(`📄 File size: ${Math.round(stats.size / 1024)}KB`);
      
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.pdf') {
        return await this.processPDF(filePath, startTime);
      } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        return await this.processImage(filePath, startTime);
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }
      
    } catch (error: any) {
      console.error(`❌ Reliable OCR failed for ${fileName}:`, error.message);
      throw error;
    }
  }
  
  private async processPDF(filePath: string, startTime: number): Promise<ReliableOCRResult> {
    const fileName = path.basename(filePath);
    console.log(`📑 Processing PDF: ${fileName}`);
    
    // Use a unique temp directory for this PDF
    const tempDir = `/tmp/reliable_ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Create temp directory
      await fs.promises.mkdir(tempDir, { recursive: true });
      console.log(`📁 Created temp directory: ${tempDir}`);
      
      // Convert PDF to images with better error handling
      const pageFiles = await this.convertPDFToImages(filePath, tempDir);
      
      if (pageFiles.length === 0) {
        throw new Error('No pages could be extracted from PDF');
      }
      
      console.log(`📄 Successfully extracted ${pageFiles.length} pages`);
      
      // Process each page with error resilience
      const pageTexts: string[] = [];
      let totalConfidence = 0;
      
      for (let i = 0; i < pageFiles.length; i++) {
        const pageFile = pageFiles[i];
        const pageNumber = i + 1;
        
        try {
          // Verify page file exists before processing
          await fs.promises.access(pageFile, fs.constants.R_OK);
          const pageStats = await fs.promises.stat(pageFile);
          
          if (pageStats.size === 0) {
            console.log(`⚠️ Page ${pageNumber}: Empty file, skipping`);
            continue;
          }
          
          console.log(`🔍 Processing page ${pageNumber}/${pageFiles.length} (${Math.round(pageStats.size / 1024)}KB)`);
          
          const result = await this.performOCR(pageFile, pageNumber);
          
          if (result.text && result.text.trim().length > 0) {
            pageTexts.push(result.text);
            totalConfidence += result.confidence;
            
            console.log(`✅ Page ${pageNumber}: ${result.text.length} characters, ${result.confidence}% confidence`);
          } else {
            console.log(`⚠️ Page ${pageNumber}: No text extracted`);
          }
          
        } catch (error: any) {
          console.error(`❌ Page ${pageNumber} failed: ${error.message}`);
          // Continue with other pages
        }
      }
      
      const combinedText = pageTexts.join('\n\n').trim();
      const averageConfidence = pageTexts.length > 0 ? Math.round(totalConfidence / pageTexts.length) : 0;
      
      const result = {
        extractedText: combinedText,
        confidence: averageConfidence,
        pageCount: pageFiles.length,
        processingTime: Date.now() - startTime,
        method: 'Reliable PDF OCR'
      };
      
      console.log(`✅ PDF processing completed: ${combinedText.length} characters, ${averageConfidence}% confidence`);
      
      return result;
      
    } finally {
      // Clean up temp directory with retry logic
      try {
        if (fs.existsSync(tempDir)) {
          await this.cleanupTempDir(tempDir);
        }
      } catch (cleanupError) {
        console.warn(`⚠️ Cleanup warning: ${cleanupError}`);
      }
    }
  }
  
  private async processImage(filePath: string, startTime: number): Promise<ReliableOCRResult> {
    const fileName = path.basename(filePath);
    console.log(`🖼️ Processing image: ${fileName}`);
    
    const result = await this.performOCR(filePath, 1);
    
    return {
      extractedText: result.text,
      confidence: result.confidence,
      pageCount: 1,
      processingTime: Date.now() - startTime,
      method: 'Reliable Image OCR'
    };
  }
  
  private async convertPDFToImages(pdfPath: string, outputDir: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const outputPattern = path.join(outputDir, 'page-%03d.png');
      
      console.log('🔄 Converting PDF to images with ImageMagick...');
      
      const args = [
        '-density', '200',
        '-quality', '90',
        '-colorspace', 'sRGB',
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
            
            console.log(`✅ ImageMagick generated ${pageFiles.length} page images`);
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
      
      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        convert.kill('SIGTERM');
        reject(new Error('PDF conversion timeout (30s)'));
      }, 30000);
      
      convert.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }
  
  private async performOCR(imagePath: string, pageNumber: number): Promise<{ text: string; confidence: number }> {
    return new Promise((resolve) => {
      const fileName = path.basename(imagePath);
      
      const args = [
        imagePath,
        'stdout',
        '-l', 'vie+eng',
        '--psm', '3',
        '-c', 'preserve_interword_spaces=1',
        '--dpi', '200'
      ];
      
      console.log(`🤖 Running Tesseract on ${fileName}...`);
      
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
      
      const timeout = setTimeout(() => {
        tesseract.kill('SIGTERM');
        console.log(`⏰ OCR timeout for page ${pageNumber}`);
        resolve({ text: '', confidence: 0 });
      }, 60000); // 60 second timeout
      
      tesseract.on('close', (code: number | null) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          const text = stdout.trim();
          // Calculate confidence based on text length and characteristics
          const confidence = this.calculateConfidence(text);
          
          console.log(`✅ Page ${pageNumber} OCR: ${text.length} chars, ${confidence}% confidence`);
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
  
  private calculateConfidence(text: string): number {
    if (!text || text.length === 0) return 0;
    
    // Base confidence
    let confidence = 70;
    
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
    
    return Math.max(0, Math.min(100, confidence));
  }
  
  private async cleanupTempDir(tempDir: string): Promise<void> {
    try {
      const files = await fs.promises.readdir(tempDir);
      
      // Delete all files first
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        try {
          await fs.promises.unlink(filePath);
        } catch (error) {
          console.warn(`Could not delete file ${filePath}:`, error);
        }
      }
      
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

export const reliableOCRProcessor = new ReliableOCRProcessor();