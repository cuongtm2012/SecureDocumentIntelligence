import { createWorker } from 'tesseract.js';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
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
      // Check if input file exists and is readable
      if (!fsSync.existsSync(pdfPath)) {
        reject(new Error(`PDF file not found: ${pdfPath}`));
        return;
      }

      // Use ImageMagick convert with settings optimized for Vietnamese text OCR
      const args = [
        '-density', '300',      // Higher density for better text clarity
        '-quality', '95',       // Highest quality for OCR
        '-colorspace', 'Gray',  // Convert to grayscale
        '-background', 'white', // Ensure white background
        '-alpha', 'remove',     // Remove transparency
        '-enhance',             // Enhance image for better text recognition
        '-sharpen', '0x0.5',    // Light sharpening
        '-normalize',           // Normalize contrast and brightness
        '-strip',               // Remove metadata
        '-limit', 'memory', '2GB',  // Limit memory usage
        '-limit', 'map', '2GB',
        pdfPath,
        outputPattern
      ];
      
      console.log(`🔄 Converting PDF to images: ${path.basename(pdfPath)}`);
      console.log(`📝 Command: convert ${args.join(' ')}`);
      
      const process = spawn('convert', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('PDF conversion timeout (5 minutes limit)'));
      }, 300000);
      
      process.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          console.log('✅ PDF to images conversion completed successfully');
          // Check if any images were actually created
          const dir = path.dirname(outputPattern);
          const files = fsSync.readdirSync(dir).filter((f: string) => f.endsWith('.png'));
          if (files.length === 0) {
            reject(new Error('PDF conversion completed but no images were generated'));
          } else {
            console.log(`📄 Generated ${files.length} page image(s)`);
            resolve();
          }
        } else {
          console.error('❌ PDF conversion failed with code:', code);
          console.error('❌ Error output:', stderr);
          
          // Provide more specific error messages
          if (stderr.includes('not authorized')) {
            reject(new Error('ImageMagick PDF processing not authorized. PDF may be protected or corrupted.'));
          } else if (stderr.includes('no decode delegate')) {
            reject(new Error('ImageMagick cannot process this PDF format. File may be corrupted.'));
          } else {
            reject(new Error(`PDF conversion failed (code ${code}): ${stderr.substring(0, 200)}`));
          }
        }
      });
      
      process.on('error', (error) => {
        clearTimeout(timeout);
        console.error('❌ PDF conversion process error:', error);
        if (error.message.includes('ENOENT')) {
          reject(new Error('ImageMagick "convert" command not found. Please install ImageMagick.'));
        } else {
          reject(error);
        }
      });
    });
  }

  private async processImageWithTesseract(imagePath: string): Promise<{ text: string; confidence: number }> {
    return new Promise((resolve, reject) => {
      let tesseractProcess: any = null;
      
      // Increase timeout to 5 minutes for complex Vietnamese documents
      const timeout = setTimeout(() => {
        console.warn(`⏰ Tesseract timeout for ${path.basename(imagePath)} (5 minutes limit reached)`);
        // Try to kill the tesseract process if it's still running
        if (tesseractProcess && tesseractProcess.pid) {
          try {
            tesseractProcess.kill('SIGTERM');
          } catch (error: any) {
            console.warn(`⚠️ Could not kill tesseract process: ${error?.message || 'Unknown error'}`);
          }
        }
        // Return partial results instead of complete failure
        resolve({
          text: '[OCR timeout - document may be too complex or corrupted]',
          confidence: 0
        });
      }, 300000);

      // Try multiple PSM modes for better text detection
      const psmModes = [3, 6, 4]; // Document modes in order of preference
      let currentModeIndex = 0;

      const tryOCRWithMode = (psm: number) => {
        console.log(`🤖 Trying Tesseract with PSM ${psm} for ${path.basename(imagePath)}`);
        
        const args = [
          imagePath,
          'stdout',
          '-l', 'vie+eng',
          '--psm', psm.toString(),
          '-c', 'preserve_interword_spaces=1',
          '--dpi', '300',
          '-c', 'tessedit_create_hocr=0',
          '-c', 'tessedit_create_tsv=0'
        ];
        
        tesseractProcess = spawn('tesseract', args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 240000 // 4 minute timeout per attempt
        });
        
        let stdout = '';
        let stderr = '';
        
        tesseractProcess.stdout.on('data', (data: any) => {
          stdout += data.toString();
        });
        
        tesseractProcess.stderr.on('data', (data: any) => {
          stderr += data.toString();
        });
        
        tesseractProcess.on('close', (code: any) => {
          const extractedText = stdout.trim();
          
          if (code === 0 && extractedText.length > 10) {
            // Success with meaningful text
            clearTimeout(timeout);
            const confidenceMatch = stderr.match(/Mean confidence: (\d+)/);
            const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 75;
            
            console.log(`✅ Tesseract OCR completed with PSM ${psm}: ${extractedText.length} chars, ${confidence}% confidence`);
            resolve({
              text: extractedText,
              confidence: confidence
            });
          } else if (currentModeIndex < psmModes.length - 1) {
            // Try next PSM mode
            console.log(`⚠️ PSM ${psm} yielded minimal text (${extractedText.length} chars), trying next mode...`);
            currentModeIndex++;
            tryOCRWithMode(psmModes[currentModeIndex]);
          } else {
            // All modes failed, return what we got
            clearTimeout(timeout);
            console.warn(`⚠️ All PSM modes completed, best result: ${extractedText.length} characters`);
            resolve({
              text: extractedText || '[No readable text detected in document]',
              confidence: extractedText.length > 0 ? 30 : 0
            });
          }
        });
        
        tesseractProcess.on('error', (error: any) => {
          if (currentModeIndex < psmModes.length - 1) {
            console.log(`❌ PSM ${psm} failed with error: ${error.message}, trying next mode...`);
            currentModeIndex++;
            tryOCRWithMode(psmModes[currentModeIndex]);
          } else {
            clearTimeout(timeout);
            console.error('❌ All Tesseract modes failed:', error);
            resolve({
              text: `[OCR processing failed: ${error.message}]`,
              confidence: 0
            });
          }
        });
      };

      // Start with the first PSM mode
      tryOCRWithMode(psmModes[currentModeIndex]);
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