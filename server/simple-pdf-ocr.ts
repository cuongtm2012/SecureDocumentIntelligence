import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface PDFOCRResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingTime: number;
}

export class SimplePDFOCRProcessor {
  
  async processDocument(filePath: string): Promise<PDFOCRResult> {
    const startTime = Date.now();
    
    console.log(`📑 Simple PDF OCR processing: ${path.basename(filePath)}`);
    
    if (!filePath.toLowerCase().endsWith('.pdf')) {
      // For images, use direct OCR
      const text = await this.ocrImage(filePath);
      return {
        extractedText: text,
        confidence: text.length > 0 ? 85 : 0,
        pageCount: 1,
        processingTime: Date.now() - startTime
      };
    }
    
    const tempDir = `/tmp/pdf_ocr_${Date.now()}`;
    
    try {
      // Create temp directory
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Convert PDF to images
      await this.convertPDFToImages(filePath, tempDir);
      
      // Find all page images
      const pageFiles = fs.readdirSync(tempDir)
        .filter(file => file.startsWith('page-') && file.endsWith('.png'))
        .sort()
        .map(file => path.join(tempDir, file));
      
      console.log(`📄 Found ${pageFiles.length} pages`);
      
      if (pageFiles.length === 0) {
        throw new Error('No pages extracted from PDF');
      }
      
      // OCR each page
      const allTexts: string[] = [];
      let pageCount = 0;
      
      for (const pageFile of pageFiles) {
        try {
          pageCount++;
          console.log(`🔍 OCR page ${pageCount}/${pageFiles.length}...`);
          
          const pageText = await this.ocrImage(pageFile);
          if (pageText.trim().length > 0) {
            allTexts.push(pageText);
            console.log(`✅ Page ${pageCount}: ${pageText.length} characters extracted`);
          } else {
            console.log(`⚠️ Page ${pageCount}: No text extracted`);
          }
        } catch (error) {
          console.log(`❌ Page ${pageCount} failed: ${error}`);
        }
      }
      
      const combinedText = allTexts.join('\n\n').trim();
      const confidence = combinedText.length > 0 ? Math.min(95, 60 + (combinedText.length / 100)) : 0;
      
      console.log(`✅ PDF OCR completed: ${combinedText.length} characters, ${Math.round(confidence)}% confidence`);
      
      return {
        extractedText: combinedText,
        confidence: Math.round(confidence),
        pageCount: pageFiles.length,
        processingTime: Date.now() - startTime
      };
      
    } finally {
      // Cleanup
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }
  
  private async convertPDFToImages(pdfPath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const outputPattern = path.join(outputDir, 'page-%d.png');
      
      console.log(`🔄 Converting PDF to images...`);
      
      const convert = spawn('convert', [
        '-density', '150',
        '-colorspace', 'Gray',
        '-alpha', 'remove',
        '-background', 'white',
        pdfPath,
        outputPattern
      ], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stderr = '';
      
      convert.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      convert.on('close', (code: number) => {
        if (code === 0) {
          console.log('✅ PDF conversion completed');
          resolve();
        } else {
          reject(new Error(`ImageMagick failed: ${stderr}`));
        }
      });
      
      convert.on('error', (error: any) => {
        reject(new Error(`ImageMagick error: ${error.message}`));
      });
      
      // Timeout
      setTimeout(() => {
        convert.kill('SIGTERM');
        reject(new Error('PDF conversion timeout (5 minutes)'));
      }, 300000); // Increased to 5 minutes for large PDFs
    });
  }
  
  private async ocrImage(imagePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`🔍 OCR processing: ${path.basename(imagePath)}`);
      
      const tesseract = spawn('tesseract', [
        imagePath,
        'stdout',
        '-l', 'vie',
        '--psm', '3'
      ], {
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
      
      tesseract.on('close', (code: number) => {
        if (code === 0) {
          const text = stdout.trim();
          console.log(`✅ OCR completed: ${text.length} characters`);
          resolve(text);
        } else {
          console.log(`❌ OCR failed with code ${code}: ${stderr}`);
          resolve(''); // Return empty string instead of rejecting
        }
      });
      
      tesseract.on('error', (error: any) => {
        console.log(`❌ OCR process error: ${error.message}`);
        resolve(''); // Return empty string instead of rejecting
      });
      
      // Timeout
      setTimeout(() => {
        tesseract.kill('SIGTERM');
        console.log(`⏰ OCR timeout for ${path.basename(imagePath)}`);
        resolve('');
      }, 10000);
    });
  }
}

export const simplePDFOCRProcessor = new SimplePDFOCRProcessor();