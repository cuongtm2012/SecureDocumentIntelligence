
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import { enhancedTesseractProcessor } from "./enhanced-tesseract-processor";

export interface VietCardOCRResult {
  success: boolean;
  extractedData: {
    id?: string;
    name?: string;
    date_of_birth?: string;
    sex?: string;
    nationality?: string;
    place_of_origin?: string;
    place_of_residence?: string;
    personal_identification?: string;
    date_of_issue?: string;
    date_of_expiry?: string;
    [key: string]: any;
  };
  confidence: number;
  processingTime: number;
  processingMethod: string;
  rawText?: string;
  error?: string;
}

export class VietCardOCRProcessor {
  private pythonScriptPath: string;

  constructor() {
    this.pythonScriptPath = path.join(process.cwd(), 'python-vietcard-service', 'vietcard_processor.py');
  }

  async processIDCard(filePath: string): Promise<VietCardOCRResult> {
    const startTime = Date.now();
    
    console.log(`🪪 Processing Vietnamese ID card: ${path.basename(filePath)}`);
    
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Try VietCardOCR first, fallback to enhanced Tesseract if not available
      let result;
      try {
        result = await this.callVietCardOCR(filePath);
        
        if (result.success) {
          console.log(`✅ VietCardOCR completed: ${Object.keys(result.extractedData).length} fields extracted`);
          
          return {
            success: true,
            extractedData: result.extractedData,
            confidence: result.confidence || 85,
            processingTime: Date.now() - startTime,
            processingMethod: 'vietcard-ocr',
            rawText: result.rawText
          };
        }
      } catch (vietCardError: any) {
        console.log(`⚠️ VietCardOCR not available: ${vietCardError.message}`);
        console.log(`🔄 Falling back to enhanced Tesseract OCR for ID card processing`);
        
        // Fallback to enhanced Tesseract OCR with ID card-specific processing
        result = await this.processWithTesseractFallback(filePath);
      }
      
      const processingTime = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ ID card processing completed: ${Object.keys(result.extractedData).length} fields extracted`);
        
        return {
          success: true,
          extractedData: result.extractedData,
          confidence: result.confidence || 75,
          processingTime,
          processingMethod: result.processingMethod || 'tesseract-fallback',
          rawText: result.rawText
        };
      } else {
        throw new Error(result.error || 'ID card processing failed');
      }
      
    } catch (error: any) {
      console.error('❌ ID card processing error:', error);
      
      return {
        success: false,
        extractedData: {},
        confidence: 0,
        processingTime: Date.now() - startTime,
        processingMethod: 'id-card-error',
        error: error.message
      };
    }
  }

  private async callVietCardOCR(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', [this.pythonScriptPath, filePath], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (parseError) {
            reject(new Error(`Failed to parse VietCardOCR output: ${parseError.message}`));
          }
        } else {
          reject(new Error(`VietCardOCR process failed with code ${code}: ${stderr}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start VietCardOCR process: ${error.message}`));
      });

      // Set timeout
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('VietCardOCR process timed out'));
      }, 30000); // 30 seconds timeout
    });
  }

  private async processWithTesseractFallback(filePath: string): Promise<any> {
    try {
      console.log(`🔄 Using Enhanced Tesseract OCR for ID card processing`);
      
      // Use the enhanced Tesseract processor
      const result = await enhancedTesseractProcessor.processDocument(filePath);
      
      if (result.success && result.extractedText) {
        // Parse the extracted text for Vietnamese ID card fields
        const extractedData = this.parseVietnameseIDCardText(result.extractedText);
        
        return {
          success: true,
          extractedData,
          confidence: Math.max(60, result.confidence || 70), // Ensure minimum confidence for ID cards
          rawText: result.extractedText,
          processingMethod: 'enhanced-tesseract-fallback'
        };
      } else {
        return {
          success: false,
          error: 'Tesseract fallback failed to extract text',
          extractedData: {},
          confidence: 0,
          processingMethod: 'tesseract-fallback-failed'
        };
      }
    } catch (error: any) {
      console.error('Tesseract fallback error:', error);
      return {
        success: false,
        error: `Tesseract fallback failed: ${error.message}`,
        extractedData: {},
        confidence: 0,
        processingMethod: 'tesseract-fallback-error'
      };
    }
  }

  private parseVietnameseIDCardText(text: string): any {
    const extractedData: any = {};
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Vietnamese ID card field patterns
    const patterns = {
      id: [/số:\s*(\d+)/i, /id:\s*(\d+)/i, /cmnd:\s*(\d+)/i, /cccd:\s*(\d+)/i],
      name: [/họ và tên:\s*(.+)/i, /name:\s*(.+)/i, /tên:\s*(.+)/i],
      date_of_birth: [/ngày sinh:\s*(.+)/i, /date of birth:\s*(.+)/i, /sinh:\s*(.+)/i],
      sex: [/giới tính:\s*(.+)/i, /sex:\s*(.+)/i, /giới:\s*(.+)/i],
      nationality: [/quốc tịch:\s*(.+)/i, /nationality:\s*(.+)/i],
      place_of_origin: [/quê quán:\s*(.+)/i, /place of origin:\s*(.+)/i, /quê:\s*(.+)/i],
      place_of_residence: [/nơi thường trú:\s*(.+)/i, /place of residence:\s*(.+)/i, /thường trú:\s*(.+)/i],
      date_of_issue: [/ngày cấp:\s*(.+)/i, /date of issue:\s*(.+)/i, /cấp:\s*(.+)/i],
      date_of_expiry: [/có giá trị đến:\s*(.+)/i, /date of expiry:\s*(.+)/i, /giá trị:\s*(.+)/i]
    };
    
    // Try to extract each field
    for (const [fieldName, fieldPatterns] of Object.entries(patterns)) {
      for (const pattern of fieldPatterns) {
        for (const line of lines) {
          const match = line.match(pattern);
          if (match && match[1] && match[1].trim()) {
            extractedData[fieldName] = match[1].trim();
            break;
          }
        }
        if (extractedData[fieldName]) break;
      }
    }
    
    // If no structured data found, try simple heuristics
    if (Object.keys(extractedData).length === 0) {
      console.log('🔍 No structured fields found, applying heuristics...');
      
      // Look for numeric patterns that might be ID numbers
      for (const line of lines) {
        if (/^\d{9,12}$/.test(line.replace(/\s/g, ''))) {
          extractedData.id = line.replace(/\s/g, '');
          break;
        }
      }
      
      // Look for name patterns (Vietnamese names typically have 2-4 words)
      for (const line of lines) {
        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 4 && /^[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÛÜ]/.test(line)) {
          if (!line.match(/\d/) && line.length > 5) {
            extractedData.name = line;
            break;
          }
        }
      }
      
      // Look for date patterns
      for (const line of lines) {
        if (/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/.test(line)) {
          if (!extractedData.date_of_birth) {
            extractedData.date_of_birth = line;
          } else if (!extractedData.date_of_issue) {
            extractedData.date_of_issue = line;
          }
        }
      }
    }
    
    console.log(`📋 Extracted ${Object.keys(extractedData).length} fields from ID card text`);
    return extractedData;
  }

  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      // Check if Python script exists
      await fs.access(this.pythonScriptPath);
      
      // Test VietCardOCR availability
      const testResult = await new Promise((resolve) => {
        const testProcess = spawn('python', ['-c', 'import vietcardocr; print("OK")']);
        testProcess.on('close', (code) => {
          resolve(code === 0);
        });
        testProcess.on('error', () => resolve(false));
      });

      return {
        status: testResult ? 'healthy' : 'unhealthy',
        details: {
          script_exists: true,
          vietcardocr_available: testResult,
          python_available: true
        }
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          script_exists: false,
          vietcardocr_available: false,
          python_available: false,
          error: error.message
        }
      };
    }
  }
}

export const vietCardOCRProcessor = new VietCardOCRProcessor();
