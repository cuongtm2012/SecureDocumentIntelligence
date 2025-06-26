import { createWorker } from 'tesseract.js';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import { vietnameseTextCleaner } from './vietnamese-text-cleaner';

export interface EnhancedOCRResult {
  extractedText: string;
  confidence: number;
  structuredData: any;
  processingTime: number;
  improvements: string[];
}

export class EnhancedVietnameseOCR {
  async processDocument(filePath: string, documentType: string = 'government document'): Promise<EnhancedOCRResult> {
    const startTime = Date.now();
    console.log(`Starting enhanced Vietnamese OCR processing for: ${filePath}`);

    try {
      // Enhanced image preprocessing for Vietnamese text
      const processedImageBuffer = await this.preprocessImageForVietnamese(filePath);
      
      // Perform OCR with Vietnamese language optimization
      const ocrResult = await this.performEnhancedVietnameseOCR(processedImageBuffer);
      
      // Apply Vietnamese-specific text cleaning and correction
      const cleaningResult = await vietnameseTextCleaner.cleanVietnameseText(ocrResult.text, documentType);
      
      // Extract structured data with Vietnamese context
      const structuredData = this.extractVietnameseStructuredData(cleaningResult.cleanedText);
      
      const processingTime = Date.now() - startTime;
      
      return {
        extractedText: cleaningResult.cleanedText,
        confidence: ocrResult.confidence,
        structuredData: { ...structuredData, ...cleaningResult.structuredData },
        processingTime,
        improvements: cleaningResult.improvements || []
      };
      
    } catch (error: any) {
      console.error('Enhanced Vietnamese OCR failed:', error.message);
      throw new Error(`Vietnamese OCR processing failed: ${error.message}`);
    }
  }

  private async preprocessImageForVietnamese(filePath: string): Promise<Buffer> {
    console.log('Applying Vietnamese-optimized image preprocessing...');
    
    return await sharp(filePath)
      // Resize for optimal OCR (minimum 300 DPI equivalent)
      .resize({ width: 2400, withoutEnlargement: true })
      // Auto-rotate based on EXIF data
      .rotate()
      // Convert to grayscale for better text recognition
      .greyscale()
      // Normalize contrast to improve text clarity
      .normalize()
      // Apply Gaussian blur to reduce noise before sharpening
      .blur(0.3)
      // Enhanced sharpening specifically tuned for Vietnamese characters
      .sharpen({ sigma: 1.2, m1: 0.7, m2: 2.5 })
      // Adjust gamma for better contrast on Vietnamese diacritics
      .gamma(1.2)
      // Apply slight morphological operations through threshold
      .threshold(120)
      // Final enhancement
      .png({ quality: 100, compressionLevel: 0 })
      .toBuffer();
  }

