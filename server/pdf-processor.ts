import { promises as fs } from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import { vietnameseTextCleaner } from './vietnamese-text-cleaner';
import { logger } from './logger';
// Remove dependency on external command-line tools
// import { exec } from 'child_process';
// import { promisify } from 'util';

// Use pdf-parse for pure Node.js PDF text extraction
import pdf from 'pdf-parse';

// const execAsync = promisify(exec);

export interface PDFProcessingResult {
  extractedText: string;
  confidence: number;
  structuredData: any;
  pageCount: number;
  processingMethod: 'text-extraction' | 'ocr' | 'hybrid';
}

export class PDFProcessor {
  private async extractTextFromPDF(filePath: string): Promise<{ text: string; hasText: boolean; pageCount: number }> {
    try {
      console.log('📖 Extracting text from PDF using pdf-parse...');
      
      // Read PDF file as buffer
      const dataBuffer = await fs.readFile(filePath);
      
      // Parse PDF using pdf-parse library
      const data = await pdf(dataBuffer, {
        // Enhanced options for better text extraction
        normalizeWhitespace: true,
        disableCombineTextItems: false
      });
      
      const text = data.text.trim();
      const hasText = text.length > 50; // Consider PDF has text if more than 50 characters
      const pageCount = data.numpages || 1;
      
      console.log(`✅ PDF parsed: ${pageCount} pages, ${text.length} characters extracted`);
      
      return {
        text,
        hasText,
        pageCount
      };
    } catch (error: any) {
      console.error('❌ Error extracting text from PDF:', error.message);
      return { text: '', hasText: false, pageCount: 1 };
    }
  }

  // Remove the convertPDFToImages method since we don't have external tools
  // For OCR fallback, we'll use a different approach

  private async performOCRFallback(filePath: string): Promise<{ text: string; confidence: number; pageCount: number }> {
    console.log('⚠️ PDF text extraction insufficient, attempting OCR fallback...');
    
    // For now, return a placeholder since we can't convert PDF to images without external tools
    // In a production environment, you might want to use a different PDF-to-image library
    // or implement client-side PDF rendering
    
    try {
      // Read the PDF file to get basic info
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf(dataBuffer);
      
      return {
        text: `[OCR fallback not available - PDF contains ${data.numpages} pages but text extraction was insufficient. Consider using an image-based approach or installing PDF processing tools.]`,
        confidence: 0.1,
        pageCount: data.numpages || 1
      };
    } catch (error) {
      return {
        text: '[PDF processing failed - unable to extract text or perform OCR]',
        confidence: 0.0,
        pageCount: 1
      };
    }
  }

  private async enhanceVietnameseText(text: string): Promise<{ cleanedText: string; structuredData: any }> {
    try {
      const result = await vietnameseTextCleaner.cleanVietnameseText(text, 'PDF document');
      
      // Extract structured data based on common Vietnamese document patterns
      const structuredData = this.extractVietnameseStructuredData(result.cleanedText);

      return {
        cleanedText: result.cleanedText,
        structuredData
      };
    } catch (error) {
      console.error('Error enhancing Vietnamese text:', error);
      return {
        cleanedText: text,
        structuredData: null
      };
    }
  }

