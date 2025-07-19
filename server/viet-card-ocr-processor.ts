
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

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
      
      // Call Python VietCardOCR processor
      const result = await this.callVietCardOCR(filePath);
      
      const processingTime = Date.now() - startTime;
      
      if (result.success) {
        console.log(`✅ VietCardOCR completed: ${Object.keys(result.extractedData).length} fields extracted`);
        
        return {
          success: true,
          extractedData: result.extractedData,
          confidence: result.confidence || 85,
          processingTime,
          processingMethod: 'vietcard-ocr',
          rawText: result.rawText
        };
      } else {
        throw new Error(result.error || 'VietCardOCR processing failed');
      }
      
    } catch (error: any) {
      console.error('❌ VietCardOCR processing error:', error);
      
      return {
        success: false,
        extractedData: {},
        confidence: 0,
        processingTime: Date.now() - startTime,
        processingMethod: 'vietcard-ocr-error',
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
