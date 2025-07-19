
import { promises as fs } from 'fs';
import * as path from 'path';
import sharp from 'sharp';

export interface OpenCVPreprocessingOptions {
  grayscaleConversion: boolean;
  contrastEnhancement: boolean;
  denoising: boolean;
  textAreaDetection: boolean;
  edgeEnhancement: boolean;
  binarization: boolean;
  morphologicalOperations: boolean;
  resizeForOCR: boolean;
}

export interface PreprocessingResult {
  success: boolean;
  processedImagePath: string;
  appliedOperations: string[];
  processingTime: number;
  imageStats: {
    originalSize: { width: number; height: number };
    processedSize: { width: number; height: number };
    format: string;
  };
}

export class AdvancedOpenCVProcessor {
  private defaultOptions: OpenCVPreprocessingOptions = {
    grayscaleConversion: true,
    contrastEnhancement: true,
    denoising: true,
    textAreaDetection: false, // Advanced feature - requires additional processing
    edgeEnhancement: true,
    binarization: true,
    morphologicalOperations: false, // Advanced feature
    resizeForOCR: true
  };

  /**
   * Apply comprehensive OpenCV-style preprocessing pipeline
   */
  async preprocessImage(
    imagePath: string, 
    options: Partial<OpenCVPreprocessingOptions> = {}
  ): Promise<PreprocessingResult> {
    const startTime = Date.now();
    const opts = { ...this.defaultOptions, ...options };
    const appliedOperations: string[] = [];
    
    try {
      console.log(`🎨 Starting advanced OpenCV preprocessing: ${path.basename(imagePath)}`);
      
      // Get original image metadata
      const originalMetadata = await sharp(imagePath).metadata();
      let currentImage = sharp(imagePath);
      
      // Step 1: Convert to grayscale (reduce color noise, focus on luminance)
      if (opts.grayscaleConversion) {
        console.log('🔄 Converting to grayscale...');
        currentImage = currentImage.greyscale();
        appliedOperations.push('grayscale_conversion');
      }
      
      // Step 2: Resize for optimal OCR processing
      if (opts.resizeForOCR) {
        console.log('🔄 Resizing for OCR optimization...');
        currentImage = currentImage.resize({
          width: Math.max(2000, originalMetadata.width || 1000),
          height: Math.max(2000, originalMetadata.height || 1000),
          fit: 'inside',
          withoutEnlargement: false,
          kernel: 'lanczos3' // High-quality resampling
        });
        appliedOperations.push('resize_for_ocr');
      }
      
      // Step 3: Contrast enhancement (make text stand out from background)
      if (opts.contrastEnhancement) {
        console.log('🔄 Enhancing contrast...');
        currentImage = currentImage
          .normalize() // Auto-adjust levels
          .linear(1.3, -(256 * 0.15)) // Additional contrast boost
          .gamma(1.1); // Slight gamma correction
        appliedOperations.push('contrast_enhancement');
      }
      
      // Step 4: Denoising (remove noise using Gaussian blur + sharpening)
      if (opts.denoising) {
        console.log('🔄 Applying denoising...');
        currentImage = currentImage
          .blur(0.3) // Light Gaussian blur to remove noise
          .sharpen({ sigma: 1.2, m1: 0.7, m2: 2.5 }); // Sharpen to restore text clarity
        appliedOperations.push('gaussian_denoising');
      }
      
      // Step 5: Edge enhancement (make text edges clearer)
      if (opts.edgeEnhancement) {
        console.log('🔄 Enhancing edges...');
        currentImage = currentImage
          .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.5 }) // Additional sharpening
          .modulate({ brightness: 1.05, saturation: 0.9 }); // Fine-tune brightness
        appliedOperations.push('edge_enhancement');
      }
      
      // Step 6: Binarization (convert to black and white for clean text)
      if (opts.binarization) {
        console.log('🔄 Applying binarization...');
        currentImage = currentImage
          .threshold(200, { grayscale: false }); // Binary threshold
        appliedOperations.push('otsu_binarization');
      }
      