  private async performEnhancedVietnameseOCR(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
    console.log('Performing enhanced Vietnamese OCR...');
    
    const worker = await createWorker(['vie', 'eng'], 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`Vietnamese OCR: ${Math.round(m.progress * 100)}%`);
        }
      }
    });

    try {
      // Configure Tesseract for optimal Vietnamese text recognition
      await worker.setParameters({
        tessedit_pageseg_mode: 1 as any, // Automatic page segmentation
        tessedit_ocr_engine_mode: 1 as any, // LSTM neural network
        preserve_interword_spaces: 1 as any, // Important for Vietnamese spacing
        user_defined_dpi: 300 as any,
        tessedit_char_whitelist: '' as any, // Allow all Unicode characters
        // Vietnamese-specific optimizations
        load_system_dawg: 0 as any, // Disable English word dictionary
        load_freq_dawg: 0 as any, // Disable frequency-based word dictionary
        load_unambig_dawg: 0 as any, // Disable unambiguous word dictionary
        load_punc_dawg: 0 as any, // Disable punctuation dictionary
        load_number_dawg: 0 as any, // Disable number dictionary
        load_bigram_dawg: 0 as any, // Disable bigram dictionary
        // Improve Vietnamese diacritic recognition
        textord_heavy_nr: 1 as any,
        textord_debug_tabfind: 0 as any,
        classify_enable_learning: 1 as any,
        classify_enable_adaptive_matcher: 1 as any
      });

      const { data: { text, confidence } } = await worker.recognize(imageBuffer);
      
      return {
        text: text || '',
        confidence: confidence / 100 // Convert to 0-1 scale
      };
      
    } finally {
      await worker.terminate();
    }
  }

  private extractVietnameseStructuredData(text: string): any {
    const data: any = {};

    // Enhanced Vietnamese document patterns with better regex
    const patterns = {
      // Personal information
      hoVaTen: /(?:Họ\s+và\s+tên|Họ\s+tên|Tên)[\s:]*([^\n\r]+)/i,
      ngaySinh: /(?:Ngày\s+sinh|Sinh\s+ngày)[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      gioiTinh: /(?:Giới\s+tính)[\s:]*([^\n\r]+)/i,
      quocTich: /(?:Quốc\s+tịch)[\s:]*([^\n\r]+)/i,
      danToc: /(?:Dân\s+tộc)[\s:]*([^\n\r]+)/i,
      tonGiao: /(?:Tôn\s+giáo)[\s:]*([^\n\r]+)/i,
      
      // Address information
      queQuan: /(?:Quê\s+quán|Nơi\s+sinh)[\s:]*([^\n\r]+)/i,
      thuongTru: /(?:Thường\s+trú|Nơi\s+thường\s+trú)[\s:]*([^\n\r]+)/i,
      diaChi: /(?:Địa\s+chỉ|Chỗ\s+ở\s+hiện\s+tại)[\s:]*([^\n\r]+)/i,
      
      // ID information
      soCCCD: /(?:Số\s+CCCD|Số\s+căn\s+cước|CCCD|Số)[\s:]*(\d{12})/i,
      soCMND: /(?:Số\s+CMND|CMND)[\s:]*(\d{9})/i,
      
      // Document dates
      ngayCap: /(?:Ngày\s+cấp)[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      noiCap: /(?:Nơi\s+cấp)[\s:]*([^\n\r]+)/i,
      giaTriDen: /(?:Có\s+giá\s+trị\s+đến|Giá\s+trị\s+đến)[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
      
      // Contact information
      dienThoai: /(?:Điện\s+thoại|SĐT|Phone|Tel)[\s:]*(\d{10,11})/i,
      email: /(?:Email|E-mail)[\s:]*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      
      // Professional information
      ngheNghiep: /(?:Nghề\s+nghiệp|Công\s+việc)[\s:]*([^\n\r]+)/i,
      noiLamViec: /(?:Nơi\s+làm\s+việc|Cơ\s+quan)[\s:]*([^\n\r]+)/i,
      chucVu: /(?:Chức\s+vụ|Vai\s+trò)[\s:]*([^\n\r]+)/i,
      
      // Administrative divisions
      tinhThanh: /(?:Tỉnh|Thành\s+phố)[\s:]*([\w\s]+?)(?:\n|$|,)/i,
      quanHuyen: /(?:Quận|Huyện|Thị\s+xã)[\s:]*([\w\s]+?)(?:\n|$|,)/i,
      xaPhuong: /(?:Xã|Phường|Thị\s+trấn)[\s:]*([\w\s]+?)(?:\n|$|,)/i
    };

    // Extract data using enhanced patterns
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match && match[1]) {
        let value = match[1].trim();
        
        // Clean extracted value
        value = value
          .replace(/[^\w\s\d@.\-\/áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđĐÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ]/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (value.length > 0) {
          data[key] = value;
        }
      }
    }

    // Post-process and validate extracted data
    if (data.hoVaTen) {
      data.hoVaTen = this.normalizeVietnameseName(data.hoVaTen);
    }
    
    if (data.ngaySinh) {
      data.ngaySinh = this.normalizeDateFormat(data.ngaySinh);
    }
    
    if (data.ngayCap) {
      data.ngayCap = this.normalizeDateFormat(data.ngayCap);
    }

    return Object.keys(data).length > 0 ? data : null;
  }

  private normalizeVietnameseName(name: string): string {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
      .trim();
  }

  private normalizeDateFormat(dateStr: string): string {
    // Convert various date formats to DD/MM/YYYY
    const dateMatch = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
    if (dateMatch) {
      const [, day, month, year] = dateMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${fullYear}`;
    }
    return dateStr;
  }

  private async validateAndCorrectOCRText(text: string, confidence: number): Promise<{ correctedText: string; finalConfidence: number }> {
    let correctedText = text;
    let finalConfidence = confidence;

    // Vietnamese diacritic correction patterns
    const diacriticCorrections: Record<string, string> = {
      'à': 'à', 'á': 'á', 'ạ': 'ạ', 'ả': 'ả', 'ã': 'ã',
      'ầ': 'ầ', 'ấ': 'ấ', 'ậ': 'ậ', 'ẩ': 'ẩ', 'ẫ': 'ẫ',
      'è': 'è', 'é': 'é', 'ẹ': 'ẹ', 'ẻ': 'ẻ', 'ẽ': 'ẽ',
      'ì': 'ì', 'í': 'í', 'ị': 'ị', 'ỉ': 'ỉ', 'ĩ': 'ĩ',
      'ò': 'ò', 'ó': 'ó', 'ọ': 'ọ', 'ỏ': 'ỏ', 'õ': 'õ',
      'ù': 'ù', 'ú': 'ú', 'ụ': 'ụ', 'ủ': 'ủ', 'ũ': 'ũ',
      'ỳ': 'ỳ', 'ý': 'ý', 'ỵ': 'ỵ', 'ỷ': 'ỷ', 'ỹ': 'ỹ'
    };

    // Common OCR misreads for Vietnamese
    const commonMisreads: Record<string, string> = {
      '0': 'O', '1': 'l', '5': 'S', '8': 'B',
      'rn': 'm', 'cl': 'd', 'ii': 'ú', 'oo': 'ô'
    };

    // Apply corrections
    for (const [wrong, correct] of Object.entries(commonMisreads)) {
      correctedText = correctedText.replace(new RegExp(wrong, 'g'), correct);
    }

    // Validate Vietnamese document structure
    const hasValidVietnameseStructure = this.validateVietnameseDocumentStructure(correctedText);
    if (hasValidVietnameseStructure) {
      finalConfidence = Math.min(finalConfidence + 10, 100);
    }

    return { correctedText, finalConfidence };
  }

  private validateVietnameseDocumentStructure(text: string): boolean {
    const requiredFields = [
      /(?:họ|tên|cccd|cmnd|ngày\s*sinh|địa\s*chỉ)/i,
      /\d{9,12}/, // ID numbers
      /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/ // Dates
    ];

    return requiredFields.every(pattern => pattern.test(text));
  }

  static isSupportedImageFormat(mimeType: string): boolean {
    return ['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType);
  }
}

export const enhancedVietnameseOCR = new EnhancedVietnameseOCR();