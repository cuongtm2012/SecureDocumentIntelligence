import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface SimpleTesseractResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingMethod: string;
  processingTime: number;
}

export class SimpleTesseractProcessor {
  
  async processDocument(filePath: string): Promise<SimpleTesseractResult> {
    const startTime = Date.now();
    
    console.log(`🔍 Processing document with Simple Tesseract: ${filePath}`);
    
    try {
      if (filePath.toLowerCase().endsWith('.pdf')) {
        return await this.processPDF(filePath, startTime);
      } else {
        return await this.processImage(filePath, startTime);
      }
    } catch (error) {
      console.error(`❌ Document processing failed: ${error}`);
      throw error;
    }
  }

  async processPDF(filePath: string, startTime: number): Promise<SimpleTesseractResult> {
    console.log(`📑 Processing PDF with simple approach: ${path.basename(filePath)}`);
    
    const tempDir = `/tmp/simple_pdf_${Date.now()}`;
    
    try {
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Convert PDF to images using ImageMagick
      await this.convertPDFToImages(filePath, `${tempDir}/page-%d.png`);
      
      // Find all generated page images
      const pageFiles = fs.readdirSync(tempDir)
        .filter(file => file.startsWith('page-') && file.endsWith('.png'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/page-(\d+)\.png/)?.[1] || '0');
          const numB = parseInt(b.match(/page-(\d+)\.png/)?.[1] || '0');
          return numA - numB;
        })
        .map(file => path.join(tempDir, file));
      
      console.log(`📄 Generated ${pageFiles.length} pages`);
      
      if (pageFiles.length === 0) {
        throw new Error('No pages extracted from PDF');
      }
      
      // Process each page with simple approach
      const allTexts: string[] = [];
      let totalConfidence = 0;
      let successfulPages = 0;
      
      for (let i = 0; i < pageFiles.length; i++) {
        try {
          console.log(`🔍 Processing page ${i + 1}/${pageFiles.length}...`);
          const result = await this.processImageSimple(pageFiles[i]);
          
          if (result.text && result.text.trim().length > 0) {
            allTexts.push(result.text);
            totalConfidence += result.confidence;
            successfulPages++;
          }
          
          console.log(`✅ Page ${i + 1}/${pageFiles.length} completed`);
        } catch (error) {
          console.log(`❌ Page ${i + 1}/${pageFiles.length} failed: ${error}`);
          // Continue with other pages
        }
      }
      
      const combinedText = allTexts.join('\n\n').trim();
      const avgConfidence = successfulPages > 0 ? Math.round(totalConfidence / successfulPages) : 0;
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Simple Tesseract completed: ${pageFiles.length} pages, ${avgConfidence}% confidence`);
      
      return {
        extractedText: combinedText,
        confidence: avgConfidence,
        pageCount: pageFiles.length,
        processingMethod: 'simple_tesseract_pdf',
        processingTime
      };
      
    } catch (error) {
      console.error(`❌ PDF processing failed: ${error}`);
      throw error;
    } finally {
      // Cleanup temp directory
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.warn(`⚠️ Cleanup failed: ${cleanupError}`);
      }
    }
  }

  async processImage(filePath: string, startTime: number): Promise<SimpleTesseractResult> {
    console.log(`🖼️ Processing single image with simple Tesseract: ${filePath}`);
    
    try {
      const result = await this.processImageSimple(filePath);
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Simple Tesseract successful: ${result.confidence}% confidence`);
      
      return {
        extractedText: result.text,
        confidence: result.confidence,
        pageCount: 1,
        processingMethod: 'simple_tesseract_image',
        processingTime
      };
      
    } catch (error) {
      console.error(`❌ Image processing failed: ${error}`);
      throw error;
    }
  }

  private async convertPDFToImages(pdfPath: string, outputPattern: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-density', '150',  // Lower DPI for faster processing
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
      }, 20000);
    });
  }

  private async processImageSimple(imagePath: string): Promise<{
    text: string;
    confidence: number;
  }> {
    return new Promise((resolve, reject) => {
      // Very simple approach: try Vietnamese first, then English
      const attempts = [
        { lang: 'vie', psm: '3' },
        { lang: 'eng', psm: '3' },
        { lang: 'vie', psm: '6' }
      ];
      
      let bestResult = { text: '', confidence: 0 };
      let attemptIndex = 0;
      
      const tryNextAttempt = () => {
        if (attemptIndex >= attempts.length) {
          // Return best result or empty if nothing worked
          resolve(bestResult);
          return;
        }
        
        const attempt = attempts[attemptIndex];
        attemptIndex++;
        
        const cmd = ['tesseract', imagePath, 'stdout', '-l', attempt.lang, '--psm', attempt.psm];
        
        const process = spawn('tesseract', [imagePath, 'stdout', '-l', attempt.lang, '--psm', attempt.psm], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        process.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
        
        process.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
        
        process.on('close', (code: number) => {
          const text = stdout.trim();
          
          if (code === 0 && text.length > bestResult.text.length) {
            bestResult = {
              text: text,
              confidence: Math.min(90, 60 + text.length)
            };
          }
          
          // Try next attempt
          setTimeout(tryNextAttempt, 100);
        });
        
        process.on('error', (error: any) => {
          console.warn(`Tesseract attempt failed: ${error.message}`);
          // Try next attempt
          setTimeout(tryNextAttempt, 100);
        });
        
        // Timeout for this specific attempt
        setTimeout(() => {
          process.kill('SIGTERM');
          setTimeout(tryNextAttempt, 100);
        }, 8000);
      };
      
      // Start the first attempt
      tryNextAttempt();
      
      // Overall timeout
      setTimeout(() => {
        resolve(bestResult);
      }, 25000);
    });
  }
}

export const simpleTesseractProcessor = new SimpleTesseractProcessor();