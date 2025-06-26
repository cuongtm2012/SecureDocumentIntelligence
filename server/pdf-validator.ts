import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PDFValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fileSize: number;
  hasText: boolean;
  pageCount: number;
  repairAttempted: boolean;
  repairedFilePath?: string;
  metadata: {
    version?: string;
    encrypted: boolean;
    hasImages: boolean;
    hasOCRText: boolean;
  };
}

export interface PDFRepairOptions {
  enableQPDFRepair: boolean;
  enableGhostscriptRepair: boolean;
  removeInvalidCharacters: boolean;
  fixStructure: boolean;
  optimizeForOCR: boolean;
}

export class PDFValidator {
  
  /**
   * 1. Verify if the PDF file is valid and not corrupted
   */
  async validatePDF(filePath: string): Promise<PDFValidationResult> {
    const result: PDFValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
      fileSize: 0,
      hasText: false,
      pageCount: 0,
      repairAttempted: false,
      metadata: {
        encrypted: false,
        hasImages: false,
        hasOCRText: false
      }
    };

    try {
      // Check if file exists and get basic info
      const stats = await fs.stat(filePath);
      result.fileSize = stats.size;

      if (result.fileSize === 0) {
        result.errors.push('PDF file is empty');
        return result;
      }

      if (result.fileSize > 100 * 1024 * 1024) { // 100MB limit
        result.warnings.push('PDF file is very large, processing may be slow');
      }

      // Read file header to check if it's a valid PDF
      const buffer = await fs.readFile(filePath);
      const headerCheck = this.validatePDFHeader(buffer);
      if (!headerCheck.isValid) {
        result.errors.push(...headerCheck.errors);
        return result;
      }

      // Use pdf-parse for basic validation
      try {
        const pdf = await import('pdf-parse');
        const data = await pdf.default(buffer, {
          normalizeWhitespace: false,
          disableCombineTextItems: true
        });

        result.pageCount = data.numpages || 0;
        result.hasText = data.text.trim().length > 0;
        result.metadata.hasOCRText = this.detectOCRText(data.text);
        result.isValid = true;

        if (result.pageCount === 0) {
          result.warnings.push('PDF has no pages');
        }

      } catch (parseError: any) {
        result.errors.push(`PDF parsing failed: ${parseError.message}`);
        
        // Try to get more specific error information
        if (parseError.message.includes('Invalid PDF structure')) {
          result.errors.push('PDF has invalid internal structure');
        }
        if (parseError.message.includes('getHexString')) {
          result.errors.push('PDF contains invalid hexadecimal characters');
        }
        if (parseError.message.includes('stream')) {
          result.errors.push('PDF has corrupted data streams');
        }
      }

      // Additional validation using file signature
      const signatureCheck = this.validatePDFSignature(buffer);
      if (!signatureCheck.isValid) {
        result.warnings.push(...signatureCheck.warnings);
      }

      // Check for encryption
      result.metadata.encrypted = this.checkPDFEncryption(buffer);
      if (result.metadata.encrypted) {
        result.warnings.push('PDF is encrypted or password protected');
      }

      // Detect potential OCR content
      result.metadata.hasImages = this.detectImages(buffer);

    } catch (error: any) {
      result.errors.push(`Validation failed: ${error.message}`);
    }

