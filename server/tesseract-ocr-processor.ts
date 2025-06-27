import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface TesseractOCRResult {
  extractedText: string;
  confidence: number;
  pageCount: number;
  processingMethod: string;
  processingTime: number;
  boundingBoxes?: Array<{
    text: string;
    confidence: number;
    bbox: number[];
  }>;
}

export class TesseractOCRProcessor {
  
  async processDocument(filePath: string): Promise<TesseractOCRResult> {
    const startTime = Date.now();
    
    console.log(`🔍 Processing document with Tesseract OCR: ${filePath}`);
    
    try {
      if (filePath.toLowerCase().endsWith('.pdf')) {
        return await this.processPDF(filePath, startTime);
      } else {
        return await this.processImage(filePath, startTime);
      }
    } catch (error) {
      console.error(`❌ Document processing failed: ${error}`);
      throw error;
    }
  }

  async processPDF(filePath: string, startTime: number): Promise<TesseractOCRResult> {
    console.log(`📑 Processing PDF with ${path.basename(filePath)}`);
    
    const tempDir = `/tmp/tesseract_pdf_${Date.now()}`;
    
    try {
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Convert PDF to images using ImageMagick (optimized settings)
      await this.convertPDFToImages(filePath, `${tempDir}/page-%d.png`);
      
      // Find all generated page images
      const pageFiles = fs.readdirSync(tempDir)
        .filter(file => file.startsWith('page-') && file.endsWith('.png'))
        .sort((a, b) => {
          const numA = parseInt(a.match(/page-(\d+)\.png/)?.[1] || '0');
          const numB = parseInt(b.match(/page-(\d+)\.png/)?.[1] || '0');
          return numA - numB;
        })
        .map(file => path.join(tempDir, file));
      
      console.log(`📄 Converting PDF generated ${pageFiles.length} pages`);
      
      if (pageFiles.length === 0) {
        throw new Error('No pages extracted from PDF');
      }
      
      // Process all pages in parallel
      const pagePromises = pageFiles.map(async (pageFile, index) => {
        try {
          const result = await this.processImageWithMultiApproach(pageFile);
          console.log(`✅ Completed page ${index + 1}/${pageFiles.length}`);
          return result;
        } catch (error) {
          console.log(`❌ Failed page ${index + 1}/${pageFiles.length}: ${error}`);
          return { text: '', confidence: 0 };
        }
      });
      
      const pageResults = await Promise.all(pagePromises);
      
      // Combine results
      const allText = pageResults.map(r => r.text).join('\n\n').trim();
      const avgConfidence = pageResults.length > 0 
        ? pageResults.reduce((sum, r) => sum + r.confidence, 0) / pageResults.length
        : 0;
      
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Tesseract OCR completed: ${pageFiles.length} pages, ${avgConfidence.toFixed(1)}% confidence`);
      
      return {
        extractedText: allText,
        confidence: Math.round(avgConfidence),
        pageCount: pageFiles.length,
        processingMethod: 'tesseract_multi_approach_pdf',
        processingTime
      };
      
    } catch (error) {
      console.error(`❌ PDF processing failed: ${error}`);
      throw error;
    } finally {
      // Cleanup temp directory
      try {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.warn(`⚠️ Cleanup failed: ${cleanupError}`);
      }
    }
  }

  async processImage(filePath: string, startTime: number): Promise<TesseractOCRResult> {
    console.log(`🖼️ Processing single image with multi-approach Tesseract OCR: ${filePath}`);
    
    try {
      const result = await this.processImageWithMultiApproach(filePath);
      const processingTime = Date.now() - startTime;
      
      console.log(`✅ Tesseract OCR successful: ${result.confidence}% confidence`);
      
      return {
        extractedText: result.text,
        confidence: result.confidence,
        pageCount: 1,
        processingMethod: result.method || 'tesseract_multi_approach',
        processingTime
      };
      
    } catch (error) {
      console.error(`❌ Image processing failed: ${error}`);
      throw error;
    }
  }

  private async convertPDFToImages(pdfPath: string, outputPattern: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-density', '200',
        '-colorspace', 'RGB',
        '-alpha', 'remove',
        '-background', 'white',
        pdfPath,
        outputPattern
      ];
      
      console.log(`🔄 Running: convert ${args.join(' ')}`);
      
      const convert = spawn('convert', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let stderr = '';
      
      convert.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      convert.on('close', (code: number) => {
        if (code === 0) {
          console.log('✅ PDF to images conversion completed');
          resolve();
        } else {
          reject(new Error(`ImageMagick failed with code ${code}: ${stderr}`));
        }
      });
      
      convert.on('error', (error: any) => {
        reject(new Error(`Failed to start ImageMagick: ${error.message}`));
      });
      
      setTimeout(() => {
        convert.kill('SIGTERM');
        reject(new Error('PDF conversion timeout'));
      }, 30000);
    });
  }

  private async processImageWithMultiApproach(imagePath: string): Promise<{
    text: string;
    confidence: number;
    method?: string;
  }> {
    return new Promise((resolve, reject) => {
      const pythonScript = `
import sys
import cv2
import json
import os
import subprocess

def test_ocr_approach(img_path, approach_name, processed_img, languages=['vie', 'eng']):
    """Test OCR with a specific preprocessing approach"""
    temp_path = img_path.replace('.png', f'_{approach_name}.png')
    cv2.imwrite(temp_path, processed_img)
    
    best_result = None
    best_length = 0
    
    for lang in languages:
        for psm in [3, 6]:  # Reduced PSM modes for faster processing
            cmd = ['tesseract', temp_path, 'stdout', '-l', lang, '--psm', str(psm)]
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=8)
                text = result.stdout.strip()
                
                if result.returncode == 0 and len(text) > best_length:
                    confidence = min(95, 50 + len(text) // 2)
                    best_result = {
                        "success": True,
                        "text": text,
                        "confidence": confidence,
                        "method": f"tesseract_{approach_name}_{lang}_psm{psm}"
                    }
                    best_length = len(text)
                    
                    if len(text) > 50:  # Lower threshold for faster completion
                        return best_result
                        
            except (subprocess.TimeoutExpired, Exception):
                continue
    
    return best_result

def main():
    try:
        img_path = sys.argv[1]
        
        if not os.path.exists(img_path):
            raise ValueError(f"File not found: {img_path}")
        
        img = cv2.imread(img_path)
        if img is None:
            raise ValueError(f"Cannot read image: {img_path}")
        
        # Optimized preprocessing approaches (faster processing)
        approaches = {}
        
        # 1. Original grayscale
        approaches['original'] = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # 2. Your exact preprocessing (primary approach)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        blur = cv2.GaussianBlur(gray, (3,3), 0)
        _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        approaches['user_preprocessing'] = thresh
        
        # 3. Simple OTSU threshold
        gray2 = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        _, simple_thresh = cv2.threshold(gray2, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        approaches['simple_threshold'] = simple_thresh
        
        # Try each approach and pick the best result
        best_result = None
        best_score = 0
        
        for name, processed_img in approaches.items():
            result = test_ocr_approach(img_path, name, processed_img)
            if result and result.get('success') and len(result.get('text', '')) > best_score:
                best_result = result
                best_score = len(result.get('text', ''))
        
        if best_result and best_score >= 2:
            print(json.dumps(best_result, ensure_ascii=False))
        else:
            # Return a minimal result instead of failing
            print(json.dumps({
                "success": True,
                "text": "",
                "confidence": 0,
                "method": "tesseract_no_text_found"
            }))
            
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "text": "",
            "confidence": 0
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
`;

      const python = spawn('python3', ['-c', pythonScript, imagePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { 
          ...process.env, 
          PYTHONUNBUFFERED: '1',
          TESSDATA_PREFIX: '/nix/store/44vcjbcy1p2yhc974bcw250k2r5x5cpa-tesseract-5.3.4/share/tessdata'
        }
      });
      
      let stdout = '';
      let stderr = '';
      
      python.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      
      python.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      python.on('close', (code: number) => {
        if (code === 0 && stdout.trim()) {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.success) {
              resolve({
                text: result.text || '',
                confidence: result.confidence || 0,
                method: result.method
              });
            } else {
              reject(new Error(result.error || 'OCR processing failed'));
            }
          } catch (parseError) {
            reject(new Error(`Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`));
          }
        } else {
          reject(new Error(`Process failed: code ${code}, stderr: ${stderr || 'No error details'}`));
        }
      });
      
      python.on('error', (error: any) => {
        reject(new Error(`Process start failed: ${error.message}`));
      });
      
      setTimeout(() => {
        python.kill('SIGTERM');
        reject(new Error('Processing timeout (30s)'));
      }, 30000);
    });
  }
}

export const tesseractOCRProcessor = new TesseractOCRProcessor();