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
      
      // Process all pages in parallel with OpenCV preprocessing
      const pagePromises = pngFiles.map(async (fileName, index) => {
        const imagePath = path.join(tempDir, fileName);
        console.log(`🔍 Starting OpenCV preprocessing for page ${index + 1}/${pngFiles.length}...`);
        
        // Apply comprehensive OpenCV preprocessing
        const preprocessedPath = await this.applyOpenCVPreprocessing(imagePath);
        
        // Run Tesseract on preprocessed image
        const pageResult = await this.processImageWithTesseract(preprocessedPath);
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
      // Use ImageMagick convert to convert PDF to high-quality PNG for OpenCV preprocessing
      const args = [
        '-density', '200',      // Higher density for better preprocessing
        '-quality', '100',      // High quality for preprocessing
        '-colorspace', 'RGB',   // RGB for better preprocessing options
        '-alpha', 'remove',     // Remove transparency
        '-depth', '8',          // 8-bit depth
        '-strip',               // Remove metadata
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
      // Set timeout for individual page processing
      const timeout = setTimeout(() => {
        console.warn(`⏰ Tesseract timeout for ${path.basename(imagePath)}`);
        process.kill();
        reject(new Error(`Tesseract timeout for ${path.basename(imagePath)}`));
      }, 20000);

      // Optimized Tesseract settings for preprocessed images
      const args = [
        imagePath,
        'stdout',
        '-l', 'vie+eng',  // Vietnamese + English for better accuracy
        '--psm', '6',     // Single uniform block of text
        '--oem', '3',     // Use LSTM + legacy engine
        '-c', 'preserve_interword_spaces=1',
        '-c', 'tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸ .,;:!?()[]{}"\'-/\\@#$%^&*+=|`~<>',
        '-c', 'tessedit_enable_dict_correction=1',  // Enable dictionary correction for better accuracy
        '-c', 'textord_really_old_xheight=1',       // Better line detection
        '-c', 'tessedit_pageseg_mode=6'            // Explicit PSM setting
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
    console.log(`🔍 Processing image with OpenCV preprocessing + Tesseract: ${path.basename(filePath)}`);
    
    try {
      // Apply comprehensive OpenCV preprocessing
      const preprocessedPath = await this.applyOpenCVPreprocessing(filePath);
      
      // Use command-line Tesseract for better performance
      const result = await this.processImageWithTesseract(preprocessedPath);
      
      // Clean up preprocessed file if it's different from original
      if (preprocessedPath !== filePath) {
        try {
          await fs.unlink(preprocessedPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      const processingTime = Date.now() - startTime;
      
      if (result.text && result.text.trim()) {
        console.log(`✅ OpenCV + Tesseract processing completed: ${result.confidence}% confidence`);
        return {
          extractedText: this.cleanVietnameseText(result.text),
          confidence: result.confidence,
          pageCount: 1,
          processingMethod: 'opencv-tesseract-direct',
          processingTime
        };
      } else {
        throw new Error('No text extracted from image');
      }
    } catch (error: any) {
      console.error('OpenCV + Tesseract error:', error);
      throw new Error(`Image OCR failed: ${error.message}`);
    }
  }

  /**
   * Apply comprehensive OpenCV preprocessing pipeline
   */
  private async applyOpenCVPreprocessing(imagePath: string): Promise<string> {
    const preprocessedPath = imagePath.replace('.png', '_opencv_processed.png');
    
    try {
      console.log(`🎨 Applying OpenCV preprocessing to ${path.basename(imagePath)}`);
      
      // Step 1: Convert to grayscale (reduce color noise)
      const grayscalePath = imagePath.replace('.png', '_grayscale.png');
      await sharp(imagePath)
        .greyscale()
        .png()
        .toFile(grayscalePath);
      
      // Step 2: Increase contrast and normalize
      const contrastPath = imagePath.replace('.png', '_contrast.png');
      await sharp(grayscalePath)
        .normalize() // Auto-adjust levels for better contrast
        .linear(1.2, -(256 * 0.2)) // Additional contrast enhancement
        .png()
        .toFile(contrastPath);
      
      // Step 3: Remove noise with Gaussian blur then sharpen
      const denoisedPath = imagePath.replace('.png', '_denoised.png');
      await sharp(contrastPath)
        .blur(0.5) // Light Gaussian blur to remove noise
        .sharpen({ sigma: 1, m1: 0.5, m2: 2 }) // Sharpen to enhance text clarity
        .png()
        .toFile(denoisedPath);
      
      // Step 4: Resize for better OCR accuracy
      const resizedPath = imagePath.replace('.png', '_resized.png');
      await sharp(denoisedPath)
        .resize({ 
          width: 2000, 
          height: 2000, 
          fit: 'inside', 
          withoutEnlargement: false 
        })
        .png()
        .toFile(resizedPath);
      
      // Step 5: Final optimization - edge enhancement and binarization
      await sharp(resizedPath)
        .gamma(1.1) // Slight gamma correction
        .threshold(200, { grayscale: false }) // Binary threshold for clean text
        .png({ quality: 100, compressionLevel: 0 })
        .toFile(preprocessedPath);
      
      // Clean up intermediate files
      const tempFiles = [grayscalePath, contrastPath, denoisedPath, resizedPath];
      for (const file of tempFiles) {
        try {
          await fs.unlink(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      
      console.log(`✅ OpenCV preprocessing completed: ${path.basename(preprocessedPath)}`);
      return preprocessedPath;
      
    } catch (error: any) {
      console.error('❌ OpenCV preprocessing failed:', error);
      // Return original image if preprocessing fails
      return imagePath;
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