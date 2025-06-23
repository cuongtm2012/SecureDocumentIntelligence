/**
 * Python OCR Service Integration
 * Professional service layer for communicating with Python OCR microservice
 * 
 * This service provides both FastAPI and CLI communication methods with
 * comprehensive error handling, retry logic, and monitoring.
 * 
 * Author: SecureDocumentIntelligence Team
 * Date: 2025-01-21
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import FormData from 'form-data';
import axios, { AxiosResponse } from 'axios';

const execAsync = promisify(exec);

// Types
export interface OCRRequest {
  fileId: string;
  filePath: string;
  language?: string;
  confidenceThreshold?: number;
  psmMode?: number;
}

export interface OCRResult {
  success: boolean;
  fileId: string;
  text: string;
  confidence: number;
  pageCount: number;
  processingTime: number;
  metadata: {
    characterCount: number;
    wordCount: number;
    language: string;
    confidenceThreshold: number;
    processingTimestamp: string;
    fileSizeBytes: number;
    [key: string]: any;
  };
  error?: string;
}

export interface BatchOCRResult {
  jobId: string;
  status: 'processing' | 'completed' | 'failed';
  results: OCRResult[];
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  startTime: string;
  endTime?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'warning';
  service: string;
  timestamp: string;
  tesseractVersion?: string;
  availableLanguages?: string[];
  vietnameseSupport?: boolean;
  error?: string;
}

export class PythonOCRService {
  private readonly pythonServiceUrl: string;
  private readonly pythonServicePort: number;
  private readonly cliScriptPath: string;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly requestTimeout: number;
  
  constructor() {
    this.pythonServiceUrl = process.env.PYTHON_OCR_SERVICE_URL || 'http://localhost:8001';
    this.pythonServicePort = parseInt(process.env.PYTHON_OCR_SERVICE_PORT || '8001');
    this.cliScriptPath = path.join(process.cwd(), 'python-ocr-service', 'cli.py');
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    this.requestTimeout = 300000; // 5 minutes for OCR processing
  }

  /**
   * Process PDF document using Python OCR script
   * Supports both API and command-line modes
   */
  async processDocument(filePath: string, options: OCROptions = {}): Promise<OCRResult> {
    try {
      // Validate input file exists
      await fs.access(filePath);
      
      if (this.useAPI) {
        return await this.processViaAPI(filePath, options);
      } else {
        return await this.processViaCommandLine(filePath, options);
      }
    } catch (error) {
      console.error('OCR processing error:', error);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  /**
   * Process document via REST API (recommended for production)
   */
  private async processViaAPI(filePath: string, options: OCROptions): Promise<OCRResult> {
    try {
      const formData = new FormData();
      formData.append('file', await fs.readFile(filePath), {
        filename: path.basename(filePath),
        contentType: 'application/pdf'
      });
      formData.append('language', options.language || 'vie');
      formData.append('confidence_threshold', (options.confidence_threshold || 0.7).toString());
      formData.append('preprocess', (options.preprocess || true).toString());
      formData.append('dpi', (options.dpi || 300).toString());

      const response = await axios.post(
        `${this.serviceUrl}/process-pdf`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${process.env.OCR_SERVICE_TOKEN || 'default-token'}`
          },
          timeout: 300000, // 5 minutes timeout for large files
          maxContentLength: 100 * 1024 * 1024, // 100MB max
        }
      );

      return response.data;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Python OCR service is not available. Please start the service.');
      }
      throw new Error(`API request failed: ${error.message}`);
    }
  }

  /**
   * Process document via command line (fallback method)
   */
  private async processViaCommandLine(filePath: string, options: OCROptions): Promise<OCRResult> {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(path.dirname(filePath), `ocr_result_${Date.now()}.json`);
      
      const args = [
        this.scriptPath,
        '--input', filePath,
        '--output', outputPath,
        '--language', options.language || 'vie',
        '--confidence', (options.confidence_threshold || 0.7).toString(),
        '--format', 'json'
      ];

      if (options.preprocess) {
        args.push('--preprocess');
      }

      if (options.dpi) {
        args.push('--dpi', options.dpi.toString());
      }

      console.log(`Executing Python OCR: ${this.pythonPath} ${args.join(' ')}`);

      const pythonProcess: ChildProcess = spawn(this.pythonPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
        console.log('OCR Progress:', data.toString().trim());
      });

      pythonProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
        console.error('OCR Error:', data.toString().trim());
      });

      pythonProcess.on('close', async (code) => {
        try {
          if (code === 0) {
            // Read the result file
            const resultData = await fs.readFile(outputPath, 'utf-8');
            const result = JSON.parse(resultData);
            
            // Clean up temporary file
            await fs.unlink(outputPath).catch(() => {});
            
            resolve(result);
          } else {
            reject(new Error(`Python OCR process failed with code ${code}: ${stderr}`));
          }
        } catch (error) {
          reject(new Error(`Failed to read OCR result: ${error.message}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python OCR process: ${error.message}`));
      });

      // Set timeout for long-running processes
      const timeout = setTimeout(() => {
        pythonProcess.kill('SIGTERM');
        reject(new Error('OCR process timed out after 5 minutes'));
      }, 300000);

      pythonProcess.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  /**
   * Health check for Python OCR service
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    const results = {
      status: 'unknown',
      details: {
        api_available: false,
        python_executable: false,
        script_exists: false,
        tesseract_available: false
      }
    };

    try {
      // Check if API is available
      if (this.useAPI) {
        try {
          const response = await axios.get(`${this.serviceUrl}/health`, { timeout: 5000 });
          results.details.api_available = response.status === 200;
        } catch {
          results.details.api_available = false;
        }
      }

      // Check Python executable
      try {
        await new Promise((resolve, reject) => {
          const pythonCheck = spawn(this.pythonPath, ['--version']);
          pythonCheck.on('close', (code) => {
            code === 0 ? resolve(true) : reject(false);
          });
        });
        results.details.python_executable = true;
      } catch {
        results.details.python_executable = false;
      }

      // Check if script exists
      try {
        await fs.access(this.scriptPath);
        results.details.script_exists = true;
      } catch {
        results.details.script_exists = false;
      }

      // Check Tesseract (via Python)
      try {
        await new Promise((resolve, reject) => {
          const tesseractCheck = spawn(this.pythonPath, ['-c', 'import pytesseract; print("OK")']);
          tesseractCheck.on('close', (code) => {
            code === 0 ? resolve(true) : reject(false);
          });
        });
        results.details.tesseract_available = true;
      } catch {
        results.details.tesseract_available = false;
      }

      // Determine overall status
      if (this.useAPI && results.details.api_available) {
        results.status = 'healthy';
      } else if (!this.useAPI && 
                 results.details.python_executable && 
                 results.details.script_exists && 
                 results.details.tesseract_available) {
        results.status = 'healthy';
      } else {
        results.status = 'unhealthy';
      }

    } catch (error) {
      results.status = 'error';
      results.details.error = error.message;
    }

    return results;
  }

  /**
   * Get service configuration
   */
  getConfig() {
    return {
      pythonPath: this.pythonPath,
      scriptPath: this.scriptPath,
      serviceUrl: this.serviceUrl,
      useAPI: this.useAPI,
      environment: process.env.NODE_ENV || 'development'
    };
  }
}

// Export singleton instance
export const pythonOCRService = new PythonOCRService();
