import { promises as fs } from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { spawn } from 'child_process';
import axios from 'axios';
import FormData from 'form-data';

export interface PaddleOCRResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingMethod: string;
  processingTime: number;
  boundingBoxes?: Array<{
    text: string;
    confidence: number;
    bbox: number[];
  }>;
}

export class PaddleOCRProcessor {
  private pythonServiceUrl = 'http://localhost:8002'; // Different port from existing OCR service

  async processDocument(filePath: string): Promise<PaddleOCRResult> {
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
      console.error('PaddleOCR processing error:', error);
      throw error;
    }
  }

  async processPDF(filePath: string, startTime: number): Promise<PaddleOCRResult> {
    console.log(`📄 Processing PDF with PaddleOCR: ${path.basename(filePath)}`);
    
    try {
      // Convert PDF to images using ImageMagick with settings optimized for PaddleOCR
      const tempDir = `/tmp/paddle_ocr_${Date.now()}`;
      await fs.mkdir(tempDir, { recursive: true });
      
      const outputPattern = path.join(tempDir, 'page-%d.png');
      
      // Convert PDF to high-quality images for PaddleOCR
      console.log('🔄 Converting PDF to images for PaddleOCR...');
      await this.convertPDFToImages(filePath, outputPattern);
      
      // Get list of generated images
      const imageFiles = await fs.readdir(tempDir);
      const pngFiles = imageFiles.filter(f => f.endsWith('.png')).sort();
      
      if (pngFiles.length === 0) {
        throw new Error('No images generated from PDF');
      }
      
      console.log(`📄 Processing ${pngFiles.length} pages with PaddleOCR...`);
      
      // Process all pages in parallel
      const pagePromises = pngFiles.map(async (fileName, index) => {
        const imagePath = path.join(tempDir, fileName);
        console.log(`🔍 Starting PaddleOCR for page ${index + 1}/${pngFiles.length}...`);
        
        // Apply preprocessing optimized for PaddleOCR
        const preprocessedPath = await this.preprocessImageForPaddleOCR(imagePath);
        
        // Run PaddleOCR on preprocessed image
        const pageResult = await this.runPaddleOCR(preprocessedPath);
        console.log(`✅ Completed page ${index + 1}/${pngFiles.length}`);
        
        return {
          pageNumber: index + 1,
          text: pageResult.text,
          confidence: pageResult.confidence,
          boundingBoxes: pageResult.boundingBoxes
        };
      });
      
      // Wait for all pages to complete
      const pageResults = await Promise.all(pagePromises);
      
      // Combine results in order
      let allText = '';
      let totalConfidence = 0;
      let allBoundingBoxes: any[] = [];
      
      pageResults
        .sort((a, b) => a.pageNumber - b.pageNumber)
        .forEach(result => {
          allText += result.text + '\n\n';
          totalConfidence += result.confidence;
          if (result.boundingBoxes) {
            allBoundingBoxes.push(...result.boundingBoxes);
          }
        });
      
      // Clean up temporary files
      await fs.rm(tempDir, { recursive: true, force: true });
      
      const averageConfidence = totalConfidence / pngFiles.length;
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ PaddleOCR completed: ${pngFiles.length} pages, ${averageConfidence.toFixed(1)}% confidence`);
      
      return {
        extractedText: allText.trim(),
        confidence: averageConfidence,
        pageCount: pngFiles.length,
        processingMethod: 'paddleocr',
        processingTime,
        boundingBoxes: allBoundingBoxes
      };
    } catch (error: any) {
      console.error('PaddleOCR PDF processing error:', error);
      throw error;
    }
  }

  private async convertPDFToImages(pdfPath: string, outputPattern: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use optimized settings for PaddleOCR
      const args = [
        '-density', '200',  // Good density for PaddleOCR
        '-quality', '95',   // High quality for better text recognition
        '-colorspace', 'RGB',  // RGB for PaddleOCR (it can handle color)
        '-alpha', 'remove',    // Remove transparency
        '-background', 'white', // White background
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

  private async preprocessImageForPaddleOCR(imagePath: string): Promise<string> {
    console.log(`🎨 Applying PaddleOCR preprocessing to ${path.basename(imagePath)}`);
    
    const tempPreprocessedPath = imagePath.replace('.png', '_paddle_preprocessed.png');
    
    try {
      // Apply preprocessing optimized for PaddleOCR
      await sharp(imagePath)
        // Resize to optimal size for PaddleOCR (not too small, not too large)
        .resize({ 
          width: 1600, 
          height: 1600, 
          fit: 'inside', 
          withoutEnlargement: false 
        })
        // Enhance contrast for better text detection
        .normalize()
        // Apply slight sharpening
        .sharpen()
        // Ensure RGB format (PaddleOCR works well with color)
        .removeAlpha()
        // Save as high-quality PNG
        .png({ quality: 100, compressionLevel: 0 })
        .toFile(tempPreprocessedPath);
      
      console.log(`✅ PaddleOCR preprocessing completed for ${path.basename(imagePath)}`);
      return tempPreprocessedPath;
    } catch (error: any) {
      console.error('❌ Image preprocessing failed:', error);
      // Return original image if preprocessing fails
      return imagePath;
    }
  }

  private async runPaddleOCR(imagePath: string): Promise<{ text: string; confidence: number; boundingBoxes?: any[] }> {
    try {
      // Try to use Python PaddleOCR service if available
      const serviceResult = await this.callPaddleOCRService(imagePath);
      if (serviceResult) {
        return serviceResult;
      }
    } catch (serviceError) {
      console.warn('⚠️ PaddleOCR service unavailable, falling back to Python script...');
    }

    // Fallback to direct Python script execution
    return await this.runPaddleOCRScript(imagePath);
  }

  private async callPaddleOCRService(imagePath: string): Promise<{ text: string; confidence: number; boundingBoxes?: any[] }> {
    const formData = new FormData();
    const fileStream = await fs.readFile(imagePath);
    formData.append('file', fileStream, path.basename(imagePath));
    formData.append('language', 'vietnamese');
    formData.append('use_angle_cls', 'true');
    formData.append('use_gpu', 'false');

    const response = await axios.post(`${this.pythonServiceUrl}/paddle-ocr`, formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    if (response.data.success) {
      return {
        text: response.data.text,
        confidence: response.data.confidence,
        boundingBoxes: response.data.bounding_boxes
      };
    } else {
      throw new Error(response.data.error || 'PaddleOCR service failed');
    }
  }

  private async runPaddleOCRScript(imagePath: string): Promise<{ text: string; confidence: number; boundingBoxes?: any[] }> {
    return new Promise((resolve, reject) => {
      // Set timeout for processing
      let childProcess: any;
      const timeout = setTimeout(() => {
        console.warn(`⏰ PaddleOCR timeout for ${path.basename(imagePath)}`);
        if (childProcess) childProcess.kill('SIGTERM');
        reject(new Error(`PaddleOCR timeout for ${path.basename(imagePath)}`));
      }, 30000);

      console.log(`🤖 Running PaddleOCR Python script for ${path.basename(imagePath)}`);
      
      // Use the external Python script
      const scriptPath = path.join(process.cwd(), 'python-paddle-ocr-simple.py');
      childProcess = spawn('python3', [scriptPath, imagePath]);
      let stdout = '';
      let stderr = '';
      
      childProcess.stdout.on('data', (data: any) => {
        stdout += data.toString();
      });
      
      childProcess.stderr.on('data', (data: any) => {
        stderr += data.toString();
      });
      
      childProcess.on('close', (code: number) => {
        clearTimeout(timeout);
        
        try {
          const result = JSON.parse(stdout.trim());
          
          if (result.success) {
            console.log(`✅ PaddleOCR completed for ${path.basename(imagePath)} (${result.processing_method || 'unknown'})`);
            resolve({
              text: result.text || '',
              confidence: result.confidence || 0,
              boundingBoxes: result.bounding_boxes || []
            });
          } else {
            console.error('❌ PaddleOCR failed:', result.error);
            reject(new Error(`PaddleOCR failed: ${result.error}`));
          }
        } catch (parseError) {
          console.error('❌ PaddleOCR output parsing failed:', stdout, stderr);
          reject(new Error(`PaddleOCR output parsing failed: ${parseError}`));
        }
      });
      
      childProcess.on('error', (error: any) => {
        clearTimeout(timeout);
        console.error('❌ PaddleOCR process error:', error);
        reject(error);
      });
    });
  }

  async processImage(filePath: string, startTime: number): Promise<PaddleOCRResult> {
    console.log(`🔍 Processing image with PaddleOCR: ${path.basename(filePath)}`);
    
    try {
      // Apply preprocessing
      const preprocessedPath = await this.preprocessImageForPaddleOCR(filePath);
      
      // Run PaddleOCR
      const result = await this.runPaddleOCR(preprocessedPath);
      
      // Clean up preprocessed file if it's different from original
      if (preprocessedPath !== filePath) {
        await fs.unlink(preprocessedPath).catch(() => {});
      }
      
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ PaddleOCR image processing completed: ${result.confidence}% confidence`);
      
      return {
        extractedText: result.text,
        confidence: result.confidence,
        pageCount: 1,
        processingMethod: 'paddleocr-image',
        processingTime,
        boundingBoxes: result.boundingBoxes
      };
    } catch (error: any) {
      console.error('PaddleOCR image processing error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const paddleOCRProcessor = new PaddleOCRProcessor();