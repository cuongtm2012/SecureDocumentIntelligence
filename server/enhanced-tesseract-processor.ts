/**
 * Enhanced Tesseract Processor for Vietnamese Text
 * Simplified, stable OCR processing without problematic character whitelists
 */

import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import sharp from 'sharp';

const execAsync = promisify(exec);

export interface EnhancedOCRResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingMethod: string;
  processingTime: number;
  preprocessingSteps: string[];
  structuredData?: any;
}

export class EnhancedTesseractProcessor {
  private tempDir = path.join(process.cwd(), 'temp');

  constructor() {
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async processDocument(filePath: string): Promise<EnhancedOCRResult> {
    const startTime = Date.now();
    console.log(`🔤 Starting enhanced Tesseract processing: ${filePath}`);

    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Determine if it's a PDF or image
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.pdf') {
        return await this.processPDF(filePath, startTime);
      } else {
        return await this.processImage(filePath, startTime);
      }
    } catch (error) {
      console.error('❌ Enhanced Tesseract processing failed:', error);
      throw error;
    }
  }

  private async processPDF(pdfPath: string, startTime: number): Promise<EnhancedOCRResult> {
    console.log('📄 Converting PDF to images for enhanced processing...');
    
    const outputPattern = path.join(this.tempDir, `enhanced_page_%d.png`);
    
    try {
      // Convert PDF to images using pdftoppm
      await execAsync(`pdftoppm -png -r 200 "${pdfPath}" "${outputPattern.replace('_%d', '')}"`);
      
      // Find generated image files
      const imageFiles = fs.readdirSync(this.tempDir)
        .filter(file => file.startsWith('enhanced_page_') && file.endsWith('.png'))
        .sort();

      if (imageFiles.length === 0) {
        throw new Error('No images generated from PDF');
      }

      console.log(`📄 Generated ${imageFiles.length} images from PDF`);

      // Process each page
      const pageResults = [];
      const preprocessingSteps: string[] = [];

      for (const imageFile of imageFiles) {
        const imagePath = path.join(this.tempDir, imageFile);
        const result = await this.processImageWithEnhancement(imagePath);
        pageResults.push(result);
        
        // Collect unique preprocessing steps
        result.preprocessingSteps.forEach(step => {
          if (!preprocessingSteps.includes(step)) {
            preprocessingSteps.push(step);
          }
        });

        // Clean up page image
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }

      // Combine results
      const combinedText = pageResults.map(r => r.text).join('\n\n');
      const avgConfidence = pageResults.reduce((sum, r) => sum + r.confidence, 0) / pageResults.length;
      const processingTime = Date.now() - startTime;

      return {
        extractedText: combinedText,
        confidence: avgConfidence / 100, // Convert to decimal
        pageCount: imageFiles.length,
        processingMethod: 'Enhanced Tesseract (PDF)',
        processingTime,
        preprocessingSteps,
        structuredData: this.extractStructuredData(combinedText)
      };

    } catch (error) {
      console.error('❌ PDF processing failed:', error);
      throw error;
    }
  }

  private async processImage(imagePath: string, startTime: number): Promise<EnhancedOCRResult> {
    console.log('🖼️ Processing image with enhanced Tesseract...');
    
    const result = await this.processImageWithEnhancement(imagePath);
    const processingTime = Date.now() - startTime;

    return {
      extractedText: result.text,
      confidence: result.confidence / 100, // Convert to decimal
      pageCount: 1,
      processingMethod: 'Enhanced Tesseract (Image)',
      processingTime,
      preprocessingSteps: result.preprocessingSteps || [],
      structuredData: this.extractStructuredData(result.text)
    };
  }

  private async processImageWithEnhancement(imagePath: string): Promise<{
    text: string;
    confidence: number;
    preprocessingSteps: string[];
  }> {
    const preprocessingSteps: string[] = [];
    
    try {
      console.log('🔧 Starting enhanced image preprocessing...');
      
      // Step 1: Convert to grayscale and enhance contrast
      const enhancedPath = path.join(this.tempDir, `enhanced_${Date.now()}.png`);
      await sharp(imagePath)
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1, m1: 0.5, m2: 1 })
        .png()
        .toFile(enhancedPath);
      preprocessingSteps.push('Grayscale + Contrast + Sharpening');

      console.log('✅ Enhanced preprocessing completed');

      // Run multiple Tesseract approaches and pick the best result
      const ocrResults = await Promise.all([
        this.runSimpleTesseract(enhancedPath, 'vie', 3), // PSM 3: Fully automatic page segmentation
        this.runSimpleTesseract(enhancedPath, 'vie', 6), // PSM 6: Single uniform block of text
        this.runSimpleTesseract(enhancedPath, 'vie', 4), // PSM 4: Single column of text of variable sizes
      ]);

      // Select best result based on confidence and text length
      const bestResult = ocrResults.reduce((best, current) => {
        const scoreA = best.confidence * Math.log(best.text.length + 1);
        const scoreB = current.confidence * Math.log(current.text.length + 1);
        return scoreB > scoreA ? current : best;
      });

      console.log(`✅ Best OCR result: ${bestResult.confidence}% confidence (PSM ${bestResult.psm})`);

      // Clean up temporary files
      if (fs.existsSync(enhancedPath)) {
        fs.unlinkSync(enhancedPath);
      }

      return {
        text: bestResult.text,
        confidence: bestResult.confidence,
        preprocessingSteps
      };

    } catch (error) {
      console.error('❌ Enhanced image processing failed:', error);
      throw error;
    }
  }

  private async runSimpleTesseract(imagePath: string, language: string, psm: number): Promise<{
    text: string;
    confidence: number;
    psm: number;
  }> {
    try {
      // Use simple Tesseract command without character whitelist
      const command = `tesseract "${imagePath}" stdout -l ${language} --oem 1 --psm ${psm}`;
      
      const { stdout } = await execAsync(command);
      
      // Get confidence using hocr output for better accuracy
      let confidence = 50; // Default confidence
      try {
        const hocrCommand = `tesseract "${imagePath}" stdout -l ${language} --oem 1 --psm ${psm} hocr`;
        const { stdout: hocrOutput } = await execAsync(hocrCommand);
        
        // Parse confidence from hocr output
        const confidenceMatches = hocrOutput.match(/x_wconf\s+(\d+)/g);
        if (confidenceMatches && confidenceMatches.length > 0) {
          const confidences = confidenceMatches.map(match => {
          const numMatch = match.match(/\d+/);
          return numMatch ? parseInt(numMatch[0]) : 50;
        });
          confidence = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
        }
      } catch (hocrError) {
        // Fallback to default confidence if hocr fails
        console.warn(`HOCR confidence extraction failed for PSM ${psm}, using default`);
      }
      
      return {
        text: stdout.trim(),
        confidence: Math.round(confidence),
        psm
      };
      
    } catch (error) {
      console.warn(`Tesseract OCR failed (PSM ${psm}):`, error instanceof Error ? error.message : 'Unknown error');
      return {
        text: '',
        confidence: 0,
        psm
      };
    }
  }

  private extractStructuredData(text: string): any {
    try {
      console.log('🔍 Extracting structured data...');
      
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      const structured: any = {};

      // Basic text statistics
      structured.totalLines = lines.length;
      structured.totalCharacters = text.length;
      structured.totalWords = text.split(/\s+/).filter(word => word).length;

      // Check if it looks like a receipt
      const receiptKeywords = ['tổng', 'total', 'tiền', 'money', 'thanh toán', 'payment', 'hóa đơn', 'invoice'];
      const hasReceiptKeywords = receiptKeywords.some(keyword => 
        text.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (hasReceiptKeywords) {
        structured.isReceiptDocument = true;
        
        // Extract potential amounts
        const amountMatches = text.match(/[\d,\.]+\s*(?:vnd|đ|dong)/gi);
        if (amountMatches) {
          structured.amounts = amountMatches;
        }

        // Extract phone numbers
        const phoneMatch = text.match(/(?:0|\+84)[0-9\s\-]{8,15}/);
        if (phoneMatch) {
          structured.phone = phoneMatch[0].trim();
        }

        // Extract dates
        const dateMatch = text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/);
        if (dateMatch) {
          structured.date = dateMatch[0];
        }
      }

      console.log(`✅ Extracted structured data: ${Object.keys(structured).length} fields`);
      return structured;
      
    } catch (error) {
      console.error('Failed to extract structured data:', error);
      return {};
    }
  }
}

export const enhancedTesseractProcessor = new EnhancedTesseractProcessor();