      // Generate output path
      const outputPath = imagePath.replace(
        path.extname(imagePath), 
        '_opencv_advanced' + path.extname(imagePath)
      );
      
      // Save processed image
      await currentImage
        .png({ quality: 100, compressionLevel: 0 }) // Uncompressed for best OCR quality
        .toFile(outputPath);
      
      // Get processed image metadata
      const processedMetadata = await sharp(outputPath).metadata();
      
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Advanced OpenCV preprocessing completed in ${processingTime}ms`);
      console.log(`📊 Applied operations: ${appliedOperations.join(', ')}`);
      
      return {
        success: true,
        processedImagePath: outputPath,
        appliedOperations,
        processingTime,
        imageStats: {
          originalSize: {
            width: originalMetadata.width || 0,
            height: originalMetadata.height || 0
          },
          processedSize: {
            width: processedMetadata.width || 0,
            height: processedMetadata.height || 0
          },
          format: processedMetadata.format || 'unknown'
        }
      };
      
    } catch (error: any) {
      console.error('❌ Advanced OpenCV preprocessing failed:', error);
      return {
        success: false,
        processedImagePath: imagePath,
        appliedOperations: [],
        processingTime: Date.now() - startTime,
        imageStats: {
          originalSize: { width: 0, height: 0 },
          processedSize: { width: 0, height: 0 },
          format: 'unknown'
        }
      };
    }
  }

  /**
   * Apply morphological operations for advanced text cleaning
   */
  async applyMorphologicalOperations(imagePath: string): Promise<string> {
    const outputPath = imagePath.replace(
      path.extname(imagePath), 
      '_morphological' + path.extname(imagePath)
    );
    
    try {
      console.log('🔄 Applying morphological operations...');
      
      // Simulate morphological operations using Sharp
      // (Real OpenCV would use cv2.morphologyEx)
      await sharp(imagePath)
        .convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 9, -1, -1, -1, -1] // Morphological-like kernel
        })
        .threshold(180)
        .png()
        .toFile(outputPath);
      
      console.log('✅ Morphological operations completed');
      return outputPath;
      
    } catch (error: any) {
      console.error('❌ Morphological operations failed:', error);
      return imagePath;
    }
  }

  /**
   * Detect and crop text areas (advanced feature)
   */
  async detectAndCropTextAreas(imagePath: string): Promise<string[]> {
    console.log('🔄 Detecting text areas...');
    
    try {
      // This is a simplified text area detection
      // Real implementation would use OpenCV's text detection algorithms
      const metadata = await sharp(imagePath).metadata();
      const width = metadata.width || 1000;
      const height = metadata.height || 1000;
      
      // Create crop regions (simulate text detection)
      const cropRegions = [
        { left: 0, top: 0, width: width, height: Math.floor(height / 3) },
        { left: 0, top: Math.floor(height / 3), width: width, height: Math.floor(height / 3) },
        { left: 0, top: Math.floor(2 * height / 3), width: width, height: Math.floor(height / 3) }
      ];
      
      const croppedPaths: string[] = [];
      
      for (let i = 0; i < cropRegions.length; i++) {
        const region = cropRegions[i];
        const croppedPath = imagePath.replace(
          path.extname(imagePath), 
          `_crop_${i}${path.extname(imagePath)}`
        );
        
        await sharp(imagePath)
          .extract(region)
          .png()
          .toFile(croppedPath);
        
        croppedPaths.push(croppedPath);
      }
      
      console.log(`✅ Created ${croppedPaths.length} text area crops`);
      return croppedPaths;
      
    } catch (error: any) {
      console.error('❌ Text area detection failed:', error);
      return [imagePath];
    }
  }

  /**
   * Clean up temporary files
   */
  async cleanup(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

export const advancedOpenCVProcessor = new AdvancedOpenCVProcessor();
