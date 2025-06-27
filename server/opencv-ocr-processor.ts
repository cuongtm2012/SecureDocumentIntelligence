import { promises as fs } from 'fs';
import * as path from 'path';
import sharp from 'sharp';
import { spawn } from 'child_process';

export interface OpenCVOCRResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingMethod: string;
  processingTime: number;
}

export class OpenCVOCRProcessor {
  async processDocument(filePath: string): Promise<OpenCVOCRResult> {
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
      console.error('OpenCV OCR processing error:', error);
      throw error;
    }
  }

  async processPDF(filePath: string, startTime: number): Promise<OpenCVOCRResult> {
    console.log(`📄 Processing PDF with OpenCV preprocessing: ${path.basename(filePath)}`);
    
    try {
      // Convert PDF to images using ImageMagick with optimized settings
      const tempDir = `/tmp/opencv_ocr_${Date.now()}`;
      await fs.mkdir(tempDir, { recursive: true });
      
      const outputPattern = path.join(tempDir, 'page-%d.png');
      
      // Convert PDF to high-quality images for OpenCV preprocessing
      console.log('🔄 Converting PDF to images for OpenCV preprocessing...');
      await this.convertPDFToImages(filePath, outputPattern);
      
      // Get list of generated images
      const imageFiles = await fs.readdir(tempDir);
      const pngFiles = imageFiles.filter(f => f.endsWith('.png')).sort();
      
      if (pngFiles.length === 0) {
        throw new Error('No images generated from PDF');
      }
      
      console.log(`📄 Processing ${pngFiles.length} pages with OpenCV preprocessing + Tesseract OCR...`);
      
      // Process all pages in parallel
      const pagePromises = pngFiles.map(async (fileName, index) => {
        const imagePath = path.join(tempDir, fileName);
        console.log(`🔍 Starting OpenCV preprocessing for page ${index + 1}/${pngFiles.length}...`);
        
        // Apply OpenCV-style preprocessing using Sharp
        const preprocessedPath = await this.preprocessImageWithOpenCVStyle(imagePath);
        
        // Run Tesseract OCR on preprocessed image
        const pageResult = await this.runTesseractOCR(preprocessedPath);
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
      
      console.log(`✅ OpenCV + Tesseract OCR completed: ${pngFiles.length} pages, ${averageConfidence.toFixed(1)}% confidence`);
      
      return {
        extractedText: allText.trim(),
        confidence: averageConfidence,
        pageCount: pngFiles.length,
        processingMethod: 'opencv-tesseract',
        processingTime
      };
    } catch (error: any) {
      console.error('OpenCV PDF processing error:', error);
      throw error;
    }
  }

  private async convertPDFToImages(pdfPath: string, outputPattern: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use higher density for better preprocessing results
      const args = [
        '-density', '200',  // Higher density for better OpenCV preprocessing
        '-quality', '100',  // High quality for preprocessing
        '-colorspace', 'RGB',  // RGB for better preprocessing options
        '-alpha', 'remove',    // Remove transparency
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

  private async preprocessImageWithOpenCVStyle(imagePath: string): Promise<string> {
    console.log(`🎨 Applying OpenCV-style preprocessing to ${path.basename(imagePath)}`);
    
    const tempPreprocessedPath = imagePath.replace('.png', '_preprocessed.png');
    
    try {
      // Apply advanced image preprocessing similar to OpenCV
      await sharp(imagePath)
        // 1. Convert to grayscale
        .greyscale()
        // 2. Resize for better OCR (increase resolution if small)
        .resize({ 
          width: 2000, 
          height: 2000, 
          fit: 'inside', 
          withoutEnlargement: false 
        })
        // 3. Enhance contrast (similar to cv2.equalizeHist)
        .normalize()
        // 4. Apply sharpening filter
        .sharpen()
        // 5. Adjust levels for better text contrast
        .gamma(1.2)
        .linear(1.2, -(256 * 0.2))
        // 6. Save as high-quality PNG
        .png({ quality: 100, compressionLevel: 0 })
        .toFile(tempPreprocessedPath);
      
      console.log(`✅ OpenCV-style preprocessing completed for ${path.basename(imagePath)}`);
      return tempPreprocessedPath;
    } catch (error: any) {
      console.error('❌ Image preprocessing failed:', error);
      // Return original image if preprocessing fails
      return imagePath;
    }
  }

  private async runTesseractOCR(imagePath: string): Promise<{ text: string; confidence: number }> {
    return new Promise((resolve, reject) => {
      // Set timeout for individual page processing
      const timeout = setTimeout(() => {
        console.warn(`⏰ Tesseract timeout for ${path.basename(imagePath)}`);
        process.kill();
        reject(new Error(`Tesseract timeout for ${path.basename(imagePath)}`));
      }, 20000);

      // Use optimized Tesseract settings for preprocessed images
      const args = [
        imagePath,
        'stdout',
        '-l', 'vie+eng',  // Vietnamese + English for better accuracy
        '--psm', '6',     // Single uniform block
        '-c', 'preserve_interword_spaces=1',
        '-c', 'tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸ .,;:!?()[]{}"\'-/\\@#$%^&*+=|`~<>',
        '--oem', '3'      // Use LSTM engine for better accuracy
      ];
      
      console.log(`🤖 Running Tesseract OCR: tesseract ${args.slice(0, 5).join(' ')}...`);
      
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
          const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 90;
          
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

  async processImage(filePath: string, startTime: number): Promise<OpenCVOCRResult> {
    console.log(`🔍 Processing image with OpenCV preprocessing: ${path.basename(filePath)}`);
    
    try {
      // Apply OpenCV-style preprocessing
      const preprocessedPath = await this.preprocessImageWithOpenCVStyle(filePath);
      
      // Run Tesseract OCR on preprocessed image
      const result = await this.runTesseractOCR(preprocessedPath);
      
      // Clean up preprocessed file if it's different from original
      if (preprocessedPath !== filePath) {
        await fs.unlink(preprocessedPath).catch(() => {});
      }
      
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ OpenCV + Tesseract image processing completed: ${result.confidence}% confidence`);
      
      return {
        extractedText: result.text,
        confidence: result.confidence,
        pageCount: 1,
        processingMethod: 'opencv-tesseract-image',
        processingTime
      };
    } catch (error: any) {
      console.error('OpenCV image processing error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const openCVOCRProcessor = new OpenCVOCRProcessor();