import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { enhancedTesseractProcessor } from './enhanced-tesseract-processor';

interface OCRResult {
  platform: 'abbyy' | 'tesseract';
  extractedText: string;
  confidence: number;
  processingTime: number;
  success: boolean;
  error?: string;
  metadata?: any;
}

interface ParallelOCRResult {
  combinedText: string;
  bestResult: OCRResult;
  allResults: OCRResult[];
  processingTime: number;
  confidence: number;
  metadata: {
    platforms: string[];
    agreement: number;
    recommendedPlatform: string;
  };
}

class ParallelOCRProcessor {
  private tempDir = path.join(process.cwd(), 'temp');

  constructor() {
    // Ensure temp directory exists
    this.ensureTempDir();
  }

  private async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create temp directory:', error);
    }
  }

  async processDocument(filePath: string): Promise<ParallelOCRResult> {
    const startTime = Date.now();
    console.log(`🔄 Starting parallel OCR processing: ABBYY + Tesseract`);

    const results: OCRResult[] = [];

    // Run both OCR platforms in parallel
    const [abbyyResult, tesseractResult] = await Promise.allSettled([
      this.processWithABBYY(filePath),
      this.processWithTesseract(filePath)
    ]);

    // Process ABBYY result
    if (abbyyResult.status === 'fulfilled') {
      results.push(abbyyResult.value);
    } else {
      results.push({
        platform: 'abbyy',
        extractedText: '',
        confidence: 0,
        processingTime: 0,
        success: false,
        error: abbyyResult.reason?.message || 'ABBYY processing failed'
      });
    }

    // Process Tesseract result
    if (tesseractResult.status === 'fulfilled') {
      results.push(tesseractResult.value);
    } else {
      results.push({
        platform: 'tesseract',
        extractedText: '',
        confidence: 0,
        processingTime: 0,
        success: false,
        error: tesseractResult.reason?.message || 'Tesseract processing failed'
      });
    }

    const totalTime = Date.now() - startTime;

    // Analyze results and determine best output
    const analysis = this.analyzeResults(results);
    
    console.log(`✅ Parallel OCR completed in ${totalTime}ms`);
    console.log(`📊 ABBYY: ${results[0].success ? '✅' : '❌'} (${results[0].confidence}% confidence)`);
    console.log(`📊 Tesseract: ${results[1].success ? '✅' : '❌'} (${results[1].confidence}% confidence)`);
    console.log(`🏆 Best platform: ${analysis.bestResult.platform} (${analysis.bestResult.confidence}% confidence)`);

    return {
      combinedText: analysis.combinedText,
      bestResult: analysis.bestResult,
      allResults: results,
      processingTime: totalTime,
      confidence: analysis.bestResult.confidence,
      metadata: {
        platforms: results.map(r => r.platform),
        agreement: this.calculateAgreement(results),
        recommendedPlatform: analysis.bestResult.platform
      }
    };
  }

  private async processWithABBYY(filePath: string): Promise<OCRResult> {
    const startTime = Date.now();
    console.log(`🔍 Starting ABBYY OCR processing...`);

    try {
      // Check if ABBYY FineReader CLI is available
      const abbyyPath = await this.findABBYYExecutable();
      if (!abbyyPath) {
        throw new Error('ABBYY FineReader CLI not found');
      }

      const outputPath = path.join(this.tempDir, `abbyy_output_${Date.now()}.txt`);
      
      // Run ABBYY FineReader CLI
      const result = await this.runABBYYCommand(abbyyPath, filePath, outputPath);
      
      // Read the output
      let extractedText = '';
      try {
        extractedText = await fs.readFile(outputPath, 'utf-8');
        // Clean up output file
        await fs.unlink(outputPath).catch(() => {});
      } catch (error) {
        console.warn('Failed to read ABBYY output file');
      }

      const processingTime = Date.now() - startTime;
      const confidence = this.calculateABBYYConfidence(extractedText, result.confidence);

      console.log(`✅ ABBYY processing completed: ${extractedText.length} characters, ${confidence}% confidence`);

      return {
        platform: 'abbyy',
        extractedText: extractedText.trim(),
        confidence,
        processingTime,
        success: true,
        metadata: {
          charactersExtracted: extractedText.length,
          wordCount: extractedText.split(/\s+/).filter(w => w.length > 0).length
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ ABBYY processing failed:`, error);

      return {
        platform: 'abbyy',
        extractedText: '',
        confidence: 0,
        processingTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown ABBYY error'
      };
    }
  }

  private async processWithTesseract(filePath: string): Promise<OCRResult> {
    const startTime = Date.now();
    console.log(`🔍 Starting Tesseract OCR processing...`);

    try {
      // Use the existing enhanced Tesseract processor
      const result = await enhancedTesseractProcessor.processDocument(filePath);
      
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Tesseract processing completed: ${result.extractedText.length} characters, ${result.confidence}% confidence`);

      return {
        platform: 'tesseract',
        extractedText: result.extractedText,
        confidence: result.confidence,
        processingTime,
        success: true,
        metadata: {
          charactersExtracted: result.extractedText.length,
          wordCount: result.extractedText.split(/\s+/).filter(w => w.length > 0).length,
          language: (result as any).language || 'vie',
          processingMode: (result as any).processingMethod || 'tesseract'
        }
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Tesseract processing failed:`, error);

      return {
        platform: 'tesseract',
        extractedText: '',
        confidence: 0,
        processingTime,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown Tesseract error'
      };
    }
  }

  private async findABBYYExecutable(): Promise<string | null> {
    const possiblePaths = [
      '/usr/bin/finereader',
      '/usr/local/bin/finereader', 
      '/opt/abbyy/finereader/finereader',
      'C:\\Program Files\\ABBYY FineReader 15\\FineReader.exe',
      'C:\\Program Files (x86)\\ABBYY FineReader 15\\FineReader.exe',
      'finereader', // Check if it's in PATH
      'abbyy-finereader-cli'
    ];

    for (const abbyyPath of possiblePaths) {
      try {
        // Test if the executable exists and is accessible
        await this.testABBYYExecutable(abbyyPath);
        console.log(`✅ Found ABBYY executable: ${abbyyPath}`);
        return abbyyPath;
      } catch (error) {
        // Continue to next path
      }
    }

    console.warn(`⚠️ ABBYY FineReader CLI not found. Install ABBYY FineReader for enhanced OCR.`);
    return null;
  }

  private async testABBYYExecutable(executablePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(executablePath, ['--version'], { 
        stdio: 'pipe',
        timeout: 5000 
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ABBYY executable test failed with code ${code}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async runABBYYCommand(executablePath: string, inputPath: string, outputPath: string): Promise<{ confidence: number }> {
    return new Promise((resolve, reject) => {
      // ABBYY FineReader CLI command for OCR
      const args = [
        inputPath,
        '--output', outputPath,
        '--format', 'txt',
        '--language', 'Vietnamese,English',
        '--deskew', 'true',
        '--correctOrientation', 'true',
        '--removeTextFormatting', 'false'
      ];

      console.log(`🔄 Running ABBYY command: ${executablePath} ${args.join(' ')}`);

      const process = spawn(executablePath, args, { 
        stdio: 'pipe',
        timeout: 60000 // 60 second timeout
      });

      let stderr = '';
      let stdout = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          // Extract confidence from ABBYY output if available
          const confidence = this.extractABBYYConfidence(stdout, stderr);
          resolve({ confidence });
        } else {
          reject(new Error(`ABBYY process failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`ABBYY process error: ${error.message}`));
      });
    });
  }

  private extractABBYYConfidence(stdout: string, stderr: string): number {
    // Try to extract confidence from ABBYY output
    const confidenceMatch = (stdout + stderr).match(/confidence[:\s]+(\d+\.?\d*)%?/i);
    if (confidenceMatch) {
      return Math.min(100, Math.max(0, parseFloat(confidenceMatch[1])));
    }
    return 85; // Default confidence for ABBYY when not specified
  }

  private calculateABBYYConfidence(extractedText: string, reportedConfidence?: number): number {
    if (reportedConfidence) {
      return reportedConfidence;
    }

    // Calculate confidence based on text characteristics
    if (extractedText.length === 0) return 0;
    if (extractedText.length < 10) return 30;

    // Vietnamese text quality indicators
    const vietnameseChars = (extractedText.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/g) || []).length;
    const totalChars = extractedText.length;
    const vietnameseRatio = vietnameseChars / totalChars;

    let confidence = 75; // Base ABBYY confidence
    if (vietnameseRatio > 0.1) confidence += 10; // Bonus for Vietnamese content
    if (extractedText.length > 100) confidence += 5; // Bonus for substantial text

    return Math.min(95, confidence); // ABBYY typically has high confidence
  }

  private analyzeResults(results: OCRResult[]): { combinedText: string; bestResult: OCRResult } {
    const successfulResults = results.filter(r => r.success && r.extractedText.length > 0);
    
    if (successfulResults.length === 0) {
      // No successful results, return the one with least error
      const leastErrorResult = results.reduce((best, current) => 
        (!best.error || (current.error && current.error.length < best.error.length)) ? current : best
      );
      
      return {
        combinedText: '',
        bestResult: leastErrorResult
      };
    }

    // Find the best result based on confidence and text length
    const bestResult = successfulResults.reduce((best, current) => {
      const bestScore = best.confidence * Math.log(best.extractedText.length + 1);
      const currentScore = current.confidence * Math.log(current.extractedText.length + 1);
      return currentScore > bestScore ? current : best;
    });

    // Create combined text by merging results intelligently
    const combinedText = this.combineTexts(successfulResults);

    return { combinedText, bestResult };
  }

  private combineTexts(results: OCRResult[]): string {
    if (results.length === 0) return '';
    if (results.length === 1) return results[0].extractedText;

    // Use the result with highest confidence as primary
    const primary = results.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    // For now, just return the best result
    // In the future, could implement intelligent text merging
    return primary.extractedText;
  }

  private calculateAgreement(results: OCRResult[]): number {
    const successfulResults = results.filter(r => r.success && r.extractedText.length > 0);
    
    if (successfulResults.length < 2) return 100;

    // Simple agreement calculation based on text similarity
    const [first, second] = successfulResults;
    const similarity = this.calculateTextSimilarity(first.extractedText, second.extractedText);
    
    return Math.round(similarity * 100);
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 1.0;
    if (text1.length === 0 && text2.length === 0) return 1.0;
    if (text1.length === 0 || text2.length === 0) return 0.0;

    // Simple Jaccard similarity on words
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set(Array.from(words1).filter(word => words2.has(word)));
    const union = new Set([...Array.from(words1), ...Array.from(words2)]);
    
    return intersection.size / union.size;
  }
}

export const parallelOCRProcessor = new ParallelOCRProcessor();