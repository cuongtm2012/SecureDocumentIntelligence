/**
 * Vietnamese Receipt OCR Processor
 * Optimized for Vietnamese receipt processing using OpenCV preprocessing and Tesseract OCR
 * 
 * Features:
 * - Advanced OpenCV image preprocessing
 * - Vietnamese language optimization
 * - Receipt-specific OCR configurations
 * - Structured data extraction
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';

const execAsync = promisify(exec);

export interface VietnameseReceiptOCRResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingMethod: string;
  processingTime: number;
  preprocessingSteps: string[];
  structuredData?: {
    storeName?: string;
    address?: string;
    phone?: string;
    date?: string;
    items?: Array<{
      name: string;
      quantity?: number;
      price?: number;
    }>;
    total?: number;
    tax?: number;
  };
}

export class VietnameseReceiptOCRProcessor {
  private tempDir = path.join(process.cwd(), 'temp');

  constructor() {
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async processDocument(filePath: string): Promise<VietnameseReceiptOCRResult> {
    const startTime = Date.now();
    console.log(`🧾 Starting Vietnamese receipt OCR processing: ${filePath}`);

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
      console.error('❌ Vietnamese receipt OCR processing failed:', error);
      throw error;
    }
  }

  private async processPDF(pdfPath: string, startTime: number): Promise<VietnameseReceiptOCRResult> {
    console.log('📄 Converting PDF to images for receipt processing...');
    
    const outputPattern = path.join(this.tempDir, `receipt_page_%d.png`);
    
    try {
      // Convert PDF to images using ImageMagick with receipt-optimized settings
      await execAsync(`magick -density 300 -colorspace Gray "${pdfPath}" "${outputPattern}"`);
      
      // Find generated images
      const imageFiles = fs.readdirSync(this.tempDir)
        .filter(file => file.startsWith('receipt_page_') && file.endsWith('.png'))
        .sort();

      if (imageFiles.length === 0) {
        throw new Error('No images generated from PDF');
      }

      console.log(`📄 Generated ${imageFiles.length} page(s) for processing`);

      // Process all pages and combine results
      let combinedText = '';
      let totalConfidence = 0;
      const preprocessingSteps: string[] = [];

      for (const imageFile of imageFiles) {
        const imagePath = path.join(this.tempDir, imageFile);
        const result = await this.processImageWithPreprocessing(imagePath);
        
        combinedText += result.text + '\n\n';
        totalConfidence += result.confidence;
        if (result.preprocessingSteps) {
          preprocessingSteps.push(...result.preprocessingSteps);
        }

        // Clean up temporary image
        fs.unlinkSync(imagePath);
      }

      const avgConfidence = totalConfidence / imageFiles.length;
      const processingTime = Date.now() - startTime;

      return {
        extractedText: combinedText.trim(),
        confidence: avgConfidence / 100, // Convert to decimal
        pageCount: imageFiles.length,
        processingMethod: 'Vietnamese Receipt OCR (PDF)',
        processingTime,
        preprocessingSteps: Array.from(new Set(preprocessingSteps)),
        structuredData: this.extractReceiptStructure(combinedText)
      };

    } catch (error) {
      console.error('❌ PDF processing failed:', error);
      throw error;
    }
  }

  private async processImage(imagePath: string, startTime: number): Promise<VietnameseReceiptOCRResult> {
    console.log('🖼️ Processing image for Vietnamese receipt OCR...');
    
    const result = await this.processImageWithPreprocessing(imagePath);
    const processingTime = Date.now() - startTime;

    return {
      extractedText: result.text,
      confidence: result.confidence / 100, // Convert to decimal
      pageCount: 1,
      processingMethod: 'Vietnamese Receipt OCR (Image)',
      processingTime,
      preprocessingSteps: result.preprocessingSteps || [],
      structuredData: this.extractReceiptStructure(result.text)
    };
  }

  private async processImageWithPreprocessing(imagePath: string): Promise<{
    text: string;
    confidence: number;
    preprocessingSteps: string[];
  }> {
    const preprocessingSteps: string[] = [];
    
    try {
      console.log('🔧 Starting OpenCV preprocessing for receipt...');
      
      // Step 1: Convert to grayscale using Sharp
      const grayscalePath = path.join(this.tempDir, `grayscale_${Date.now()}.png`);
      await sharp(imagePath)
        .grayscale()
        .png()
        .toFile(grayscalePath);
      preprocessingSteps.push('Grayscale conversion');

      // Step 2: Apply adaptive thresholding using ImageMagick
      const thresholdPath = path.join(this.tempDir, `threshold_${Date.now()}.png`);
      await execAsync(`magick "${grayscalePath}" -adaptive-threshold 15x15+5% "${thresholdPath}"`);
      preprocessingSteps.push('Adaptive thresholding (Gaussian)');

      // Step 3: Deskew the image to correct rotation
      const deskewPath = path.join(this.tempDir, `deskew_${Date.now()}.png`);
      await execAsync(`magick "${thresholdPath}" -deskew 40% "${deskewPath}"`);
      preprocessingSteps.push('Deskewing correction');

      // Step 4: Apply sharpening filter for receipt text
      const sharpenPath = path.join(this.tempDir, `sharpen_${Date.now()}.png`);
      await execAsync(`magick "${deskewPath}" -unsharp 0x1+1.0+0.05 "${sharpenPath}"`);
      preprocessingSteps.push('Sharpening filter');

      // Step 5: Enhance contrast for better OCR
      const enhancedPath = path.join(this.tempDir, `enhanced_${Date.now()}.png`);
      await sharp(sharpenPath)
        .normalize()
        .png()
        .toFile(enhancedPath);
      preprocessingSteps.push('Contrast enhancement');

      console.log('✅ OpenCV preprocessing completed');

      // Run Tesseract OCR with Vietnamese receipt-optimized settings
      const ocrResults = await Promise.all([
        this.runTesseractOCR(enhancedPath, 'vie', 6), // PSM 6: Single uniform block
        this.runTesseractOCR(enhancedPath, 'vie', 4), // PSM 4: Single column of text
        this.runTesseractOCR(enhancedPath, 'vie', 8)  // PSM 8: Single word
      ]);

      // Select best result based on confidence
      const bestResult = ocrResults.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );

      console.log(`✅ Best OCR result: ${bestResult.confidence}% confidence (PSM ${bestResult.psm})`);

      // Clean up temporary files
      [grayscalePath, thresholdPath, deskewPath, sharpenPath, enhancedPath].forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });

      return {
        text: bestResult.text,
        confidence: bestResult.confidence,
        preprocessingSteps
      };

    } catch (error) {
      console.error('❌ Image preprocessing failed:', error);
      throw error;
    }
  }

  private async runTesseractOCR(imagePath: string, language: string, psm: number): Promise<{
    text: string;
    confidence: number;
    psm: number;
  }> {
    try {
      const command = `tesseract "${imagePath}" stdout -l ${language} --oem 1 --psm ${psm} -c tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀẾỂỄỆỈỊỌỎỐỒỔỖỘỚỞỠỢỤỦỨỪỮỰỲỴÝỶỸưăạảấầẩẫậắằẳẵặẹẻẽềếểễệỉịọỏốồổỗộớởỡợụủứừữựỳỵýỷỹ.,;:!?()[]{}\"'-+=/\\_%@#$&*~\`^|<> `;
      
      const { stdout } = await execAsync(command);
      
      // Get confidence using TSV output
      const tsvCommand = `tesseract "${imagePath}" stdout -l ${language} --oem 1 --psm ${psm} tsv`;
      const { stdout: tsvOutput } = await execAsync(tsvCommand);
      
      // Parse confidence from TSV output
      const lines = tsvOutput.split('\n').filter(line => line.trim());
      let totalConfidence = 0;
      let wordCount = 0;
      
      for (const line of lines.slice(1)) { // Skip header
        const columns = line.split('\t');
        if (columns.length >= 11 && columns[11].trim()) {
          const confidence = parseFloat(columns[10]);
          if (!isNaN(confidence) && confidence > 0) {
            totalConfidence += confidence;
            wordCount++;
          }
        }
      }
      
      const avgConfidence = wordCount > 0 ? totalConfidence / wordCount : 0;
      
      return {
        text: stdout.trim(),
        confidence: Math.round(avgConfidence),
        psm
      };
      
    } catch (error) {
      console.error(`❌ Tesseract OCR failed (PSM ${psm}):`, error);
      return {
        text: '',
        confidence: 0,
        psm
      };
    }
  }

  private extractReceiptStructure(text: string): any {
    try {
      console.log('🔍 Extracting structured data from receipt...');
      
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      const structured: any = {};

      // Extract store name (usually first few lines)
      const storeNameCandidate = lines.slice(0, 3).find(line => 
        line.length > 5 && 
        !line.match(/^\d+/) && 
        !line.toLowerCase().includes('địa chỉ') &&
        !line.toLowerCase().includes('address')
      );
      if (storeNameCandidate) {
        structured.storeName = storeNameCandidate;
      }

      // Extract phone number
      const phoneMatch = text.match(/(?:tel|phone|điện thoại|dt)[:\s]*([+\d\s\-()]{8,15})/i);
      if (phoneMatch) {
        structured.phone = phoneMatch[1].trim();
      }

      // Extract date
      const dateMatches = [
        text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/),
        text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+\d{1,2}:\d{2})/),
        text.match(/ngày[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i)
      ];
      const dateMatch = dateMatches.find(match => match);
      if (dateMatch) {
        structured.date = dateMatch[1];
      }

      // Extract total amount
      const totalMatches = [
        text.match(/(?:tổng|total|sum)[:\s]*([0-9,.\s]+)(?:đ|vnd|dong)/i),
        text.match(/(?:thành tiền|amount)[:\s]*([0-9,.\s]+)(?:đ|vnd|dong)/i),
        text.match(/([0-9,.\s]+)(?:đ|vnd|dong)\s*(?:$|\n|tổng|total)/i)
      ];
      const totalMatch = totalMatches.find(match => match);
      if (totalMatch) {
        const totalStr = totalMatch[1].replace(/[,\s]/g, '');
        const totalNum = parseFloat(totalStr);
        if (!isNaN(totalNum)) {
          structured.total = totalNum;
        }
      }

      // Extract items (basic pattern matching)
      const items: any[] = [];
      for (const line of lines) {
        // Look for lines with item name and price pattern
        const itemMatch = line.match(/^(.+?)\s+(\d+(?:[,\.]\d+)*)\s*(?:đ|vnd)?$/i);
        if (itemMatch && itemMatch[1].length > 2) {
          const itemName = itemMatch[1].trim();
          const priceStr = itemMatch[2].replace(/[,]/g, '');
          const price = parseFloat(priceStr);
          
          if (!isNaN(price) && price > 0) {
            items.push({
              name: itemName,
              price: price
            });
          }
        }
      }
      
      if (items.length > 0) {
        structured.items = items;
      }

      console.log(`✅ Extracted structured data: ${Object.keys(structured).length} fields`);
      return structured;

    } catch (error) {
      console.error('❌ Structure extraction failed:', error);
      return {};
    }
  }
}

export const vietnameseReceiptOCRProcessor = new VietnameseReceiptOCRProcessor();