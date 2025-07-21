
/**
 * ABBYY OCR Processor
 * Professional OCR processing using ABBYY FineReader Engine
 * 
 * Features:
 * - Superior OCR accuracy compared to Tesseract
 * - Advanced document layout analysis
 * - Multi-language support including Vietnamese
 * - PDF and image processing
 * - Structured data extraction
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import sharp from 'sharp';

export interface ABBYYOCRResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingMethod: string;
  processingTime: number;
  structuredData?: {
    blocks: Array<{
      text: string;
      confidence: number;
      coordinates: { x: number; y: number; width: number; height: number };
      type: 'text' | 'table' | 'image';
    }>;
    tables?: Array<{
      rows: string[][];
      confidence: number;
    }>;
    metadata: {
      language: string;
      orientation: number;
      skew: number;
    };
  };
}

export interface ABBYYConfig {
  enginePath?: string;
  licenseFile?: string;
  languages: string[];
  outputFormat: 'txt' | 'pdf' | 'docx' | 'xlsx' | 'xml';
  processingParams: {
    imageResolution: number;
    colorMode: 'auto' | 'color' | 'grayscale' | 'bw';
    preprocessingLevel: 'none' | 'light' | 'medium' | 'aggressive';
    recognitionQuality: 'fast' | 'balanced' | 'thorough';
  };
}

export class ABBYYOCRProcessor {
  private config: ABBYYConfig;
  private tempDir: string;

  constructor(config?: Partial<ABBYYConfig>) {
    this.config = {
      enginePath: process.env.ABBYY_ENGINE_PATH || '/opt/ABBYY/FineReaderEngine12/Bin',
      licenseFile: process.env.ABBYY_LICENSE_FILE || '/opt/ABBYY/FineReaderEngine12/License/license.xml',
      languages: ['Vietnamese', 'English'],
      outputFormat: 'txt',
      processingParams: {
        imageResolution: 300,
        colorMode: 'auto',
        preprocessingLevel: 'medium',
        recognitionQuality: 'thorough'
      },
      ...config
    };
    this.tempDir = '/tmp/abbyy_ocr';
  }

  async processDocument(filePath: string): Promise<ABBYYOCRResult> {
    const startTime = Date.now();
    
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Get file extension
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.pdf') {
        return await this.processPDF(filePath, startTime);
      } else if (['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp'].includes(ext)) {
        return await this.processImage(filePath, startTime);
      } else {
        throw new Error(`Unsupported file type: ${ext}`);
      }
    } catch (error: any) {
      console.error('ABBYY OCR processing error:', error);
      throw error;
    }
  }

  private async processPDF(filePath: string, startTime: number): Promise<ABBYYOCRResult> {
    console.log(`📄 Processing PDF with ABBYY FineReader: ${path.basename(filePath)}`);
    
    try {
      // Create temporary directory
      await fs.mkdir(this.tempDir, { recursive: true });
      
      const outputBaseName = `abbyy_output_${Date.now()}`;
      const outputPath = path.join(this.tempDir, outputBaseName);
      
      // Process with ABBYY FineReader Engine
      const result = await this.runABBYYEngine(filePath, outputPath, 'pdf');
      
      // Clean up temporary files
      await this.cleanupTempFiles(outputPath);
      
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ ABBYY PDF OCR completed: ${result.pageCount} pages, ${result.confidence.toFixed(1)}% confidence`);
      
      return {
        ...result,
        processingMethod: 'abbyy-finereader-pdf',
        processingTime
      };
      
    } catch (error: any) {
      console.error('ABBYY PDF processing error:', error);
      throw new Error(`ABBYY PDF OCR failed: ${error.message}`);
    }
  }

  private async processImage(filePath: string, startTime: number): Promise<ABBYYOCRResult> {
    console.log(`🔍 Processing image with ABBYY FineReader: ${path.basename(filePath)}`);
    
    try {
      // Preprocess image if needed
      const processedImagePath = await this.preprocessImage(filePath);
      
      // Create temporary directory
      await fs.mkdir(this.tempDir, { recursive: true });
      
      const outputBaseName = `abbyy_output_${Date.now()}`;
      const outputPath = path.join(this.tempDir, outputBaseName);
      
      // Process with ABBYY FineReader Engine
      const result = await this.runABBYYEngine(processedImagePath, outputPath, 'image');
      
      // Clean up temporary files
      await this.cleanupTempFiles(outputPath);
      if (processedImagePath !== filePath) {
        await fs.unlink(processedImagePath).catch(() => {});
      }
      
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ ABBYY Image OCR completed: ${result.confidence.toFixed(1)}% confidence`);
      
      return {
        ...result,
        processingMethod: 'abbyy-finereader-image',
        processingTime
      };
      
    } catch (error: any) {
      console.error('ABBYY image processing error:', error);
      throw new Error(`ABBYY Image OCR failed: ${error.message}`);
    }
  }

  private async preprocessImage(filePath: string): Promise<string> {
    try {
      const processedPath = path.join(this.tempDir, `preprocessed_${Date.now()}.png`);
      
      await fs.mkdir(path.dirname(processedPath), { recursive: true });
      
      // Apply image preprocessing based on configuration
      let sharpInstance = sharp(filePath);
      
      // Apply DPI enhancement
      if (this.config.processingParams.imageResolution > 150) {
        sharpInstance = sharpInstance.resize(null, null, {
          kernel: sharp.kernel.lanczos3
        });
      }
      
      // Apply color mode
      switch (this.config.processingParams.colorMode) {
        case 'grayscale':
          sharpInstance = sharpInstance.grayscale();
          break;
        case 'bw':
          sharpInstance = sharpInstance.grayscale().threshold(128);
          break;
      }
      
      // Apply preprocessing level
      switch (this.config.processingParams.preprocessingLevel) {
        case 'light':
          sharpInstance = sharpInstance.normalize();
          break;
        case 'medium':
          sharpInstance = sharpInstance.normalize().sharpen({ sigma: 1 });
          break;
        case 'aggressive':
          sharpInstance = sharpInstance.normalize().sharpen({ sigma: 2 }).linear(1.2, -10);
          break;
      }
      
      await sharpInstance.png({ quality: 100 }).toFile(processedPath);
      
      return processedPath;
    } catch (error) {
      console.warn('Image preprocessing failed, using original:', error);
      return filePath;
    }
  }

  private async runABBYYEngine(inputPath: string, outputPath: string, inputType: 'pdf' | 'image'): Promise<Omit<ABBYYOCRResult, 'processingMethod' | 'processingTime'>> {
    return new Promise((resolve, reject) => {
      // ABBYY FineReader Engine command line interface
      const abbyyExecutable = path.join(this.config.enginePath!, 'FREngine12');
      
      const args = [
        '--input', inputPath,
        '--output', `${outputPath}.txt`,
        '--xml-output', `${outputPath}.xml`, // For structured data
        '--languages', this.config.languages.join(','),
        '--recognition-quality', this.config.processingParams.recognitionQuality,
        '--preprocessing', this.config.processingParams.preprocessingLevel,
        '--license', this.config.licenseFile!,
        '--format', this.config.outputFormat
      ];
      
      if (inputType === 'image') {
        args.push('--image-resolution', this.config.processingParams.imageResolution.toString());
        args.push('--color-mode', this.config.processingParams.colorMode);
      }
      
      console.log(`🔄 Running ABBYY FineReader: ${abbyyExecutable} ${args.join(' ')}`);
      
      const process = spawn(abbyyExecutable, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log('ABBYY Progress:', data.toString().trim());
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      const timeout = setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error('ABBYY processing timeout (10 minutes limit)'));
      }, 600000); // 10 minutes timeout
      
      process.on('close', async (code) => {
        clearTimeout(timeout);
        
        try {
          if (code === 0) {
            // Read the text output
            const textOutput = await fs.readFile(`${outputPath}.txt`, 'utf-8');
            
            // Parse XML output for structured data
            let structuredData;
            try {
              const xmlOutput = await fs.readFile(`${outputPath}.xml`, 'utf-8');
              structuredData = await this.parseABBYYXML(xmlOutput);
            } catch (xmlError) {
              console.warn('Failed to parse ABBYY XML output:', xmlError);
            }
            
            // Calculate overall confidence from structured data
            const confidence = structuredData ? 
              structuredData.blocks.reduce((sum, block) => sum + block.confidence, 0) / structuredData.blocks.length :
              85; // Default high confidence for ABBYY
            
            const pageCount = inputType === 'pdf' ? 
              (textOutput.match(/\f/g) || []).length + 1 : 1;
            
            resolve({
              extractedText: this.cleanVietnameseText(textOutput),
              confidence,
              pageCount,
              structuredData
            });
          } else {
            console.error('❌ ABBYY processing failed with code:', code);
            console.error('❌ Error output:', stderr);
            
            // Provide specific error messages
            if (stderr.includes('license')) {
              reject(new Error('ABBYY license error. Please check license file and activation.'));
            } else if (stderr.includes('not found') || code === 127) {
              reject(new Error('ABBYY FineReader Engine not found. Please install ABBYY FineReader Engine.'));
            } else {
              reject(new Error(`ABBYY processing failed (code ${code}): ${stderr.substring(0, 200)}`));
            }
          }
        } catch (error) {
          reject(new Error(`Failed to read ABBYY output: ${error.message}`));
        }
      });
      
      process.on('error', (error) => {
        clearTimeout(timeout);
        console.error('❌ ABBYY process error:', error);
        if (error.message.includes('ENOENT')) {
          reject(new Error('ABBYY FineReader Engine executable not found. Please install ABBYY FineReader Engine.'));
        } else {
          reject(error);
        }
      });
    });
  }

  private async parseABBYYXML(xmlContent: string): Promise<ABBYYOCRResult['structuredData']> {
    // Parse ABBYY XML output to extract structured data
    // This is a simplified parser - in production, use a proper XML parser
    const blocks: any[] = [];
    const tables: any[] = [];
    
    try {
      // Extract text blocks with coordinates and confidence
      const blockRegex = /<block[^>]*confidence="([^"]*)"[^>]*>[\s\S]*?<\/block>/g;
      let blockMatch;
      
      while ((blockMatch = blockRegex.exec(xmlContent)) !== null) {
        const confidence = parseFloat(blockMatch[1]) || 0;
        const blockContent = blockMatch[0];
        
        // Extract coordinates
        const coordMatch = blockContent.match(/l="(\d+)" t="(\d+)" r="(\d+)" b="(\d+)"/);
        const coordinates = coordMatch ? {
          x: parseInt(coordMatch[1]),
          y: parseInt(coordMatch[2]),
          width: parseInt(coordMatch[3]) - parseInt(coordMatch[1]),
          height: parseInt(coordMatch[4]) - parseInt(coordMatch[2])
        } : { x: 0, y: 0, width: 0, height: 0 };
        
        // Extract text content
        const textMatch = blockContent.match(/<text[^>]*>([\s\S]*?)<\/text>/);
        const text = textMatch ? textMatch[1].replace(/<[^>]+>/g, '') : '';
        
        blocks.push({
          text: text.trim(),
          confidence,
          coordinates,
          type: 'text' as const
        });
      }
      
      // Extract tables
      const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/g;
      let tableMatch;
      
      while ((tableMatch = tableRegex.exec(xmlContent)) !== null) {
        const tableContent = tableMatch[1];
        const rows: string[][] = [];
        
        const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
        let rowMatch;
        
        while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
          const rowContent = rowMatch[1];
          const cells: string[] = [];
          
          const cellRegex = /<cell[^>]*>([\s\S]*?)<\/cell>/g;
          let cellMatch;
          
          while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            const cellText = cellMatch[1].replace(/<[^>]+>/g, '').trim();
            cells.push(cellText);
          }
          
          if (cells.length > 0) {
            rows.push(cells);
          }
        }
        
        if (rows.length > 0) {
          tables.push({
            rows,
            confidence: 90 // Default confidence for tables
          });
        }
      }
      
      return {
        blocks,
        tables: tables.length > 0 ? tables : undefined,
        metadata: {
          language: 'vie',
          orientation: 0,
          skew: 0
        }
      };
    } catch (error) {
      console.warn('Failed to parse ABBYY XML structure:', error);
      return {
        blocks: [{
          text: xmlContent.replace(/<[^>]+>/g, ''),
          confidence: 85,
          coordinates: { x: 0, y: 0, width: 0, height: 0 },
          type: 'text'
        }],
        metadata: {
          language: 'vie',
          orientation: 0,
          skew: 0
        }
      };
    }
  }

  private async cleanupTempFiles(basePath: string): Promise<void> {
    try {
      const filesToClean = [
        `${basePath}.txt`,
        `${basePath}.xml`,
        `${basePath}.pdf`,
        `${basePath}.docx`
      ];
      
      for (const file of filesToClean) {
        await fs.unlink(file).catch(() => {}); // Ignore errors
      }
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  }

  private cleanVietnameseText(text: string): string {
    if (!text) return '';
    
    // Enhanced Vietnamese text cleaning
    return text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[^\w\sÀ-ỹ.,;:!?()"-]/g, '')  // Keep Vietnamese characters and punctuation
      .replace(/\f/g, '\n\n')  // Convert form feeds to paragraph breaks
      .trim();
  }

  // Health check method
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const abbyyExecutable = path.join(this.config.enginePath!, 'FREngine12');
      
      // Check if ABBYY executable exists
      try {
        await fs.access(abbyyExecutable);
      } catch (execError) {
        return {
          status: 'unhealthy',
          details: {
            engine_available: false,
            license_file_exists: false,
            error: 'ABBYY FineReader Engine not installed',
            installation_guide: 'Run: sudo ./install-abbyy.sh to install ABBYY FineReader Engine'
          }
        };
      }
      
      // Check if license file exists
      try {
        await fs.access(this.config.licenseFile!);
      } catch (licenseError) {
        return {
          status: 'unhealthy',
          details: {
            engine_available: true,
            license_file_exists: false,
            error: 'ABBYY license file missing',
            license_path: this.config.licenseFile,
            installation_guide: 'Copy your license.xml file to the license directory'
          }
        };
      }
      
      // Test with a simple command
      return new Promise((resolve) => {
        const process = spawn(abbyyExecutable, ['--version'], { timeout: 5000 });
        
        process.on('close', (code) => {
          if (code === 0) {
            resolve({
              status: 'healthy',
              details: {
                engine_available: true,
                license_file_exists: true,
                version_check: 'passed',
                languages: this.config.languages,
                config: this.config.processingParams
              }
            });
          } else {
            resolve({
              status: 'warning',
              details: {
                engine_available: true,
                license_file_exists: true,
                version_check: 'failed',
                error: 'Version check failed'
              }
            });
          }
        });
        
        process.on('error', () => {
          resolve({
            status: 'unhealthy',
            details: {
              engine_available: false,
              license_file_exists: true,
              error: 'Cannot execute ABBYY engine'
            }
          });
        });
      });
      
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          engine_available: false,
          license_file_exists: false,
          error: `ABBYY setup error: ${error.message}`,
          installation_guide: 'ABBYY FineReader Engine requires manual installation and licensing'
        }
      };
    }
  }
}

export const abbyyOCRProcessor = new ABBYYOCRProcessor();
