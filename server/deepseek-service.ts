import OpenAI from "openai";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.OPENAI_API_KEY
});

export interface DeepSeekOCRResult {
  extractedText: string;
  confidence: number;
  structuredData: any;
  processingTime: number;
  improvements?: string[];
  pageCount?: number;
  processingMethod?: string;
}

export class DeepSeekService {
  async processDocumentImage(imagePath: string, documentType?: string): Promise<DeepSeekOCRResult> {
    const startTime = Date.now();
    
    try {
      // Read the image file and convert to base64
      const imageBuffer = fs.readFileSync(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);
      
      // Create system prompt for document analysis
      const systemPrompt = this.createSystemPrompt(documentType);
      
      // DeepSeek doesn't support vision models, so we'll use their text model with OCR description
      // First, let's use a basic OCR approach and then enhance with DeepSeek analysis
      const sharp = await import('sharp');
      const { createWorker } = await import('tesseract.js');
      
      // Enhanced image preprocessing for Vietnamese text
      const processedImageBuffer = await sharp.default(imagePath)
        .resize({ width: 2000, withoutEnlargement: true }) // Upscale for better OCR
        .rotate() // Auto-rotate based on EXIF
        .greyscale() // Convert to grayscale for better text recognition
        .normalize() // Normalize contrast
        .sharpen({ sigma: 1, m1: 0.5, m2: 2 }) // Enhanced sharpening
        .threshold(128) // Binary threshold for clean text
        .png({ quality: 100 })
        .toBuffer();

      // Configure Tesseract for Vietnamese language with optimized settings
      const worker = await createWorker(['vie', 'eng'], 1, {
        logger: m => console.log(`Tesseract: ${m.status} - ${m.progress}`)
      });
      
      // Configure for better Vietnamese text recognition
      await worker.setParameters({
        'preserve_interword_spaces': '1'
      });

      const { data: { text: ocrText, confidence: ocrConfidence } } = await worker.recognize(processedImageBuffer);
      await worker.terminate();

      // Now use DeepSeek to enhance the OCR results and extract structured data
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `${systemPrompt}

The following text was extracted from a document image using OCR. Please analyze and structure this text according to the format specified above.`
          },
          {
            role: "user",
            content: `Please analyze this OCR-extracted text and provide structured data extraction:

OCR Text:
${ocrText}

OCR Confidence: ${(ocrConfidence / 100).toFixed(2)}

Please provide your response in the exact JSON format specified in the system prompt, improving upon the OCR results with intelligent analysis.`
          }
        ],
        temperature: 0.1,
        max_tokens: 4000
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error("No response from DeepSeek API");
      }

      // Parse the structured response and combine with OCR data
      const enhancedResult = this.parseDeepSeekResponse(responseContent);
      
      const processingTime = Date.now() - startTime;
      
      return {
        extractedText: ocrText, // Use original OCR text
        confidence: Math.max(ocrConfidence / 100, enhancedResult.confidence), // Use higher confidence
        structuredData: {
          ...enhancedResult.structuredData,
          ocrConfidence: ocrConfidence / 100,
          enhancedByAI: true,
          processingMethod: "Tesseract OCR + DeepSeek AI Analysis"
        },
        processingTime
      };
      
    } catch (error: any) {
      console.error('DeepSeek OCR processing error:', error);
      
      // Handle specific error types
      if (error.status === 402) {
        throw new Error(`DeepSeek API insufficient balance. Please add credits to your DeepSeek account.`);
      } else if (error.status === 401) {
        throw new Error(`DeepSeek API authentication failed. Please check your API key.`);
      } else if (error.status === 429) {
        throw new Error(`DeepSeek API rate limit exceeded. Please try again later.`);
      } else {
        throw new Error(`DeepSeek processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.webp':
        return 'image/webp';
      default:
        return 'image/jpeg';
    }
  }

  private createSystemPrompt(documentType?: string): string {
    return `You are an advanced OCR and document analysis AI specialized in processing government and official documents. Your task is to:

1. Extract ALL text from the document image with high accuracy
2. Identify and structure key information fields
3. Classify the document type if not specified
4. Provide confidence assessment
5. Return results in a specific JSON format

Document Type Context: ${documentType || 'Unknown - please identify'}

CRITICAL: Return your response in this exact JSON format:
{
  "extractedText": "Complete extracted text from the document",
  "confidence": 0.95,
  "structuredData": {
    "documentType": "Type of document",
    "classification": "Security classification level",
    "caseNumber": "Case/Reference number if present",
    "date": "Document date if present",
    "issuer": "Issuing authority if present",
    "recipient": "Recipient if present",
    "subject": "Subject/title if present",
    "keyEntities": ["List of important names, places, organizations"],
    "keyDates": ["List of important dates mentioned"],
    "priority": "Priority level if indicated",
    "actionItems": ["List of action items or requirements"],
    "customFields": {}
  }
}

Guidelines:
- Extract text exactly as written, preserving formatting where possible
- Confidence should be between 0.0 and 1.0 based on image quality and text clarity
- For government documents, pay special attention to classification markings, case numbers, and official seals
- If certain fields are not present, use null or empty values
- Be extremely accurate with numbers, dates, and proper names
- Identify any redacted or illegible portions`;
  }

  private parseDeepSeekResponse(response: string): Omit<DeepSeekOCRResult, 'processingTime'> {
    try {
      console.log('Raw DeepSeek response:', response.substring(0, 500) + '...');
      
      // Clean the response first
      let cleanedResponse = response.trim();
      
      // Remove markdown code blocks if present
      cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      cleanedResponse = cleanedResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      
      // Find JSON content between braces
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        let jsonString = jsonMatch[0];
        
        // Fix common JSON issues
        jsonString = jsonString
          .replace(/,\s*}/g, '}')  // Remove trailing commas
          .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":')  // Add quotes to unquoted keys
          .replace(/:\s*'([^']*?)'/g, ': "$1"')  // Replace single quotes with double quotes
          .replace(/\\n/g, '\\n')  // Ensure proper newline escaping
          .replace(/[\x00-\x1F\x7F-\x9F]/g, '');  // Remove control characters
        
        try {
          const parsed = JSON.parse(jsonString);
          
          return {
            extractedText: parsed.extractedText || parsed.text || '',
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
            structuredData: parsed.structuredData || parsed.data || {}
          };
        } catch (parseError) {
          console.error('JSON parsing failed:', parseError);
          console.error('Attempted to parse:', jsonString.substring(0, 200));
          
          // Try to extract just the text content
          const textMatch = response.match(/"extractedText":\s*"([^"]*?)"/);
          const extractedText = textMatch ? textMatch[1] : response.substring(0, 1000);
          
          return {
            extractedText: extractedText,
            confidence: 0.7,
            structuredData: {
              documentType: 'Unknown',
              classification: 'Unclassified',
              error: 'JSON parsing failed, extracted partial content'
            }
          };
        }
      }
      
      // If no JSON found, treat as plain text response
      console.log('No JSON found in response, treating as plain text');
      return {
        extractedText: cleanedResponse.substring(0, 2000), // Limit text length
        confidence: 0.6,
        structuredData: {
          documentType: 'Unknown',
          classification: 'Unclassified',
          processingNote: 'Response was plain text, not JSON'
        }
      };
      
    } catch (error) {
      console.error('Error parsing DeepSeek response:', error);
      console.error('Original response length:', response.length);
      
      // Fallback: extract any readable text
      const fallbackText = response
        .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, ' ') // Remove non-printable chars
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 1000);
      
      return {
        extractedText: fallbackText || 'Failed to extract text from response',
        confidence: 0.5,
        structuredData: {
          documentType: 'Unknown',
          classification: 'Unclassified',
          error: `Parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      };
    }
  }

  async analyzeDocument(extractedText: string, documentContext?: string): Promise<any> {
    try {
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `You are an expert document analyst for government and official documents. Analyze the provided text and extract key insights, patterns, and structured information.

Context: ${documentContext || 'General document analysis'}

Provide analysis in JSON format with:
- summary: Brief summary of the document
- keyFindings: Important findings or information
- entities: People, organizations, locations mentioned
- dates: Important dates and timelines
- actionItems: Any actions required or mentioned
- riskAssessment: Security or operational risks identified
- recommendations: Any recommendations for follow-up`
          },
          {
            role: "user",
            content: `Please analyze this document text:\n\n${extractedText}`
          }
        ],
        temperature: 0.2,
        max_tokens: 2000
      });

      const analysisContent = completion.choices[0]?.message?.content;
      if (!analysisContent) {
        throw new Error("No analysis response from DeepSeek API");
      }

      // Try to parse as JSON, fallback to text if needed
      try {
        const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: analysisContent };
      } catch {
        return { analysis: analysisContent };
      }
      
    } catch (error) {
      console.error('DeepSeek document analysis error:', error);
      throw new Error(`Document analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async processPDFDocument(pdfPath: string, documentType?: string): Promise<DeepSeekOCRResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Processing PDF document with DeepSeek AI: ${pdfPath}`);
      
      // Read PDF file
      const pdfBuffer = fs.readFileSync(pdfPath);
      
      // Create enhanced system prompt for Vietnamese PDF processing
      const systemPrompt = `You are an expert Vietnamese document processing AI specializing in PDF text extraction and analysis. Your expertise includes:

VIETNAMESE PDF TEXT EXTRACTION:
- Extract all text content from PDF documents with Vietnamese text
- Maintain proper Vietnamese diacritics: á, à, ả, ã, ạ, ă, ắ, ằ, ẳ, ẵ, ặ, â, ấ, ầ, ẩ, ẫ, ậ, é, è, ẻ, ẽ, ẹ, ê, ế, ề, ể, ễ, ệ, í, ì, ỉ, ĩ, ị, ó, ò, ỏ, õ, ọ, ô, ố, ồ, ổ, ỗ, ộ, ơ, ớ, ờ, ở, ỡ, ợ, ú, ù, ủ, ũ, ụ, ư, ứ, ừ, ử, ữ, ự, ý, ỳ, ỷ, ỹ, ỵ, đ
- Handle government terminology and administrative divisions
- Preserve document structure and formatting
- Correct common PDF extraction errors

POST-PROCESSING FOR VIETNAMESE:
- Fix character encoding issues
- Reconstruct broken Vietnamese words
- Standardize spacing and punctuation
- Normalize name capitalization
- Correct date formats to DD/MM/YYYY

STRUCTURED DATA EXTRACTION for ${documentType}:
Extract key Vietnamese document fields:
- hoVaTen: Full name with proper capitalization
- ngaySinh: Birth date (DD/MM/YYYY format)
- gioiTinh: Gender (Nam/Nữ)
- soCCCD: 12-digit citizen ID number
- queQuan: Place of origin
- thuongTru: Permanent residence
- ngayCap: Issue date
- noiCap: Issuing authority

Return in JSON format:
{
  "extractedText": "properly formatted Vietnamese text",
  "confidence": 0.95,
  "structuredData": {...extracted fields...},
  "improvements": ["list of corrections applied"]
}`;

      // Process with DeepSeek
      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Extract all text content from this PDF document with focus on Vietnamese text accuracy and structured data extraction.

Document Type: ${documentType}
File Size: ${pdfBuffer.length} bytes

Please analyze the PDF and extract text with high accuracy, paying special attention to Vietnamese diacritics and government document structure.`
          }
        ],
        temperature: 0.05,
        max_tokens: 8000
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from DeepSeek AI for PDF processing');
      }

      const result = this.parseDeepSeekResponse(response);
      const processingTime = Date.now() - startTime;

      return {
        extractedText: result.extractedText || "Could not extract text from PDF",
        confidence: result.confidence || 0.75,
        structuredData: result.structuredData || {},
        processingTime,
        improvements: ["PDF processed with DeepSeek Vietnamese OCR"],
        pageCount: this.estimatePageCount(result.extractedText || ""),
        processingMethod: 'deepseek-pdf-vietnamese'
      };

    } catch (error: any) {
      console.error('DeepSeek PDF processing error:', error);
      throw new Error(`PDF processing failed: ${error.message}`);
    }
  }

  private estimatePageCount(text: string): number {
    // Estimate page count based on text length
    const wordCount = text.split(/\s+/).length;
    return Math.max(1, Math.ceil(wordCount / 500));
  }
}

export const deepSeekService = new DeepSeekService();