  private extractVietnameseStructuredData(text: string): any {
    const data: any = {};

    // Common Vietnamese document patterns
    const patterns = {
      // Identity card patterns
      hoTen: /(?:Họ và tên|Họ tên|Tên)[\s:]*([^\n]+)/i,
      ngaySinh: /(?:Ngày sinh|Sinh ngày)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
      queQuan: /(?:Quê quán|Nơi sinh)[\s:]*([^\n]+)/i,
      cccd: /(?:CCCD|CMND|Số)[\s:]*(\d{9,12})/i,
      
      // Address patterns
      diaChi: /(?:Địa chỉ|Thường trú|Tạm trú)[\s:]*([^\n]+)/i,
      
      // Date patterns
      ngayCapCCCD: /(?:Ngày cấp)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
      noiCap: /(?:Nơi cấp)[\s:]*([^\n]+)/i,
      
      // Phone and email
      soDienThoai: /(?:Điện thoại|SĐT|Phone)[\s:]*(\d{10,11})/i,
      email: /(?:Email|E-mail)[\s:]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      
      // Document specific
      soGiayTo: /(?:Số giấy tờ|Số văn bản)[\s:]*([^\n]+)/i,
      donVi: /(?:Đơn vị|Cơ quan)[\s:]*([^\n]+)/i
    };

    // Extract data using patterns
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match && match[1]) {
        data[key] = match[1].trim();
      }
    }

    // Clean up extracted data
    Object.keys(data).forEach(key => {
      if (data[key]) {
        data[key] = data[key]
          .replace(/[^\w\s\d@.\-\/áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
      }
    });

    return Object.keys(data).length > 0 ? data : null;
  }

  private async processWithFallback(buffer: Buffer, options?: ProcessOptions): Promise<ProcessedDocument> {
    const strategies = [
      () => this.processPDFWithParse(buffer, options),
      () => this.processPDFWithTesseract(buffer, options),
      () => this.processPDFAsImage(buffer, options)
    ];

    let lastError: Error | null = null;
    
    for (const [index, strategy] of strategies.entries()) {
      try {
        logger.info(`Attempting PDF processing strategy ${index + 1}`);
        const result = await strategy();
        
        if (result.confidence > 50) {
          logger.info(`Strategy ${index + 1} successful with confidence: ${result.confidence}`);
          return result;
        }
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Strategy ${index + 1} failed:`, error);
        continue;
      }
    }

    throw new Error(`All PDF processing strategies failed. Last error: ${lastError?.message}`);
  }

  private async processPDFAsImage(buffer: Buffer, options?: ProcessOptions): Promise<ProcessedDocument> {
    // Convert PDF pages to images and process with OCR
    const images = await this.convertPDFToImages(buffer);
    const results = await Promise.all(
      images.map(img => this.ocrProcessor.processImage(img))
    );

    return this.mergeOCRResults(results);
  }

  private async convertPDFToImages(buffer: Buffer): Promise<Buffer[]> {
    // Implementation for PDF to image conversion
    // This would use a library like pdf2pic or similar
    throw new Error('PDF to image conversion not implemented yet');
  }

  async processPDF(filePath: string): Promise<PDFProcessingResult> {
    console.log('🚀 Starting PDF processing for:', filePath);

    try {
      // Step 1: Try text extraction using pdf-parse
      const { text: extractedText, hasText, pageCount } = await this.extractTextFromPDF(filePath);
      
      if (hasText && extractedText.length > 100) {
        console.log('✅ PDF has extractable text, using direct text extraction');
        const { cleanedText, structuredData } = await this.enhanceVietnameseText(extractedText);
        
        return {
          extractedText: cleanedText,
          confidence: 0.95, // High confidence for direct text extraction
          structuredData,
          pageCount,
          processingMethod: 'text-extraction'
        };
      }

      console.log('⚠️ PDF requires OCR processing, but external tools not available');
      
      // Step 2: OCR fallback (limited without external tools)
      const { text: fallbackText, confidence, pageCount: fallbackPageCount } = await this.performOCRFallback(filePath);
      
      // Step 3: Enhance whatever text we could extract
      const { cleanedText, structuredData } = await this.enhanceVietnameseText(
        extractedText.length > fallbackText.length ? extractedText : fallbackText
      );

      return {
        extractedText: cleanedText,
        confidence: extractedText.length > 20 ? Math.max(0.6, confidence) : confidence,
        structuredData,
        pageCount: pageCount || fallbackPageCount,
        processingMethod: extractedText.length > 20 ? 'text-extraction' : 'ocr'
      };

    } catch (error) {
      console.error('❌ PDF processing failed:', error);
      throw new Error(`PDF processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static isSupportedFormat(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }
}

export const pdfProcessor = new PDFProcessor();