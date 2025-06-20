import { promises as fs } from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import { vietnameseTextCleaner } from './vietnamese-text-cleaner';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PDFProcessingResult {
  extractedText: string;
  confidence: number;
  structuredData: any;
  pageCount: number;
  processingMethod: 'text-extraction' | 'ocr' | 'hybrid';
}

export class PDFProcessor {
  private async extractTextFromPDF(filePath: string): Promise<{ text: string; hasText: boolean }> {
    try {
      // Use pdftotext command-line tool for reliable text extraction
      const { stdout } = await execAsync(`pdftotext "${filePath}" -`);
      
      const text = stdout.trim();
      const hasText = text.length > 50; // Consider PDF has text if more than 50 characters
      
      return {
        text,
        hasText
      };
    } catch (error: any) {
      console.error('Error extracting text from PDF:', error.message);
      return { text: '', hasText: false };
    }
  }

  private async convertPDFToImages(filePath: string): Promise<string[]> {
    try {
      const outputDir = path.dirname(filePath);
      const basename = path.basename(filePath, '.pdf');
      const outputPattern = path.join(outputDir, `${basename}-page-%d.png`);
      
      // Use pdftoppm to convert PDF to high-quality images
      await execAsync(`pdftoppm -png -r 300 "${filePath}" "${path.join(outputDir, `${basename}-page`)}"`);
      
      // Find all generated image files
      const files = await fs.readdir(outputDir);
      const imageFiles = files
        .filter(file => file.startsWith(`${basename}-page`) && file.endsWith('.png'))
        .map(file => path.join(outputDir, file))
        .sort();
      
      return imageFiles;
    } catch (error: any) {
      console.error('Error converting PDF to images:', error.message);
      throw new Error(`PDF conversion failed: ${error.message}`);
    }
  }

  private async performOCROnImages(imagePaths: string[]): Promise<{ text: string; confidence: number }> {
    let combinedText = '';
    let totalConfidence = 0;
    let pageCount = 0;

    for (const imagePath of imagePaths) {
      try {
        const worker = await createWorker(['vie', 'eng'], 1, {
          logger: m => console.log(`Tesseract page ${pageCount + 1}:`, m.status, m.progress)
        });

        // Enhanced OCR parameters for Vietnamese
        await worker.setParameters({
          tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
          tessedit_ocr_engine_mode: '1', // Neural nets LSTM engine only
          preserve_interword_spaces: '1',
          user_defined_dpi: '300'
        });

        const { data: { text, confidence } } = await worker.recognize(imagePath);
        await worker.terminate();

        if (text.trim()) {
          combinedText += `\n--- Page ${pageCount + 1} ---\n${text.trim()}\n`;
          totalConfidence += confidence;
          pageCount++;
        }

        // Clean up temporary image
        await fs.unlink(imagePath).catch(() => {});
      } catch (error: any) {
        console.error(`Error processing page ${pageCount + 1}:`, error.message);
      }
    }

    const averageConfidence = pageCount > 0 ? totalConfidence / pageCount : 0;
    return {
      text: combinedText.trim(),
      confidence: averageConfidence / 100 // Convert to 0-1 scale
    };
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

  async processPDF(filePath: string): Promise<PDFProcessingResult> {
    console.log('Starting PDF processing for:', filePath);

    try {
      // Step 1: Try text extraction first
      const { text: extractedText, hasText } = await this.extractTextFromPDF(filePath);
      
      if (hasText && extractedText.length > 100) {
        console.log('PDF has extractable text, using text extraction method');
        const { cleanedText, structuredData } = await this.enhanceVietnameseText(extractedText);
        
        return {
          extractedText: cleanedText,
          confidence: 0.95, // High confidence for direct text extraction
          structuredData,
          pageCount: 1,
          processingMethod: 'text-extraction'
        };
      }

      console.log('PDF requires OCR processing, converting to images...');
      
      // Step 2: Convert PDF to images for OCR
      const imagePaths = await this.convertPDFToImages(filePath);
      
      if (imagePaths.length === 0) {
        throw new Error('Failed to convert PDF pages to images');
      }

      console.log(`Processing ${imagePaths.length} pages with OCR...`);
      
      // Step 3: Perform OCR on images
      const { text: ocrText, confidence } = await this.performOCROnImages(imagePaths);
      
      if (!ocrText.trim()) {
        throw new Error('No text could be extracted from PDF');
      }

      // Step 4: Enhance Vietnamese text
      const { cleanedText, structuredData } = await this.enhanceVietnameseText(ocrText);

      // Step 5: Hybrid approach - combine if we had some text extraction
      let finalText = cleanedText;
      let finalConfidence = confidence;
      let processingMethod: 'text-extraction' | 'ocr' | 'hybrid' = 'ocr';

      if (extractedText.length > 20) {
        // Combine both methods for better results
        finalText = `${extractedText}\n\n--- OCR Enhancement ---\n${cleanedText}`;
        finalConfidence = Math.max(0.8, confidence); // Boost confidence for hybrid
        processingMethod = 'hybrid';
      }

      return {
        extractedText: finalText,
        confidence: finalConfidence,
        structuredData,
        pageCount: imagePaths.length,
        processingMethod
      };

    } catch (error) {
      console.error('PDF processing failed:', error);
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  static isSupportedFormat(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }
}

export const pdfProcessor = new PDFProcessor();