    return result;
  }

  /**
   * 2. Repair or sanitize the PDF file to make it compatible with pdf.js
   */
  async repairPDF(filePath: string, options: PDFRepairOptions = {
    enableQPDFRepair: true,
    enableGhostscriptRepair: true,
    removeInvalidCharacters: true,
    fixStructure: true,
    optimizeForOCR: false
  }): Promise<string> {
    const fileName = path.basename(filePath, '.pdf');
    const dirName = path.dirname(filePath);
    const repairedPath = path.join(dirName, `${fileName}_repaired.pdf`);

    console.log('🔧 Attempting to repair PDF:', filePath);

    try {
      // Method 1: Try QPDF repair (if available)
      if (options.enableQPDFRepair) {
        try {
          await this.repairWithQPDF(filePath, repairedPath);
          console.log('✅ PDF repaired with QPDF');
          return repairedPath;
        } catch (qpdfError) {
          console.log('⚠️ QPDF repair failed, trying next method');
        }
      }

      // Method 2: Try Ghostscript repair (if available)
      if (options.enableGhostscriptRepair) {
        try {
          await this.repairWithGhostscript(filePath, repairedPath, options.optimizeForOCR);
          console.log('✅ PDF repaired with Ghostscript');
          return repairedPath;
        } catch (gsError) {
          console.log('⚠️ Ghostscript repair failed, trying manual repair');
        }
      }

      // Method 3: Manual repair (always available)
      if (options.removeInvalidCharacters || options.fixStructure) {
        await this.manualRepair(filePath, repairedPath, options);
        console.log('✅ PDF manually repaired');
        return repairedPath;
      }

    } catch (error: any) {
      console.error('❌ All repair methods failed:', error.message);
      throw new Error(`PDF repair failed: ${error.message}`);
    }

    throw new Error('No repair methods enabled or available');
  }

  /**
   * 3. Handle or bypass invalid characters or corrupted streams in PDF parsing
   */
  async sanitizePDFForParsing(filePath: string): Promise<Buffer> {
    try {
      const buffer = await fs.readFile(filePath);
      let sanitizedBuffer = Buffer.from(buffer);

      // Remove null bytes
      sanitizedBuffer = Buffer.from(sanitizedBuffer.toString('binary').replace(/\x00/g, ''), 'binary');

      // Fix common invalid hex characters
      let content = sanitizedBuffer.toString('binary');
      
      // Replace invalid hex sequences
      content = content.replace(/[^0-9A-Fa-f\s<>]/g, (match, offset) => {
        // Only replace if it's in a hex string context
        const before = content.substring(Math.max(0, offset - 10), offset);
        const after = content.substring(offset + 1, Math.min(content.length, offset + 11));
        
        if (before.includes('<') && after.includes('>')) {
          return '20'; // Replace with space character in hex
        }
        return match;
      });

      // Fix malformed stream objects
      content = content.replace(/stream\s*\n([^]*?)\s*endstream/g, (match, streamContent) => {
        // Clean up stream content
        const cleanStream = streamContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        return `stream\n${cleanStream}\nendstream`;
      });

      // Fix trailer dictionary
      if (!content.includes('trailer')) {
        console.log('⚠️ PDF missing trailer, adding basic trailer');
        content += '\ntrailer\n<<\n>>\nstartxref\n0\n%%EOF\n';
      }

      // Ensure proper PDF ending
      if (!content.trim().endsWith('%%EOF')) {
        content = content.trim() + '\n%%EOF';
      }

      return Buffer.from(content, 'binary');

    } catch (error: any) {
      console.error('❌ PDF sanitization failed:', error.message);
      throw new Error(`PDF sanitization failed: ${error.message}`);
    }
  }

  /**
   * 4. Debug or log more detailed info to identify the source of PDF structure error
   */
  async debugPDFStructure(filePath: string): Promise<{
    analysis: string;
    recommendations: string[];
    technicalDetails: any;
  }> {
    const debug = {
      analysis: '',
      recommendations: [],
      technicalDetails: {}
    };

    try {
      const buffer = await fs.readFile(filePath);
      const stats = await fs.stat(filePath);

      // Basic file analysis
      debug.technicalDetails = {
        fileSize: stats.size,
        firstBytes: buffer.slice(0, 100).toString(),
        lastBytes: buffer.slice(-100).toString(),
        hasValidHeader: buffer.toString().startsWith('%PDF-'),
        hasValidTrailer: buffer.toString().includes('%%EOF'),
        pdfVersion: this.extractPDFVersion(buffer),
        objectCount: this.countPDFObjects(buffer),
        streamCount: this.countPDFStreams(buffer),
        hasXRefTable: buffer.toString().includes('xref'),
        hasTrailer: buffer.toString().includes('trailer')
      };

      // Generate analysis
      debug.analysis = this.generateStructuralAnalysis(debug.technicalDetails);
      debug.recommendations = this.generateRepairRecommendations(debug.technicalDetails);

    } catch (error: any) {
      debug.analysis = `Failed to analyze PDF structure: ${error.message}`;
      debug.recommendations = ['File may be severely corrupted', 'Try using external PDF repair tools'];
    }

    return debug;
  }

  // Private helper methods
  private validatePDFHeader(buffer: Buffer): { isValid: boolean; errors: string[] } {
    const header = buffer.slice(0, 10).toString();
    const errors: string[] = [];

    if (!header.startsWith('%PDF-')) {
      errors.push('Invalid PDF header - file does not start with %PDF-');
      return { isValid: false, errors };
    }

    const versionMatch = header.match(/%PDF-(\d+\.\d+)/);
    if (!versionMatch) {
      errors.push('Cannot determine PDF version');
    } else {
      const version = parseFloat(versionMatch[1]);
      if (version < 1.0 || version > 2.0) {
        errors.push(`Unsupported PDF version: ${version}`);
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  private validatePDFSignature(buffer: Buffer): { isValid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const content = buffer.toString('binary');

    if (!content.includes('%%EOF')) {
      warnings.push('PDF missing proper end-of-file marker');
    }

    if (!content.includes('xref')) {
      warnings.push('PDF missing cross-reference table');
    }

    if (!content.includes('trailer')) {
      warnings.push('PDF missing trailer');
    }

    return { isValid: warnings.length < 2, warnings };
  }

  private checkPDFEncryption(buffer: Buffer): boolean {
    const content = buffer.toString('binary');
    return content.includes('/Encrypt') || content.includes('/Filter');
  }

  private detectImages(buffer: Buffer): boolean {
    const content = buffer.toString('binary');
    return content.includes('/Image') || content.includes('/DCTDecode') || content.includes('/FlateDecode');
  }

  private detectOCRText(text: string): boolean {
    // OCR text often has specific patterns
    const ocrPatterns = [
      /[A-Z]{2,}\s+[A-Z]{2,}/g, // Consecutive uppercase words
      /\b\d{12}\b/g, // 12-digit numbers (like Vietnamese ID)
      /[A-ZÁĂÂÊÔƠƯ]+\s+[a-záăâêôơư]+/g // Vietnamese name patterns
    ];

    return ocrPatterns.some(pattern => pattern.test(text));
  }

  private async repairWithQPDF(inputPath: string, outputPath: string): Promise<void> {
    const command = `qpdf --linearize --object-streams=generate "${inputPath}" "${outputPath}"`;
    await execAsync(command);
  }

  private async repairWithGhostscript(inputPath: string, outputPath: string, optimizeForOCR: boolean): Promise<void> {
    const gsOptions = optimizeForOCR 
      ? '-dPDFSETTINGS=/prepress -dOptimize=true -dEmbedAllFonts=true'
      : '-dPDFSETTINGS=/default -dOptimize=true';
    
    const command = `gs -dNOPAUSE -dBATCH -sDEVICE=pdfwrite ${gsOptions} -sOutputFile="${outputPath}" "${inputPath}"`;
    await execAsync(command);
  }

  private async manualRepair(inputPath: string, outputPath: string, options: PDFRepairOptions): Promise<void> {
    const buffer = await this.sanitizePDFForParsing(inputPath);
    await fs.writeFile(outputPath, buffer);
  }

  private extractPDFVersion(buffer: Buffer): string {
    const header = buffer.slice(0, 20).toString();
    const match = header.match(/%PDF-(\d+\.\d+)/);
    return match ? match[1] : 'unknown';
  }

  private countPDFObjects(buffer: Buffer): number {
    const content = buffer.toString('binary');
    const matches = content.match(/\d+\s+\d+\s+obj/g);
    return matches ? matches.length : 0;
  }

  private countPDFStreams(buffer: Buffer): number {
    const content = buffer.toString('binary');
    const matches = content.match(/stream\s*\n/g);
    return matches ? matches.length : 0;
  }

  private generateStructuralAnalysis(details: any): string {
    let analysis = `PDF Analysis Report:\n`;
    analysis += `- File Size: ${(details.fileSize / 1024).toFixed(2)} KB\n`;
    analysis += `- PDF Version: ${details.pdfVersion}\n`;
    analysis += `- Object Count: ${details.objectCount}\n`;
    analysis += `- Stream Count: ${details.streamCount}\n`;
    analysis += `- Has Valid Header: ${details.hasValidHeader ? '✅' : '❌'}\n`;
    analysis += `- Has Valid Trailer: ${details.hasValidTrailer ? '✅' : '❌'}\n`;
    analysis += `- Has XRef Table: ${details.hasXRefTable ? '✅' : '❌'}\n`;

    if (!details.hasValidHeader) {
      analysis += `\n🚨 CRITICAL: Invalid PDF header detected`;
    }
    if (!details.hasValidTrailer) {
      analysis += `\n⚠️ WARNING: Missing or invalid trailer`;
    }
    if (!details.hasXRefTable) {
      analysis += `\n⚠️ WARNING: Missing cross-reference table`;
    }

    return analysis;
  }

  private generateRepairRecommendations(details: any): string[] {
    const recommendations: string[] = [];

    if (!details.hasValidHeader) {
      recommendations.push('Fix PDF header - file may not be a valid PDF');
    }
    if (!details.hasValidTrailer) {
      recommendations.push('Reconstruct PDF trailer and end-of-file marker');
    }
    if (!details.hasXRefTable) {
      recommendations.push('Rebuild cross-reference table');
    }
    if (details.objectCount === 0) {
      recommendations.push('PDF has no objects - file may be severely corrupted');
    }
    if (details.streamCount > 0 && details.objectCount > 0) {
      recommendations.push('Try sanitizing stream objects for invalid characters');
    }

    recommendations.push('Consider using external PDF repair tools (QPDF, Ghostscript)');
    recommendations.push('For Vietnamese OCR PDFs, try converting to images first');

    return recommendations;
  }
}

export const pdfValidator = new PDFValidator();